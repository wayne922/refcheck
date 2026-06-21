import React, { useState, useEffect } from "react";
import { 
  UserCheck, 
  Check, 
  ArrowLeft,
  Users, 
  Mail, 
  Phone, 
  AlertCircle,
  Plus
} from "lucide-react";

interface CandidateSubstituteProps {
  token: string;
}

interface Referee {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  relationship: string;
  employerName: string;
  jobTitle: string;
  formStatus: string;
}

export function CandidateSubstitute({ token }: CandidateSubstituteProps) {
  const [candidateInfo, setCandidateInfo] = useState<{
    id: string;
    fullName: string;
    roleAppliedFor: string;
    employerName: string;
  } | null>(null);

  const [referees, setReferees] = useState<Referee[]>([]);
  const [selectedRefereeToReplace, setSelectedRefereeToReplace] = useState<Referee | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form fields for new substitute
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("Manager");
  const [employerName, setEmployerName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [datesFrom, setDatesFrom] = useState("");
  const [datesTo, setDatesTo] = useState("");

  useEffect(() => {
    const fetchCandidateAndReferees = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/candidates/by-token/${token}/referees`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to retrieve reference verification details");
        }
        setCandidateInfo(data.candidate);
        setReferees(data.referees);
      } catch (err: any) {
        setError(err.message || "Invalid or expired onboarding link.");
      } finally {
        setLoading(false);
      }
    };
    fetchCandidateAndReferees();
  }, [token]);

  const handleSubmitSubstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateInfo || !selectedRefereeToReplace) return;

    if (!fullName || !email || !phone) {
      setError("Please complete the Name, Email, and Phone fields for the new referee.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/candidates/${candidateInfo.id}/substitute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referee: {
            fullName,
            email,
            phone,
            relationship,
            employerName,
            jobTitle,
            datesFrom,
            datesTo
          },
          originalRefereeId: selectedRefereeToReplace.id
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit substitute referee");
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

  if (error && !candidateInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-card border border-border p-8 rounded-2xl max-w-md w-full shadow-lg text-center hover-scale">
          <div className="bg-destructive/10 text-destructive w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-foreground mb-2">Link Invalid or Expired</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">{error}</p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            Please contact your recruiter or coordinator to issue a new verification link.
          </span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-card border border-border p-8 rounded-3xl max-w-md w-full shadow-md text-center">
          <div className="bg-green-500/10 text-green-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold font-display text-foreground mb-2">Substitute Added</h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Thank you, <strong className="text-foreground">{candidateInfo?.fullName}</strong>. Your replacement referee has been registered. 
            The system has automatically dispatched an invite link to them. No further action is required from you.
          </p>
          <span className="text-[10px] text-muted-foreground block border-t border-border pt-4">
            RefCheck • Automated & Compliant
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4 py-12">
      <div className="bg-card border border-border w-full max-w-2xl p-8 rounded-3xl shadow-sm space-y-6">
        {/* Branding header */}
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <div className="bg-primary/10 text-primary p-2.5 rounded-2xl">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display leading-tight">{candidateInfo?.employerName}</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Reference Portal • Substitute Referee</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 font-medium">
            {error}
          </div>
        )}

        {!selectedRefereeToReplace ? (
          /* Step 1: Select referee to substitute */
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold font-display text-foreground text-left">Request a Substitute Referee</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hello {candidateInfo?.fullName}, if one of your nominated referees is unavailable, non-responsive, or lacks professional email credentials, you can nominate a replacement here.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Nominated Referees</h3>
              
              <div className="grid grid-cols-1 gap-4">
                {referees.map((ref) => {
                  const isComplete = ref.formStatus === "Complete";
                  const isSubstituted = ref.formStatus === "Substituted";
                  return (
                    <div key={ref.id} className="p-5 bg-secondary/30 border border-border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{ref.fullName}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{ref.relationship} at {ref.employerName || "Stated Company"}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{ref.email}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{ref.phone}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isComplete 
                            ? "bg-green-500/10 text-green-600" 
                            : isSubstituted
                            ? "bg-slate-500/10 text-slate-500"
                            : "bg-blue-500/10 text-blue-600"
                        }`}>
                          {ref.formStatus}
                        </span>

                        {!isComplete && !isSubstituted && (
                          <button
                            onClick={() => setSelectedRefereeToReplace(ref)}
                            className="flex items-center gap-1 px-3.5 py-1.5 bg-primary text-primary-foreground font-medium rounded-full text-xs hover:opacity-95 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Replace
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Fill out details for substitute */
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <button 
                onClick={() => setSelectedRefereeToReplace(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Select a different referee
              </button>
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Replacing: {selectedRefereeToReplace.fullName}</span>
            </div>

            <form onSubmit={handleSubmitSubstitute} className="space-y-6">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Nominate Replacement Referee</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Robert Thomas"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Relationship *
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none font-semibold text-primary"
                  >
                    <option value="Manager">Manager / Director</option>
                    <option value="Peer">Peer / Colleague</option>
                    <option value="Client">Client</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Referee Employer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tiny Tots Kindergarten"
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
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
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Employment Start Date
                  </label>
                  <input
                    type="date"
                    value={datesFrom}
                    onChange={(e) => setDatesFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Employment End Date
                  </label>
                  <input
                    type="date"
                    value={datesTo}
                    onChange={(e) => setDatesTo(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 border-t border-border pt-6">
                <button
                  type="button"
                  onClick={() => setSelectedRefereeToReplace(null)}
                  disabled={submitting}
                  className="px-6 py-3 border border-border hover:bg-secondary rounded-full text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-full text-xs hover:opacity-95 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Submitting nominations..." : "Nominate Substitute Referee"}
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
