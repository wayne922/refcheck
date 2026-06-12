import React, { useState, useEffect } from "react";
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
  AlertCircle
} from "lucide-react";
import logo from "../assets/logo.png";

interface CandidateNominateProps {
  token: string;
}

interface RefereeInput {
  fullName: string;
  email: string;
  phone: string;
  relationship: string;
  employerName: string;
  jobTitle: string;
  datesFrom: string;
  datesTo: string;
}

export function CandidateNominate({ token }: CandidateNominateProps) {
  const [candidateInfo, setCandidateInfo] = useState<{
    id: string;
    fullName: string;
    roleAppliedFor: string;
    employerName: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Default nomination fields for 2 referees (standard requirement)
  const [referees, setReferees] = useState<RefereeInput[]>([
    { fullName: "", email: "", phone: "", relationship: "Manager", employerName: "", jobTitle: "", datesFrom: "", datesTo: "" },
    { fullName: "", email: "", phone: "", relationship: "Peer", employerName: "", jobTitle: "", datesFrom: "", datesTo: "" }
  ]);

  useEffect(() => {
    const fetchCandidateDetails = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/candidates/by-token/${token}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to retrieve invitation details");
        }
        setCandidateInfo(data.candidate);
      } catch (err: any) {
        setError(err.message || "Invalid or expired onboarding link.");
      } finally {
        setLoading(false);
      }
    };
    fetchCandidateDetails();
  }, [token]);

  const handleUpdateReferee = (index: number, fields: Partial<RefereeInput>) => {
    setReferees(referees.map((r, i) => i === index ? { ...r, ...fields } : r));
  };

  const handleNextStep = () => {
    if (step === 1 && !consentChecked) {
      setError("You must authorize the reference check to proceed.");
      return;
    }
    setError("");
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setError("");
    setStep(step - 1);
  };

  const handleSubmitNominations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateInfo) return;

    // Validate referee details
    for (let i = 0; i < referees.length; i++) {
      const ref = referees[i];
      if (!ref.fullName || !ref.email || !ref.phone) {
        setError(`Please complete the Name, Email, and Phone fields for Referee #${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/candidates/${candidateInfo.id}/referees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referees })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save referees");
      }
      setSuccess(true);
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
          Loading credentials, please wait...
        </div>
      </div>
    );
  }

  if (error && step === 1 && !candidateInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-lg text-center hover-scale">
          <div className="bg-destructive/10 text-destructive w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-foreground mb-2">Link Invalid or Expired</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">{error}</p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            Please contact your recruiter or hiring coordinator to issue a new verification link.
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
          <h2 className="text-lg font-bold font-display text-foreground mb-2">Nominations Submitted!</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Thank you, <strong className="text-foreground">{candidateInfo?.fullName}</strong>. Your referees have been registered. 
            RefCheck will now coordinate directly with them. No further action is required from you.
          </p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            RefCheck by Candidex • Automated & Compliant
          </span>
        </div>
      </div>
    );
  }

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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Reference Intake Portal</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 font-medium">
            {error}
          </div>
        )}

        {step === 1 ? (
          /* Step 1: Welcome & Consent */
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold font-display text-foreground">Welcome, {candidateInfo?.fullName}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                To support your application for the role of <strong className="text-foreground">{candidateInfo?.roleAppliedFor}</strong>, 
                please authorize this check and nominate at least two professional referees below.
              </p>
            </div>

            <div className="bg-secondary/40 border border-border p-4 rounded-xl space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Privacy Consent & Authorization</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                I hereby authorize {candidateInfo?.employerName} and RefCheck to contact my nominated referees to obtain professional feedback, 
                assess credentials, and compile a reference check report. I understand that this information will be shared with the hiring company.
              </p>
              
              <label className="flex items-start gap-2.5 pt-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="w-4 h-4 text-primary bg-secondary border-border rounded mt-0.5 focus:ring-primary/20"
                />
                <span>I authorize RefCheck to proceed and confirm details are accurate.</span>
              </label>
            </div>

            <button
              onClick={handleNextStep}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue to Referees
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Step 2: Nominate Referees */
          <form onSubmit={handleSubmitNominations} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-display text-foreground">Nominate Your Referees</h2>
              <span className="text-[10px] font-bold text-muted-foreground font-mono bg-secondary px-2.5 py-1 rounded-full">
                2 Nominees Required
              </span>
            </div>

            <div className="space-y-6 divide-y divide-border">
              {referees.map((ref, idx) => (
                <div key={idx} className={`space-y-4 ${idx > 0 ? "pt-6" : ""}`}>
                  <h3 className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Referee #{idx + 1} ({ref.relationship})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Robert Thomas"
                        value={ref.fullName}
                        onChange={(e) => handleUpdateReferee(idx, { fullName: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. robert.t@company.com"
                        value={ref.email}
                        onChange={(e) => handleUpdateReferee(idx, { email: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +64 21 000 0000"
                        value={ref.phone}
                        onChange={(e) => handleUpdateReferee(idx, { phone: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Relationship *
                      </label>
                      <select
                        value={ref.relationship}
                        onChange={(e) => handleUpdateReferee(idx, { relationship: e.target.value })}
                        className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none font-semibold text-primary"
                      >
                        <option value="Manager">Manager / Director</option>
                        <option value="Peer">Peer / Colleague</option>
                        <option value="Client">Client</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Referee Stated Employer
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Tiny Tots Kindergarten"
                        value={ref.employerName}
                        onChange={(e) => handleUpdateReferee(idx, { employerName: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Referee Job Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Center Director"
                        value={ref.jobTitle}
                        onChange={(e) => handleUpdateReferee(idx, { jobTitle: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Employment Start Date
                      </label>
                      <input
                        type="date"
                        value={ref.datesFrom}
                        onChange={(e) => handleUpdateReferee(idx, { datesFrom: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Employment End Date
                      </label>
                      <input
                        type="date"
                        value={ref.datesTo}
                        onChange={(e) => handleUpdateReferee(idx, { datesTo: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 border-t border-border pt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={submitting}
                className="px-6 py-3 border border-border hover:bg-secondary rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Submitting nominations..." : "Complete & Nominate Referees"}
                <Check className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
