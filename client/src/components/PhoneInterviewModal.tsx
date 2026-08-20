import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Phone, 
  PhoneCall, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Play, 
  Pause, 
  RotateCcw, 
  Star, 
  Copy, 
  Building2, 
  Briefcase, 
  User, 
  ShieldCheck,
  Award,
  Calendar
} from "lucide-react";

interface Question {
  id: string;
  type: "short_text" | "long_text" | "rating" | "yes_no" | "multiple_choice" | "single_select" | "dropdown" | "section_heading";
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  risk_rule?: { condition: string; value: string; severity: "high" | "medium" };
  branch_rules?: { condition: string; value: string; action: "show" | "hide"; targetId: string }[];
}

interface PhoneInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  referee: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    relationship: string;
    employerName: string;
    jobTitle: string;
    referenceType?: string;
  } | null;
  candidate: {
    id: string;
    fullName: string;
    roleAppliedFor: string;
    employerName?: string;
    assignedPackage?: string;
  } | null;
  authToken: string;
  onSuccess: () => void;
}

export function PhoneInterviewModal({
  isOpen,
  onClose,
  referee,
  candidate,
  authToken,
  onSuccess
}: PhoneInterviewModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [branchingRules, setBranchingRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Form State
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [dialedPhone, setDialedPhone] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(true);
  const [consentConfirmed, setConsentConfirmed] = useState(true);
  const [interviewerNotes, setInterviewerNotes] = useState("");

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Questions on Open
  useEffect(() => {
    if (!isOpen || !referee) return;

    setLoading(true);
    setError("");
    setDialedPhone(referee.phone || "");
    setAnswers({});
    setInterviewerNotes("");
    setTimerSeconds(0);
    setIsTimerRunning(true);
    setIdentityConfirmed(true);
    setConsentConfirmed(true);

    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/referees/${referee.id}/phone-details`, {
          headers: {
            "Authorization": `Bearer ${authToken}`
          }
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load questionnaire details");
        }

        setQuestions(data.questions || []);
        setBranchingRules(data.branchingRules || []);

        // Load existing answers if auto-saved before
        if (data.referee?.answersJson && data.referee.answersJson !== "[]") {
          try {
            const loadedAnswers: Record<string, any> = {};
            const parsed = JSON.parse(data.referee.answersJson);
            parsed.forEach((ans: any) => {
              loadedAnswers[ans.id] = ans.value;
            });
            setAnswers(loadedAnswers);
          } catch (e) {
            console.warn("Could not parse existing answersJson", e);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load phone questionnaire details.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [isOpen, referee, authToken]);

  // Call Timer Interval
  useEffect(() => {
    if (isOpen && isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isTimerRunning]);

  if (!isOpen || !referee || !candidate) return null;

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyPhone = () => {
    if (dialedPhone) {
      navigator.clipboard.writeText(dialedPhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const isQuestionVisible = (qId: string) => {
    const targetingRules = branchingRules.filter((r: any) => r.target_question_id === qId || r.targetId === qId);
    if (targetingRules.length === 0) return true;

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
    return false;
  };

  const handleUpdateAnswer = (qId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  // Calculate live average rating
  const visibleQuestions = questions.filter(q => isQuestionVisible(q.id));
  const ratingQuestions = visibleQuestions.filter(q => q.type === "rating");
  const ratingsGiven = ratingQuestions
    .map(q => Number(answers[q.id]))
    .filter(r => typeof r === "number" && !isNaN(r) && r > 0);
  
  const currentAverageRating = ratingsGiven.length > 0
    ? (ratingsGiven.reduce((a, b) => a + b, 0) / ratingsGiven.length).toFixed(1)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!identityConfirmed) {
      setError("Please confirm you verified the referee's identity before completing.");
      return;
    }

    if (!consentConfirmed) {
      setError("Please confirm the referee gave verbal consent for this reference.");
      return;
    }

    // Check required questions
    for (const q of visibleQuestions) {
      if (q.required && q.type !== "section_heading") {
        const val = answers[q.id];
        if (val === undefined || val === null || val === "") {
          setError(`Please answer the required question: "${q.label}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const answersPayload = visibleQuestions
        .filter(q => q.type !== "section_heading")
        .map(q => ({
          id: q.id,
          type: q.type,
          value: answers[q.id] || ""
        }));

      const res = await fetch(`/api/referees/${referee.id}/phone-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          answersJson: JSON.stringify(answersPayload),
          phoneCalledNumber: dialedPhone,
          verbalConsentConfirmed: true,
          interviewerNotes: interviewerNotes,
          callDurationSeconds: timerSeconds
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit phone reference response");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An error occurred submitting the phone reference.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-muted/40 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-display text-foreground">
                  Conduct Phone Reference Interview
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                  Manual Phone Mode
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Candidate: <strong className="text-foreground">{candidate.fullName}</strong> ({candidate.roleAppliedFor})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Call Duration Badge */}
            <div className="flex items-center gap-2 bg-secondary/80 border border-border px-3 py-1.5 rounded-xl text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-bold text-foreground">{formatTime(timerSeconds)}</span>
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="text-muted-foreground hover:text-foreground ml-1 p-0.5"
                title={isTimerRunning ? "Pause Timer" : "Resume Timer"}
              >
                {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-600" />}
              </button>
              <button
                type="button"
                onClick={() => setTimerSeconds(0)}
                className="text-muted-foreground hover:text-foreground p-0.5"
                title="Reset Timer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Contact & Verification Card */}
          <div className="bg-secondary/40 border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block mb-1">Referee Contact</span>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {referee.fullName}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{referee.relationship} • {referee.employerName || "Employer"}</div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block mb-1">Phone Number to Call</span>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${dialedPhone}`}
                  className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {dialedPhone || "No phone provided"}
                </a>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-all"
                  title="Copy Phone Number"
                >
                  {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <input
                type="tel"
                value={dialedPhone}
                onChange={(e) => setDialedPhone(e.target.value)}
                placeholder="Alternate phone if needed..."
                className="mt-1.5 w-full text-[11px] px-2 py-1 bg-card border border-border rounded-md"
              />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block mb-1">Template Package</span>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                {referee.referenceType || candidate.assignedPackage || "Standard"}
              </div>
              {currentAverageRating && (
                <div className="mt-1 text-xs text-purple-600 font-bold flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-purple-600 text-purple-600" />
                  Live Average Rating: {currentAverageRating} / 5.0
                </div>
              )}
            </div>
          </div>

          {/* Compliance Checklist */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Compliance & Identity Attestation</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-foreground select-none">
                <input
                  type="checkbox"
                  checked={identityConfirmed}
                  onChange={(e) => setIdentityConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <span>I verified I am speaking directly with <strong>{referee.fullName}</strong> at {dialedPhone}.</span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-foreground select-none">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <span>Referee verbally consented to provide this reference check.</span>
              </label>
            </div>
          </div>

          {/* Questionnaire Form */}
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground font-medium">
              Loading questionnaire script & questions...
            </div>
          ) : (
            <form id="phone-ref-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Interview Questionnaire ({visibleQuestions.filter(q => q.type !== "section_heading").length} Questions)
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Record responses directly during your phone call
                </span>
              </div>

              <div className="space-y-5">
                {visibleQuestions.map((q, idx) => {
                  if (q.type === "section_heading") {
                    return (
                      <div key={q.id} className="pt-3 pb-1 border-b border-border">
                        <h4 className="text-sm font-bold text-foreground font-display">{q.label}</h4>
                        {q.description && <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>}
                      </div>
                    );
                  }

                  const val = answers[q.id];

                  return (
                    <div key={q.id} className="bg-card border border-border/80 rounded-xl p-4 space-y-3 hover:border-border transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <label className="text-xs font-bold text-foreground block leading-snug">
                          <span className="text-muted-foreground font-mono mr-1.5">{idx + 1}.</span>
                          {q.label} {q.required && <span className="text-destructive">*</span>}
                        </label>
                        {q.type === "rating" && (
                          <span className="text-[10px] font-bold uppercase text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                            Rating 1-5
                          </span>
                        )}
                      </div>

                      {q.description && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                          Prompt / Guide: {q.description}
                        </p>
                      )}

                      {/* Question Inputs */}
                      {q.type === "rating" && (
                        <div className="flex items-center gap-2 pt-1">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const isSelected = val === star;
                            return (
                              <button
                                key={star}
                                type="button"
                                onClick={() => handleUpdateAnswer(q.id, star)}
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                  isSelected
                                    ? "bg-purple-600 text-white border-purple-600 shadow-sm scale-105"
                                    : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                                }`}
                              >
                                <Star className={`w-3.5 h-3.5 ${isSelected ? "fill-white text-white" : "text-muted-foreground"}`} />
                                <span>{star}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(q.type === "yes_no") && (
                        <div className="flex items-center gap-2 pt-1">
                          {["Yes", "No"].map((option) => {
                            const isSelected = String(val).toLowerCase() === option.toLowerCase();
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleUpdateAnswer(q.id, option)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                  isSelected
                                    ? option === "Yes" 
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" 
                                      : "bg-destructive text-white border-destructive shadow-sm"
                                    : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
                                }`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(q.type === "dropdown" || q.type === "single_select" || q.type === "multiple_choice") && (
                        <div className="space-y-1.5 pt-1">
                          {(q.options || ["Yes", "No", "N/A"]).map((opt) => {
                            const isSelected = val === opt;
                            return (
                              <label
                                key={opt}
                                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isSelected
                                    ? "bg-primary/10 border-primary text-primary font-semibold"
                                    : "bg-card border-border hover:bg-secondary/40 text-foreground"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`q_${q.id}`}
                                  checked={isSelected}
                                  onChange={() => handleUpdateAnswer(q.id, opt)}
                                  className="text-primary focus:ring-primary"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {q.type === "short_text" && (
                        <input
                          type="text"
                          value={val || ""}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          placeholder="Type referee's response..."
                          className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary"
                        />
                      )}

                      {q.type === "long_text" && (
                        <textarea
                          rows={3}
                          value={val || ""}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          placeholder="Record referee's detailed verbal comments and specific examples..."
                          className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary resize-y"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recruiter Observations & Interviewer Notes */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-2">
                <label className="block text-xs font-bold text-foreground">
                  Recruiter Call Summary & Key Observations (Optional)
                </label>
                <textarea
                  rows={2}
                  value={interviewerNotes}
                  onChange={(e) => setInterviewerNotes(e.target.value)}
                  placeholder="Note candidate strengths, tone of referee, specific highlights, or internal recruitment feedback..."
                  className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary"
                />
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-muted/40 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Call Duration: <strong className="font-mono text-foreground">{formatTime(timerSeconds)}</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-border hover:bg-secondary rounded-xl text-xs font-semibold text-foreground transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loading}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>Submitting Reference...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Complete & Verify Reference
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
