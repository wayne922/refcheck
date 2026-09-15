import React, { useState, useEffect, useRef } from "react";
import { 
  Check, 
  ArrowRight, 
  ArrowLeft,
  Users, 
  Mail, 
  Phone, 
  Building2,
  Calendar,
  Briefcase,
  AlertCircle,
  Play,
  Award
} from "lucide-react";
import logo from "../assets/logo.png";

interface RefereeFormProps {
  token: string;
}

interface Question {
  id: string;
  type: "short_text" | "long_text" | "rating" | "yes_no" | "multiple_choice" | "single_select" | "dropdown" | "section_heading";
  label: string;
  description: string;
  required: boolean;
  options?: string[];
  risk_rule?: { condition: string; value: string; severity: "high" | "medium" };
  branch_rules?: { condition: string; value: string; action: "show" | "hide"; targetId: string }[];
}

export function RefereeForm({ token }: RefereeFormProps) {
  const [refereeInfo, setRefereeInfo] = useState<{
    id: string;
    fullName: string;
    relationship: string;
    employerName: string;
    formStatus: string;
    answersJson?: string;
  } | null>(null);
  
  const [candidateInfo, setCandidateInfo] = useState<{
    fullName: string;
    roleAppliedFor: string;
    employerName: string;
  } | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [branchingRules, setBranchingRules] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const fetchRefereeDetails = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/referees/by-token/${token}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to retrieve reference verification details");
        }
        setRefereeInfo(data.referee);
        setCandidateInfo(data.candidate);
        setQuestions(data.questions);
        setBranchingRules(data.branchingRules || []);
        
        // Load existing answers if auto-saved before
        if (data.referee.answersJson) {
          const loadedAnswers: Record<string, any> = {};
          JSON.parse(data.referee.answersJson).forEach((ans: any) => {
            loadedAnswers[ans.id] = ans.value;
          });
          setAnswers(loadedAnswers);
        }
        
        startTimeRef.current = Date.now();
      } catch (err: any) {
        setError(err.message || "Invalid or expired questionnaire link.");
      } finally {
        setLoading(false);
      }
    };
    fetchRefereeDetails();
  }, [token]);

  // Time tracker for duration fraud check
  const startTimeRef = useRef<number>(Date.now());
  const answersRef = useRef<Record<string, any>>({});
  const questionsRef = useRef<Question[]>([]);
  const refereeInfoRef = useRef<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    refereeInfoRef.current = refereeInfo;
  }, [refereeInfo]);

  // Warn referee before closing tab if answers have been entered but not submitted
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 2 && !success && Object.keys(answersRef.current).length > 0) {
        e.preventDefault();
        e.returnValue = "You have unsubmitted reference check responses. Are you sure you want to exit?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step, success]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const triggerAutoSave = async () => {
    const currentRef = refereeInfoRef.current;
    if (!currentRef) return;
    
    const currentQuestions = questionsRef.current;
    const currentAnswers = answersRef.current;

    // Only save if at least one question has an answer
    const hasAnyAnswer = Object.values(currentAnswers).some(val => val !== undefined && val !== "");
    if (!hasAnyAnswer) return;

    const answersPayload = currentQuestions.map(q => ({
      id: q.id,
      type: q.type,
      value: currentAnswers[q.id] || ""
    }));

    setAutoSaveStatus("saving");
    try {
      await fetch(`/api/referees/${currentRef.id}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answersJson: JSON.stringify(answersPayload),
          isSubmit: false
        })
      });
      console.log("[Auto-save] Progress saved successfully.");
      setAutoSaveStatus("saved");
      setTimeout(() => {
        setAutoSaveStatus(prev => (prev === "saved" ? "idle" : prev));
      }, 4000);
    } catch (err) {
      console.warn("Auto-save failed in background", err);
      setAutoSaveStatus("error");
    }
  };

  const handleUpdateAnswer = (questionId: string, value: any) => {
    setAnswers(prev => {
      const updated = { ...prev, [questionId]: value };
      answersRef.current = updated;
      return updated;
    });

    // Debounce auto-save: saves 2.5s after the referee stops typing
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      triggerAutoSave();
    }, 2500);
  };

  const handleNextStep = () => {
    setError("");
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setError("");
    setStep(step - 1);
  };

  // Branching Evaluation Engine
  // Checks if a question should be shown based on logic rules
  const isQuestionVisible = (qId: string) => {
    // Find if there is any rule in the template targeting this question
    // If no branching rules exist or target is not mapped, default to visible
    const targetingRules = branchingRules.filter((r: any) => r.target_question_id === qId || r.targetId === qId);
    if (targetingRules.length === 0) return true;

    // Check if any rules are satisfied
    for (const rule of targetingRules) {
      const sourceVal = answers[rule.source_question_id || rule.sourceId];
      if (sourceVal === undefined) continue;

      if (rule.condition === "equals" && String(sourceVal) === String(rule.value)) {
        return rule.action === "show";
      }
      if (rule.condition === "does_not_equal" && String(sourceVal) !== String(rule.value)) {
        return rule.action === "show";
      }
    }
    
    // If rules target it but none are satisfied, hide it
    return false;
  };

  const handleSubmitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refereeInfo || !candidateInfo) return;

    // Check required questions
    for (const q of questions) {
      if (q.required && isQuestionVisible(q.id)) {
        const val = answers[q.id];
        if (val === undefined || val === "") {
          setError(`Please answer the required question: "${q.label}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    setError("");

    const answersPayload = questions
      .filter(q => isQuestionVisible(q.id))
      .map(q => ({
        id: q.id,
        type: q.type,
        value: answers[q.id] || ""
      }));

    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    try {
      const response = await fetch(`/api/referees/${refereeInfo.id}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answersJson: JSON.stringify(answersPayload),
          submissionDurationSeconds: durationSeconds,
          isSubmit: true
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit questionnaire");
      }
      setSuccess(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    } catch (err: any) {
      setError(err.message || "An error occurred during submission.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="text-center text-muted-foreground text-sm font-medium">
          Loading reference questionnaire, please wait...
        </div>
      </div>
    );
  }

  if (error && step === 1 && !refereeInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-lg text-center hover-scale">
          <div className="bg-destructive/10 text-destructive w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-foreground mb-2">Link Invalid or Expired</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">{error}</p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            Please contact the hiring coordinator to issue a new verification link.
          </span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-lg text-center hover-scale">
          <div className="bg-green-500/10 text-green-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-foreground mb-2">Questionnaire Submitted!</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Thank you, <strong className="text-foreground">{refereeInfo?.fullName}</strong>. Your feedback for <strong className="text-foreground">{candidateInfo?.fullName}</strong> has been saved directly to Airtable. 
            Your contribution supports safe and fair hiring operations.
          </p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            RefCheck • NZ & AU Compliance
          </span>
        </div>
      </div>
    );
  }

  const visibleQuestions = questions.filter(
    (q) => isQuestionVisible(q.id) && q.type !== "section_heading"
  );
  const answeredCount = visibleQuestions.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== ""
  ).length;
  const progressPercentage = visibleQuestions.length > 0 
    ? Math.round((answeredCount / visibleQuestions.length) * 100) 
    : 0;

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4 py-12">
      <div className="bg-card border border-border w-full max-w-2xl p-8 rounded-2xl shadow-xl space-y-6">
        {/* Branding header */}
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <div className="w-12 h-12 flex-shrink-0">
            <img src={logo} alt="RefCheck Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display leading-tight">{candidateInfo?.employerName}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Referee Verification Portal</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 font-medium">
            {error}
          </div>
        )}

        {step === 1 ? (
          /* Step 1: Welcome */
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold font-display text-foreground">Hello {refereeInfo?.fullName},</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You have been nominated as a professional referee for <strong className="text-foreground">{candidateInfo?.fullName}</strong>, 
                who has applied for the position of <strong className="text-foreground">{candidateInfo?.roleAppliedFor}</strong>.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Please complete this brief reference check. Your responses are saved directly to our secure base.
              </p>
            </div>

            <div className="p-4 bg-secondary rounded-xl text-xs space-y-2 border border-border">
              <h4 className="font-bold">Instructions:</h4>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>Estimated time: 3–5 minutes.</li>
                <li>Your answers auto-save in the background every 30 seconds.</li>
                <li>Fields marked with <span className="text-destructive font-bold">*</span> are required.</li>
              </ul>
            </div>

            <button
              onClick={handleNextStep}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Start Questionnaire
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Step 2: Questionnaire Form */
          <form onSubmit={handleSubmitResponse} className="space-y-6 relative">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold font-display text-foreground">Referee Feedback Form</h2>
              <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2.5 py-1 rounded-full uppercase">
                Candidate: {candidateInfo?.fullName}
              </span>
            </div>

            {/* Progress Bar, Auto-Save Indicator & Sticky Submit Action */}
            <div className="bg-card/95 border border-border rounded-xl p-4 space-y-2.5 mb-6 animate-fade-in sticky top-2 z-20 backdrop-blur-md shadow-md">
              <div className="flex justify-between items-center text-xs font-bold text-muted-foreground flex-wrap gap-2">
                <span>Progress: {progressPercentage}% Complete ({answeredCount}/{visibleQuestions.length} answered)</span>
                
                <div className="flex items-center gap-3">
                  {autoSaveStatus === "saving" && (
                    <span className="flex items-center gap-1.5 text-blue-600 font-bold uppercase tracking-wider text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                      Saving draft...
                    </span>
                  )}
                  {autoSaveStatus === "saved" && (
                    <span className="flex items-center gap-1.5 text-emerald-600 font-bold uppercase tracking-wider text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Draft auto-saved
                    </span>
                  )}
                  {autoSaveStatus === "error" && (
                    <span className="flex items-center gap-1.5 text-red-600 font-bold uppercase tracking-wider text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-bounce"></span>
                      Auto-save failed
                    </span>
                  )}
                  {autoSaveStatus === "idle" && (
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Not yet submitted
                    </span>
                  )}

                  {progressPercentage === 100 && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-3.5 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg text-xs hover:opacity-90 shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                    >
                      {submitting ? "Submitting..." : "Submit Now"}
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden border border-border">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>

              {progressPercentage === 100 && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold text-center pt-1.5 border-t border-border/60 flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span>All questions answered! Click <strong>"Submit Now"</strong> or the button at the bottom to finalize your reference.</span>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {questions
                .filter((q) => isQuestionVisible(q.id))
                .map((q) => {
                  if (q.type === "section_heading") {
                    return (
                      <div key={q.id} className="pt-6 border-t border-border mt-8 first:pt-0 first:border-0 first:mt-0">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                          {q.label}
                        </h3>
                      </div>
                    );
                  }
                  return (
                    <div key={q.id} className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {q.label} {q.required && <span className="text-destructive">*</span>}
                      </label>
                      {q.description && (
                        <p className="text-[11px] text-muted-foreground italic leading-none">{q.description}</p>
                      )}

                      {q.type === "short_text" && (
                        <input
                          type="text"
                          required={q.required}
                          value={answers[q.id] || ""}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                        />
                      )}

                      {q.type === "long_text" && (
                        <textarea
                          required={q.required}
                          rows={3}
                          value={answers[q.id] || ""}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                        />
                      )}

                      {q.type === "yes_no" && (
                        <div className="flex gap-6 pt-1">
                          {["Yes", "No"].map((opt) => (
                            <label key={opt} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                              <input
                                type="radio"
                                name={q.id}
                                value={opt.toLowerCase()}
                                checked={answers[q.id] === opt.toLowerCase()}
                                onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                                className="w-4 h-4 text-primary bg-secondary border-border focus:ring-primary/20"
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}

                      {q.type === "rating" && (
                        <div className="flex gap-2.5 pt-1">
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => handleUpdateAnswer(q.id, val)}
                              className={`w-10 h-10 rounded-xl font-bold text-xs flex items-center justify-center transition-all border border-border ${
                                answers[q.id] === val 
                                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                                  : "bg-secondary hover:bg-primary/10 text-muted-foreground hover:text-primary"
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === "dropdown" && (
                        <select
                          required={q.required}
                          value={answers[q.id] || ""}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none font-semibold text-primary"
                        >
                          <option value="">Select option...</option>
                          {q.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
            </div>

            {progressPercentage === 100 && (
              <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl flex items-center gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">All Questions Answered</h4>
                  <p className="text-[11px] text-muted-foreground">Please click the button below to complete and submit your official reference.</p>
                </div>
              </div>
            )}

            <div className="flex gap-4 border-t border-border pt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={submitting}
                className="px-6 py-3 border border-border hover:bg-secondary rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Saving & Submitting feedback..." : "Submit Questionnaire Responses"}
                <Check className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
