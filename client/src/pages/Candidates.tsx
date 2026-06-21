import React, { useState, useEffect } from "react";
import { 
  Search, 
  Filter, 
  Plus, 
  ChevronRight, 
  Mail, 
  Phone, 
  X,
  Briefcase,
  AlertTriangle,
  RotateCcw,
  UserX,
  UserCheck,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Download
} from "lucide-react";
import { AuthState } from "../App.tsx";

const renderStatusStage = (status: string) => {
  const s = (status || "").toLowerCase();
  const isNomination = s.includes("sent") || s.includes("nomination") || s.includes("not started");
  const isVetting = s.includes("submitted") || s.includes("progress") || s.includes("vetting");
  const isComplete = s.includes("complete");
  const isFlagged = s.includes("flagged");

  let bar1 = "bg-border";
  let bar2 = "bg-border";
  let bar3 = "bg-border";
  let textColor = "text-blue-600";

  if (isNomination) {
    bar1 = "bg-blue-500";
    textColor = "text-blue-600";
  } else if (isVetting) {
    bar1 = "bg-blue-500";
    bar2 = "bg-amber-500 animate-pulse";
    textColor = "text-amber-600";
  } else if (isComplete) {
    bar1 = "bg-green-500";
    bar2 = "bg-green-500";
    bar3 = "bg-green-500";
    textColor = "text-green-600";
  } else if (isFlagged) {
    bar1 = "bg-red-500";
    bar2 = "bg-red-500";
    bar3 = "bg-red-500";
    textColor = "text-red-600";
  } else {
    bar1 = "bg-blue-500";
    textColor = "text-blue-600";
  }

  return (
    <div className="flex flex-col gap-1.5 w-32">
      <div className="flex items-center gap-1">
        <div className={`h-1 flex-1 rounded-full ${bar1}`}></div>
        <div className={`h-1 flex-1 rounded-full ${bar2}`}></div>
        <div className={`h-1 flex-1 rounded-full ${bar3}`}></div>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${textColor}`}>
        {status}
      </span>
    </div>
  );
};

interface Candidate {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  roleAppliedFor: string;
  status?: string;
  overallStatus?: string;
  assignedPackage: string;
  createdAt: string;
  candidateToken?: string;
  createdBy?: string | string[];
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
  emailSentAt?: string;
  formOpenedAt?: string;
  nudge1SentAt?: string;
  nudge2SentAt?: string;
  employerAlertedAt?: string;
  fraudFlags?: string;
  fraudFlagDetails?: string;
  refereeToken?: string;
}

interface CandidatesProps {
  auth: AuthState;
}

export function Candidates({ auth }: CandidatesProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  
  // Sprint 7: Pagination, Sorting & Filtering states
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recruiterFilter, setRecruiterFilter] = useState("All");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sprint 7: Report overlay and Viewer states
  const isViewer = auth.user.role === "Viewer";
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "report"
  const [reportData, setReportData] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Create candidate drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleAppliedFor, setRoleAppliedFor] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("Standard 2-Referee");

  // Candidate detail drawer state
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [refereesList, setRefereesList] = useState<Referee[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Inline reassign referee form state
  const [reassignRefereeId, setReassignRefereeId] = useState<string | null>(null);
  const [reassignName, setReassignName] = useState("");
  const [reassignEmail, setReassignEmail] = useState("");
  const [reassignPhone, setReassignPhone] = useState("");
  const [reassignRelationship, setReassignRelationship] = useState("Manager");
  const [reassignEmployer, setReassignEmployer] = useState("");
  const [reassignJobTitle, setReassignJobTitle] = useState("");

  const packages = [
    "Standard 2-Referee",
    "Executive 3-Referee",
    "Healthcare Premium",
    "Trades Standard",
    "Early Childhood / ECE",
  ];

  const fetchCandidates = async () => {
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: showFlaggedOnly ? "Flagged" : statusFilter,
        sortBy,
        sortOrder,
        createdBy: recruiterFilter
      });
      if (dateFrom) queryParams.append("dateFrom", dateFrom);
      if (dateTo) queryParams.append("dateTo", dateTo);

      const response = await fetch(`/api/candidates?${queryParams.toString()}`, {
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load candidates");
      }
      setCandidates(data.candidates);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || "Could not retrieve records.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async (candidateId: string) => {
    setLoadingReport(true);
    try {
      const response = await fetch(`/api/candidates/${candidateId}/report`, {
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setReportData(data.report);
      }
    } catch (e) {
      console.error("Failed to load report:", e);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownloadPdf = async (candidateId: string, refereeId?: string, refereeName?: string) => {
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/reports/${candidateId}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({ refereeId })
      });
      if (!response.ok) throw new Error("Failed to export PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const downloadName = refereeName
        ? `Reference-Report-${refereeName.replace(/\s+/g, "-")}.pdf`
        : `Vetting-Report-${selectedCandidate?.fullName.replace(/\s+/g, "-")}.pdf`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF download failed:", e);
      alert("Failed to export PDF report. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [auth, page, statusFilter, showFlaggedOnly, recruiterFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !roleAppliedFor) return;

    try {
      const response = await fetch("/api/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          roleAppliedFor,
          assignedPackage: selectedPackage
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create candidate check");
      }
      
      fetchCandidates();
      setIsDrawerOpen(false);
      
      // Reset form
      setFullName("");
      setEmail("");
      setPhone("");
      setRoleAppliedFor("");
    } catch (err: any) {
      setError(err.message || "Failed to create candidate.");
    }
  };

  const fetchCandidateDetails = async (candidateId: string) => {
    setLoadingDetail(true);
    setError("");
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load candidate details");
      }
      setSelectedCandidate(data.candidate);
      setRefereesList(data.referees || []);
      setIsDetailOpen(true);
    } catch (err: any) {
      setError(err.message || "Could not retrieve candidate details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleResendInvite = async (refereeId: string) => {
    try {
      const response = await fetch(`/api/referees/${refereeId}/resend`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to resend invitation");
      }
      alert("Referee invitation resent successfully!");
      if (selectedCandidate) {
        fetchCandidateDetails(selectedCandidate.id);
      }
    } catch (err: any) {
      alert(err.message || "Failed to resend.");
    }
  };

  const handleDeleteReferee = async (refereeId: string) => {
    if (!window.confirm("Are you sure you want to delete this referee request? This action cannot be undone.")) {
      return;
    }
    try {
      const response = await fetch(`/api/referees/${refereeId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete referee");
      }
      alert("Referee request removed successfully!");
      if (selectedCandidate) {
        fetchCandidateDetails(selectedCandidate.id);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    }
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    if (!window.confirm("Are you sure you want to delete this candidate check? This will also permanently remove all associated referees and response records.")) {
      return;
    }
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${auth.token}`
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete candidate");
      }
      alert("Candidate check deleted successfully!");
      setIsDetailOpen(false);
      fetchCandidates();
    } catch (err: any) {
      alert(err.message || "Failed to delete candidate.");
    }
  };

  const handleOpenReassign = (ref: Referee) => {
    setReassignRefereeId(ref.id);
    setReassignName(ref.fullName);
    setReassignEmail(ref.email);
    setReassignPhone(ref.phone);
    setReassignRelationship(ref.relationship);
    setReassignEmployer(ref.employerName);
    setReassignJobTitle(ref.jobTitle);
  };

  const handleSubmitReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignRefereeId) return;

    try {
      const response = await fetch(`/api/referees/${reassignRefereeId}/reassign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          fullName: reassignName,
          email: reassignEmail,
          phone: reassignPhone,
          relationship: reassignRelationship,
          employerName: reassignEmployer,
          jobTitle: reassignJobTitle
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reassign referee");
      }
      alert("Referee reassigned and invite dispatched!");
      setReassignRefereeId(null);
      if (selectedCandidate) {
        fetchCandidateDetails(selectedCandidate.id);
      }
      fetchCandidates(); // Refresh list to update counts/status
    } catch (err: any) {
      alert(err.message || "Failed to reassign.");
    }
  };

  const copyCandidateLink = (token: string) => {
    const link = `${window.location.origin}/c/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const isRefereeOverdue = (ref: Referee) => {
    if (ref.formStatus === "Complete" || ref.formStatus === "Substituted") return false;
    const sentTimeStr = ref.emailSentAt;
    if (!sentTimeStr) return false;
    const elapsedDays = (Date.now() - new Date(sentTimeStr).getTime()) / (1000 * 60 * 60 * 24);
    return elapsedDays >= 6;
  };

  const filteredCandidates = candidates.filter(cand => {
    const matchesSearch = cand.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          cand.roleAppliedFor.toLowerCase().includes(searchTerm.toLowerCase());
    const status = cand.status || cand.overallStatus || "Not Started";
    const matchesFilter = statusFilter === "All" || status === statusFilter;
    const matchesFlagged = !showFlaggedOnly || status === "Flagged";
    return matchesSearch && matchesFilter && matchesFlagged;
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto w-full relative min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Candidates</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Manage your candidate reference checks and check status reports.
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Logo Branding (Top-Right) */}
          <div className="flex items-center gap-3 bg-card border border-border/80 px-4 py-2 rounded-2xl shadow-xs">
            <div className="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 p-2 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold font-display text-sm tracking-tight text-foreground block leading-none">RefCheck</span>
              <span className="text-[9px] block font-bold text-muted-foreground mt-0.5 uppercase tracking-wider">Candidex Vetting</span>
            </div>
          </div>

          {!isViewer && (
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-medium rounded-full text-sm hover:opacity-95 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Add Candidate
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 font-medium">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search candidates by name or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center justify-center gap-2 px-5 py-3 border rounded-full text-sm font-semibold transition-all duration-300 cursor-pointer ${
              showAdvancedFilters 
                ? "bg-primary/10 border-primary text-primary" 
                : "bg-card border-border text-foreground hover:bg-secondary/40"
            }`}
          >
            <Filter className="w-4 h-4" />
            Advanced Filters
            <span className={`transition-transform duration-300 ${showAdvancedFilters ? "rotate-180" : ""}`}>↓</span>
          </button>
        </div>

        {/* Collapsible Advanced Filters Accordion */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          showAdvancedFilters ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        }`}>
          <div className="flex flex-wrap gap-4 items-center bg-card/50 p-6 border border-border rounded-3xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-card border border-border px-3 py-1.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-foreground"
              >
                <option value="All">All Statuses</option>
                <option value="Candidate Sent">Invitation Sent</option>
                <option value="In Progress">In Progress</option>
                <option value="Complete">Complete</option>
                <option value="Flagged">Flagged</option>
              </select>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-full text-xs font-semibold text-foreground cursor-pointer hover:bg-secondary/40 select-none transition-colors">
                <input
                  type="checkbox"
                  checked={showFlaggedOnly}
                  onChange={(e) => {
                    setShowFlaggedOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded text-red-600 focus:ring-red-500 w-3.5 h-3.5 accent-red-600 cursor-pointer"
                />
                <span className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Show Flagged Only
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="bg-card border border-border px-3 py-1.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="bg-card border border-border px-3 py-1.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="bg-card border border-border px-3 py-1.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-foreground"
              >
                <option value="createdAt">Date Created</option>
                <option value="fullName">Candidate Name</option>
                <option value="status">Status</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setSortOrder(so => so === "asc" ? "desc" : "asc");
                setPage(1);
              }}
              className="bg-card border border-border px-4 py-1.5 rounded-full text-xs font-semibold text-foreground hover:bg-secondary/60 transition-colors"
            >
              {sortOrder === "asc" ? "Ascending ↑" : "Descending ↓"}
            </button>

            {auth.user.role === "Admin" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-semibold">Recruiter:</span>
                <select
                  value={recruiterFilter}
                  onChange={(e) => {
                    setRecruiterFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-card border border-border px-3 py-1.5 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-foreground"
                >
                  <option value="All">All Recruiters</option>
                  <option value="rec_usr_1">Wayne Sullivan</option>
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setStatusFilter("All");
                setShowFlaggedOnly(false);
                setDateFrom("");
                setDateTo("");
                setSortBy("createdAt");
                setSortOrder("desc");
                setRecruiterFilter("All");
                setPage(1);
              }}
              className="ml-auto text-xs text-primary hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Candidates List Table */}
      <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider font-semibold border-b border-border">
                <th className="px-6 py-4">Candidate Name</th>
                <th className="px-6 py-4">Applied Role</th>
                <th className="px-6 py-4">Selected Package</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date Created</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary"></div>
                        <div className="space-y-2">
                          <div className="h-4 w-32 bg-secondary rounded"></div>
                          <div className="h-3 w-28 bg-secondary/60 rounded"></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 bg-secondary rounded"></div>
                        <div className="h-4 w-24 bg-secondary rounded"></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-28 bg-secondary rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-16 bg-secondary/80 rounded-full"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 bg-secondary rounded"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 w-4 bg-secondary rounded inline-block"></div>
                    </td>
                  </tr>
                ))
              ) : filteredCandidates.length > 0 ? (
                filteredCandidates.map((cand) => {
                  const status = cand.status || cand.overallStatus || "Not Started";
                  return (
                    <tr 
                      key={cand.id} 
                      onClick={() => fetchCandidateDetails(cand.id)}
                      className="hover:bg-secondary/20 transition-all cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20 flex-shrink-0">
                            {(Array.isArray(cand.createdBy) && cand.createdBy.includes("rec_usr_1")) || cand.createdBy === "rec_usr_1" ? "WS" : "RC"}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{cand.fullName}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground/50" />
                              <a 
                                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cand.email)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline"
                              >
                                {cand.email}
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-medium">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-muted-foreground/60" />
                          {cand.roleAppliedFor}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{cand.assignedPackage}</td>
                      <td className="px-6 py-4">
                        {renderStatusStage(status)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{cand.createdAt.split("T")[0]}</td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors inline" />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No candidates found matching filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/10">
          <div className="text-xs text-muted-foreground font-medium">
            Showing <span className="font-semibold text-foreground">{total === 0 ? 0 : (page - 1) * limit + 1}</span> to{' '}
            <span className="font-semibold text-foreground">{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-semibold text-foreground">{total}</span> candidates
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:pointer-events-none rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => (p * limit < total ? p + 1 : p))}
              disabled={page * limit >= total}
              className="px-3 py-1.5 border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:pointer-events-none rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer Panel for Creating Candidates */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in">
          <div 
            onClick={() => setIsDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
          ></div>
          
          <div className="bg-card w-full max-w-lg h-full shadow-2xl relative z-10 flex flex-col justify-between border-l border-border transform transition-transform duration-300">
            <div>
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold font-display text-foreground">Add Candidate Check</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Initiate a secure link-based verification flow.</p>
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-full hover:bg-secondary transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCandidate} className="p-6 space-y-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Candidate Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jane Mary Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. jane.doe@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Mobile Phone (For SMS reminders)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +64 21 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Job Title / Role Applied For *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Registered ECE Teacher"
                    value={roleAppliedFor}
                    onChange={(e) => setRoleAppliedFor(e.target.value)}
                    className="w-full px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Reference Check Package *
                  </label>
                  <select
                    value={selectedPackage}
                    onChange={(e) => setSelectedPackage(e.target.value)}
                    className="w-full px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold text-foreground"
                  >
                    {packages.map(pkg => (
                      <option key={pkg} value={pkg}>{pkg}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-full text-sm hover:opacity-95 shadow-sm transition-all cursor-pointer"
                  >
                    Dispatch Invitation Link
                  </button>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-border bg-secondary/20 text-center">
              <span className="text-[10px] text-muted-foreground">
                Candidates receive a 7-day token link. On completion, results sync to Airtable.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Detail slide-out drawer (Recruiter dashboard inspection) */}
      {isDetailOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in">
          <div 
            onClick={() => setIsDetailOpen(false)}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
          ></div>
          
          <div className="bg-card w-full max-w-2xl h-full shadow-2xl relative z-10 flex flex-col justify-between border-l border-border transform transition-transform duration-300">
            <div className="overflow-y-auto flex-1">
              {/* Detail Header */}
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold font-display text-foreground">{selectedCandidate.fullName}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedCandidate.roleAppliedFor} • {selectedCandidate.assignedPackage}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    selectedCandidate.overallStatus === "Complete" 
                      ? "bg-green-500/10 text-green-600" 
                      : selectedCandidate.overallStatus === "Flagged"
                      ? "bg-red-500/10 text-red-600"
                      : selectedCandidate.overallStatus === "In Progress"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-blue-500/10 text-blue-600"
                  }`}>
                    {selectedCandidate.overallStatus}
                  </span>
                  {!isViewer && (
                    <button 
                      onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                      className="p-1.5 rounded-full hover:bg-red-50 text-red-500 hover:text-red-600 transition-all cursor-pointer"
                      title="Delete Candidate Check"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => setIsDetailOpen(false)}
                    className="p-1 rounded-full hover:bg-secondary transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="px-6 border-b border-border flex gap-6 bg-secondary/10 relative">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`py-3 px-1 text-sm font-semibold transition-all duration-300 relative z-10 cursor-pointer ${
                    activeTab === "overview"
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Overview & Nominees
                </button>
                <button
                  onClick={() => {
                    setActiveTab("report");
                    fetchReport(selectedCandidate.id);
                  }}
                  className={`py-3 px-1 text-sm font-semibold transition-all duration-300 relative z-10 cursor-pointer ${
                    activeTab === "report"
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Vetting Report
                </button>
                
                {/* Sliding active indicator bottom line */}
                <div 
                  className="absolute bottom-0 h-0.5 bg-primary transition-all duration-300 ease-out" 
                  style={{
                    left: activeTab === "overview" ? "24px" : "195px",
                    width: activeTab === "overview" ? "142px" : "96px"
                  }}
                />
              </div>

              {activeTab === "overview" ? (
                <div className="p-6 space-y-6 animate-fade-in">
                  {/* Candidate Info Card */}
                <div className="p-5 bg-secondary/30 border border-border rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Candidate Verification Link</h4>
                  
                  {selectedCandidate.candidateToken ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-card border border-border px-3 py-2 rounded-xl text-xs font-mono select-all truncate text-primary">
                        {window.location.origin}/c/{selectedCandidate.candidateToken}
                      </div>
                      <button
                        onClick={() => copyCandidateLink(selectedCandidate.candidateToken!)}
                        className="p-2 border border-border hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-all"
                        title="Copy Link"
                      >
                        {copiedToken ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a 
                        href={`/c/${selectedCandidate.candidateToken}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 border border-border hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-all"
                        title="Open Link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Verification link unavailable.</p>
                  )}

                  {selectedCandidate.candidateToken && (
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1.5">
                      <span>Candidate self-nomination substitute portal link:</span>
                      <a 
                        href={`/c/${selectedCandidate.candidateToken}/substitute`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-primary hover:underline font-semibold flex items-center gap-0.5"
                      >
                        Substitute Portal
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Security & Fraud Alert Section */}
                {!loadingDetail && refereesList.some(ref => ref.fraudFlags && ref.fraudFlags.trim() !== "") && (
                  <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-[20px] space-y-4">
                    <div className="flex items-center gap-2.5 text-red-600 font-bold text-sm">
                      <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
                      <span>Security & Fraud Alert</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Our automated heuristics detected one or more potential fraud indicators for this candidate's submission. Please review the details below carefully:
                    </p>
                    <div className="space-y-3">
                      {refereesList.map((ref) => {
                        const flags = ref.fraudFlags ? ref.fraudFlags.split(",").filter(Boolean) : [];
                        let details: Record<string, string> = {};
                        try {
                          details = ref.fraudFlagDetails ? JSON.parse(ref.fraudFlagDetails) : {};
                        } catch (e) {
                          console.error("Failed to parse fraudFlagDetails:", e);
                        }
                        if (flags.length === 0) return null;
                        
                        return (
                          <div key={ref.id} className="p-3.5 bg-card border border-red-500/10 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-foreground">Referee: {ref.fullName}</span>
                              <span className="bg-red-500/15 text-red-600 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                                {flags.length} Flag{flags.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <ul className="space-y-1.5 pl-4 list-disc text-xs text-muted-foreground">
                              {flags.map((flag) => (
                                <li key={flag} className="leading-relaxed">
                                  <strong className="text-foreground capitalize">{flag.replace("_", " ")}: </strong>
                                  {details[flag] || "Flag raised."}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Nominated Referees Section */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nominated Referees Vetting</h4>

                  {loadingDetail ? (
                    <p className="text-xs text-muted-foreground">Loading referees...</p>
                  ) : refereesList.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No referees nominated yet by this candidate.</p>
                  ) : (
                    <div className="space-y-4">
                      {refereesList.map((ref) => {
                        const isOverdue = isRefereeOverdue(ref);
                        const isSubbed = ref.formStatus === "Substituted";
                        
                        return (
                          <div key={ref.id} className="p-5 bg-card border border-border rounded-2xl space-y-4 hover:shadow-xs transition-shadow">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-border/60 pb-3">
                              <div>
                                <h5 className="font-bold text-foreground text-sm">{ref.fullName}</h5>
                                <p className="text-xs text-muted-foreground">{ref.relationship} at {ref.employerName || "Stated Company"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isOverdue && (
                                  <span className="flex items-center gap-1 bg-red-500/10 text-red-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-red-500/20">
                                    <Clock className="w-3 h-3" />
                                    Overdue (Day 6+)
                                  </span>
                                )}
                                {ref.fraudFlags && ref.fraudFlags.trim() !== "" && (
                                  <span className="flex items-center gap-1 bg-red-500/10 text-red-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-red-500/20 animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    Flagged
                                  </span>
                                )}
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  ref.formStatus === "Complete" 
                                    ? "bg-green-500/10 text-green-600" 
                                    : isSubbed
                                    ? "bg-slate-500/10 text-slate-500"
                                    : "bg-blue-500/10 text-blue-600"
                                }`}>
                                  {ref.formStatus}
                                </span>
                              </div>
                            </div>

                            {/* Referee Progress Stepper */}
                            {!isSubbed && (
                              <div className="py-2.5 px-2 bg-secondary/10 rounded-xl border border-border/30 space-y-2">
                                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                  <span className={ref.formStatus === "Sent" || ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete" ? "text-primary font-black" : ""}>Sent</span>
                                  <span className={ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete" ? "text-primary font-black" : ""}>Opened</span>
                                  <span className={ref.formStatus === "In Progress" || ref.formStatus === "Complete" ? "text-primary font-black" : ""}>Answering</span>
                                  <span className={ref.formStatus === "Complete" ? "text-green-600 font-black" : ""}>Completed</span>
                                </div>
                                <div className="relative flex items-center justify-between px-1">
                                  {/* Background Line */}
                                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-secondary rounded-full"></div>
                                  
                                  {/* Active Line Fill */}
                                  <div 
                                    className={`absolute left-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full transition-all duration-500 ${
                                      ref.formStatus === "Complete" ? "bg-green-500" : "bg-primary"
                                    }`}
                                    style={{
                                      width: 
                                        ref.formStatus === "Complete" ? "100%" :
                                        ref.formStatus === "In Progress" ? "66%" :
                                        ref.formStatus === "Opened" ? "33%" : "0%"
                                    }}
                                  ></div>

                                  {/* Step 1: Sent */}
                                  <div className={`w-3 h-3 rounded-full border-2 bg-card z-10 flex items-center justify-center transition-all ${
                                    ref.formStatus === "Sent" || ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                      ? "border-primary"
                                      : "border-muted"
                                  }`}>
                                    <div className={`w-1 h-1 rounded-full ${
                                      ref.formStatus === "Sent" || ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                        ? "bg-primary"
                                        : "bg-transparent"
                                    }`}></div>
                                  </div>

                                  {/* Step 2: Opened */}
                                  <div className={`w-3 h-3 rounded-full border-2 bg-card z-10 flex items-center justify-center transition-all ${
                                    ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                      ? "border-primary"
                                      : "border-muted"
                                  }`}>
                                    <div className={`w-1 h-1 rounded-full ${
                                      ref.formStatus === "Opened" || ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                        ? "bg-primary"
                                        : "bg-transparent"
                                    }`}></div>
                                  </div>

                                  {/* Step 3: Answering */}
                                  <div className={`w-3 h-3 rounded-full border-2 bg-card z-10 flex items-center justify-center transition-all ${
                                    ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                      ? "border-primary"
                                      : "border-muted"
                                  }`}>
                                    <div className={`w-1 h-1 rounded-full ${
                                      ref.formStatus === "In Progress" || ref.formStatus === "Complete"
                                        ? "bg-primary" + (ref.formStatus === "In Progress" ? " animate-pulse" : "")
                                        : "bg-transparent"
                                    }`}></div>
                                  </div>

                                  {/* Step 4: Completed */}
                                  <div className={`w-3 h-3 rounded-full border-2 bg-card z-10 flex items-center justify-center transition-all ${
                                    ref.formStatus === "Complete"
                                      ? "border-green-500 bg-green-50"
                                      : "border-muted"
                                  }`}>
                                    {ref.formStatus === "Complete" && (
                                      <div className="w-1 h-1 rounded-full bg-green-500"></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Mail className="w-4 h-4 text-muted-foreground/50" />
                                <a 
                                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ref.email)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {ref.email}
                                </a>
                              </span>
                              <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-muted-foreground/50" />{ref.phone}</span>
                            </div>

                            {ref.refereeToken && ref.formStatus !== "Complete" && ref.formStatus !== "Substituted" && (
                              <div className="pt-2 border-t border-border/40 mt-1 space-y-1">
                                <span className="text-[10px] text-muted-foreground block font-semibold">Referee Vetting Portal Link:</span>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-secondary/60 border border-border/80 px-2 py-1.5 rounded-lg text-[10px] font-mono select-all truncate text-primary text-left">
                                    {window.location.origin}/r/{ref.refereeToken}
                                  </div>
                                  <a 
                                    href={`/r/${ref.refereeToken}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="p-1.5 border border-border hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-all"
                                    title="Open Referee Form"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            )}

                            {ref.formStatus === "Complete" && (
                              <div className="pt-2 flex flex-wrap gap-2.5 border-t border-border/60">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPdf(selectedCandidate.id, ref.id, ref.fullName)}
                                  disabled={downloadingPdf}
                                  className="flex items-center gap-1.5 px-3 py-1.5 border border-primary hover:bg-primary/5 text-primary rounded-full text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download Reference Report
                                </button>
                              </div>
                            )}
                            {/* Manual Controls (Employer Dashboard Actions) */}
                            {!isViewer && !isSubbed && ref.formStatus !== "Complete" && (
                              <div className="pt-2 flex flex-wrap gap-2.5 border-t border-border/60">
                                {reassignRefereeId !== ref.id ? (
                                  <>
                                    <button
                                      onClick={() => handleResendInvite(ref.id)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-secondary rounded-full text-xs font-semibold text-foreground transition-all cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Resend Invite
                                    </button>
                                    <button
                                      onClick={() => handleOpenReassign(ref)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-secondary rounded-full text-xs font-semibold text-foreground transition-all cursor-pointer"
                                    >
                                      <UserX className="w-3.5 h-3.5" />
                                      Reassign
                                    </button>
                                    <button
                                      onClick={() => handleDeleteReferee(ref.id)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 rounded-full text-xs font-semibold transition-all cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  /* Inline Reassignment Form */
                                  <form onSubmit={handleSubmitReassignment} className="w-full bg-secondary/30 p-4 rounded-xl border border-border space-y-4">
                                    <div className="flex items-center justify-between border-b border-border pb-2">
                                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">Reassign Referee Vetting</span>
                                      <button 
                                        type="button" 
                                        onClick={() => setReassignRefereeId(null)}
                                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase"
                                      >
                                        Cancel
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase text-muted-foreground mb-1">Stated Name *</label>
                                        <input
                                          type="text"
                                          required
                                          value={reassignName}
                                          onChange={(e) => setReassignName(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase text-muted-foreground mb-1">Email Address *</label>
                                        <input
                                          type="email"
                                          required
                                          value={reassignEmail}
                                          onChange={(e) => setReassignEmail(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase text-muted-foreground mb-1">Phone Number *</label>
                                        <input
                                          type="tel"
                                          required
                                          value={reassignPhone}
                                          onChange={(e) => setReassignPhone(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-bold uppercase text-muted-foreground mb-1">Relationship</label>
                                        <select
                                          value={reassignRelationship}
                                          onChange={(e) => setReassignRelationship(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold"
                                        >
                                          <option value="Manager">Manager / Director</option>
                                          <option value="Peer">Peer / Colleague</option>
                                          <option value="Client">Client</option>
                                          <option value="Other">Other</option>
                                        </select>
                                      </div>
                                    </div>

                                    <button
                                      type="submit"
                                      className="w-full py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-xs hover:opacity-95 shadow-sm transition-all"
                                    >
                                      Reassign and Send Request
                                    </button>
                                  </form>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
                /* Vetting Report Tab Content */
                <div className="p-6 space-y-6 animate-fade-in">
                  {loadingReport ? (
                    <div className="py-12 text-center text-muted-foreground text-sm font-medium">
                      Loading consolidated report details...
                    </div>
                  ) : !reportData ? (
                    <div className="py-12 text-center text-muted-foreground text-sm font-medium">
                      Failed to load report data. Please try again.
                    </div>
                  ) : (
                    <>
                      {/* Vetting Report Header Card */}
                      <div className="p-5 bg-secondary/30 border border-border rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Overall Vetting Result</h4>
                          {reportData.overallAverageRating !== null ? (
                            <div className="mt-2 flex items-baseline gap-2">
                              <span className="text-3xl font-extrabold text-foreground">{reportData.overallAverageRating}</span>
                              <span className="text-sm text-muted-foreground">/ 5.0 Average Rating</span>
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-muted-foreground italic">
                              No ratings submitted yet.
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDownloadPdf(selectedCandidate.id)}
                          disabled={downloadingPdf}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-full hover:opacity-95 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
                        >
                          {downloadingPdf ? "Generating PDF..." : "Download PDF Report"}
                        </button>
                      </div>

                      {/* Side-by-Side Question-by-Question Section */}
                      <div className="space-y-6">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Question-by-Question Responses</h4>
                        
                        {reportData.questions.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No questions defined in this template.</p>
                        ) : (
                          reportData.questions.map((q: any) => {
                            const completedReferees = reportData.referees.filter((r: any) => r.formStatus === "Complete");

                            return (
                              <div key={q.id} className="p-5 bg-card border border-border rounded-2xl space-y-4 group transition-all duration-300 hover:border-primary/30 hover:shadow-xs">
                                <div>
                                  <span className="text-xs font-bold text-primary uppercase tracking-wide">Question</span>
                                  <h5 className="font-semibold text-foreground text-sm mt-0.5">{q.label}</h5>
                                  {q.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>
                                  )}
                                </div>

                                {completedReferees.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">No referee answers submitted yet.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                                    {completedReferees.map((ref: any) => {
                                      let answers = [];
                                      try {
                                        answers = JSON.parse(ref.response.answersJson || "[]");
                                      } catch (e) {
                                        console.error("Failed to parse answersJson in render:", e);
                                      }
                                      const ansObj = answers.find((a: any) => a.id === q.id);
                                      const value = ansObj ? ansObj.value : null;

                                      // Evaluate risk rules if present
                                      let hasRisk = false;
                                      if (q.risk_rule && value !== null) {
                                        const { condition, value: ruleVal } = q.risk_rule;
                                        if (condition === "equals" && String(value).toLowerCase() === String(ruleVal).toLowerCase()) {
                                          hasRisk = true;
                                        }
                                      }

                                      return (
                                        <div key={ref.id} className={`p-4 rounded-xl border transition-all duration-300 ${
                                          hasRisk 
                                            ? "bg-red-500/5 border-red-500/20 group-hover:border-red-500/40 group-hover:bg-red-500/10" 
                                            : "bg-secondary/20 border-border/60 group-hover:border-primary/20 group-hover:bg-primary/5"
                                        } space-y-2`}>
                                          <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                                            <span className="text-[10px] font-bold text-foreground truncate">{ref.fullName}</span>
                                            <span className="text-[9px] text-muted-foreground uppercase">{ref.relationship}</span>
                                          </div>
                                          
                                          {value === null || value === undefined ? (
                                            <p className="text-xs text-muted-foreground italic">No response provided.</p>
                                          ) : q.type === "rating" ? (
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-1.5 text-xs text-foreground font-bold">
                                                <span>Rating: {value} / 5</span>
                                                <div className="flex gap-0.5 text-amber-500 text-xs">
                                                  {"★".repeat(Number(value))}{"☆".repeat(5 - Number(value))}
                                                </div>
                                              </div>
                                            </div>
                                          ) : q.type === "yes_no" ? (
                                            <div className="flex items-center gap-1.5">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                String(value).toLowerCase() === "yes" 
                                                  ? "bg-green-500/10 text-green-600" 
                                                  : "bg-red-500/10 text-red-600"
                                              }`}>
                                                {String(value).toUpperCase()}
                                              </span>
                                              {hasRisk && (
                                                <span className="text-[10px] text-red-600 font-semibold flex items-center gap-0.5">
                                                  <AlertTriangle className="w-3 h-3 text-red-600" />
                                                  Risk Flag
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
