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

  // Time tracker for duration fraud check
  const startTimeRef = useRef<number>(Date.now());
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Set up 30-second Auto-save timer
  useEffect(() => {
    if (refereeInfo && step === 2 && !success) {
      autoSaveTimerRef.current = setInterval(() => {
        triggerAutoSave();
      }, 30000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [refereeInfo, step, answers, success]);

  const triggerAutoSave = async () => {
    if (!refereeInfo) return;
    
    const answersPayload = questions.map(q => ({
      id: q.id,
      type: q.type,
      value: answers[q.id] || ""
    }));

    setAutoSaveStatus("saving");
    try {
      await fetch(`/api/referees/${refereeInfo.id}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answersJson: JSON.stringify(answersPayload),
          isSubmit: false
        })
      });
      console.log("[Auto-save] Progress saved successfully.");
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    } catch (err) {
      console.warn("Auto-save failed in background", err);
      setAutoSaveStatus("error");
    }
  };

  const handleUpdateAnswer = (questionId: string, value: any) => {
    setAnswers({ ...answers, [questionId]: value });
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
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
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
            RefCheck by Candidex • NZ & AU Compliance
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

            {/* Progress Bar & Auto-Save Indicator */}
            <div className="bg-secondary/40 border border-border rounded-xl p-4 space-y-2 mb-6 animate-fade-in sticky top-2 z-20 backdrop-blur-md shadow-xs">
              <div className="flex justify-between items-center text-xs font-bold text-muted-foreground">
                <span>Progress: {progressPercentage}% Complete ({answeredCount}/{visibleQuestions.length} answered)</span>
                
                {autoSaveStatus === "saving" && (
                  <span className="flex items-center gap-1.5 text-blue-600 font-bold uppercase tracking-wider text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                    Saving progress...
                  </span>
                )}
                {(autoSaveStatus === "saved" || autoSaveStatus === "idle") && (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-bold uppercase tracking-wider text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Auto-saved to server
                  </span>
                )}
                {autoSaveStatus === "error" && (
                  <span className="flex items-center gap-1.5 text-red-600 font-bold uppercase tracking-wider text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-bounce"></span>
                    Auto-save failed
                  </span>
                )}
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden border border-border">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-6">
              {questions
                .filter((q) => isQuestionVisible(q.id))
                .map((q) => (
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
                ))}
            </div>

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
