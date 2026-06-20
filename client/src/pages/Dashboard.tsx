import React from "react";
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  PlusCircle, 
  ArrowUpRight 
} from "lucide-react";
import { Link } from "wouter";

import { AuthState } from "../App.tsx";

interface DashboardProps {
  auth: AuthState;
}

export function Dashboard({ auth }: DashboardProps) {
  const user = auth.user;
  const [metrics, setMetrics] = React.useState<any>({
    avgTurnaroundHours: 0,
    completionRate: 0,
    flaggedRate: 0,
    activeChecksCount: 0
  });
  const [recentCandidates, setRecentCandidates] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Fetch metrics
    fetch("/api/dashboard/metrics", {
      headers: {
        "Authorization": `Bearer ${auth.token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMetrics(data.metrics);
        }
      })
      .catch(err => console.error("Error fetching metrics:", err));

    // Fetch recent candidates
    fetch("/api/candidates?limit=4", {
      headers: {
        "Authorization": `Bearer ${auth.token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRecentCandidates(data.candidates);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching candidates:", err);
        setLoading(false);
      });
  }, [auth.token]);

  const kpis = [
    { 
      name: "Active Candidates", 
      value: loading ? "..." : String(metrics.activeChecksCount), 
      change: "Active checks in progress", 
      icon: Users, 
      color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
      glowClass: "hover:shadow-blue-500/10 hover:border-blue-500/30"
    },
    { 
      name: "Completion Rate", 
      value: loading ? "..." : `${metrics.completionRate}%`, 
      change: "Overall success rate", 
      icon: CheckCircle2, 
      color: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400",
      glowClass: "hover:shadow-green-500/10 hover:border-green-500/30"
    },
    { 
      name: "Flagged Rate", 
      value: loading ? "..." : `${metrics.flaggedRate}%`, 
      change: "Requires security review", 
      icon: AlertTriangle, 
      color: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
      glowClass: "hover:shadow-red-500/10 hover:border-red-500/30"
    },
    { 
      name: "Avg Turnaround", 
      value: loading ? "..." : `${metrics.avgTurnaroundHours}h`, 
      change: "From dispatch to submission", 
      icon: Clock, 
      color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400",
      glowClass: "hover:shadow-amber-500/10 hover:border-amber-500/30"
    },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Recruiter Workspace</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Welcome back, <strong className="text-foreground font-semibold">{user.companyName}</strong>. Here is your reference checking status.
          </p>
        </div>
        
        {auth.user.role !== "Viewer" && (
          <div>
            <Link href="/candidates">
              <a className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground font-medium rounded-full text-sm hover:opacity-95 shadow-sm transition-all cursor-pointer">
                <PlusCircle className="w-4 h-4" />
                New Candidate
              </a>
            </Link>
          </div>
        )}
      </div>

      {/* Interactive Demo Banner */}
      <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl relative overflow-hidden group hover:shadow-md transition-all duration-300">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary/10 text-primary rounded-xl flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              💡 Interactive Workflow Demo Guide
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
              Experience the complete RefCheck workflow end-to-end using our pre-configured candidate <strong>David Miller</strong>:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-card border border-border p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-primary uppercase">Step 1: Candidate Nomination</span>
                <p className="text-[11px] text-muted-foreground">Go to the Candidate Portal to consent and submit referee details.</p>
                <a 
                  href="/c/mock-token-david" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline pt-1.5"
                >
                  Open Candidate Form
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
              <div className="bg-card border border-border p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-amber-600 uppercase">Step 2: Referee Questionnaire</span>
                <p className="text-[11px] text-muted-foreground">Open David Miller under <strong>Candidates</strong> and copy the generated Vetting Link to answer the questionnaire.</p>
              </div>
              <div className="bg-card border border-border p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-green-600 uppercase">Step 3: Verification & PDF</span>
                <p className="text-[11px] text-muted-foreground">Once answered, the check completes. View the vetting report and download the polished PDF.</p>
                <Link href="/candidates">
                  <a className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline pt-1.5">
                    View Candidates Table
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.name} className={`bg-card border border-border p-6 rounded-2xl flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer ${kpi.glowClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">{kpi.name}</span>
                <div className={`p-3 rounded-2xl group-hover:scale-110 transition-transform duration-300 ${kpi.color} shadow-sm`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-5">
                <h3 className="text-3xl font-black font-display leading-none text-foreground tracking-tight">{kpi.value}</h3>
                <span className="text-xs text-muted-foreground block mt-2.5 font-semibold">{kpi.change}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Dashboard Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Reference Checks (2/3 width) */}
        <div className="bg-card border border-border rounded-2xl lg:col-span-2 flex flex-col hover:shadow-md transition-all duration-300">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-bold font-display text-foreground">Recent Activity</h3>
            <Link href="/candidates">
              <a className="text-primary text-xs font-semibold hover:underline flex items-center gap-1">
                View All Candidates
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </Link>
          </div>
          
          <div className="divide-y divide-border overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider font-semibold border-b border-border">
                  <th className="px-6 py-4">Candidate</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Updated</th>
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
                            <div className="h-4 w-28 bg-secondary rounded"></div>
                            <div className="h-3 w-20 bg-secondary/60 rounded"></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 bg-secondary rounded"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-6 w-16 bg-secondary/80 rounded-full"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-16 bg-secondary rounded"></div>
                      </td>
                    </tr>
                  ))
                ) : recentCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-xs italic">
                      No candidates checks dispatched yet.
                    </td>
                  </tr>
                ) : (
                  recentCandidates.map((cand) => (
                    <tr key={cand.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20 flex-shrink-0">
                            {(Array.isArray(cand.createdBy) && cand.createdBy.includes("rec_usr_1")) || cand.createdBy === "rec_usr_1" ? "WS" : "RC"}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{cand.fullName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{cand.assignedPackage}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-muted-foreground">{cand.roleAppliedFor}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          cand.status === "Complete" 
                            ? "bg-green-500/10 text-green-600" 
                            : cand.status === "Flagged"
                            ? "bg-red-500/10 text-red-600"
                            : cand.status === "In Progress"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-blue-500/10 text-blue-600"
                        }`}>
                          {cand.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">{new Date(cand.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Help / Templates Panel (1/3 width) */}
        <div className="bg-card border border-border p-6 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all duration-300">
          <div className="space-y-4">
            <h3 className="text-lg font-bold font-display text-foreground">Reference Packages</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Standard pre-built industry templates complying with New Zealand and Australian hiring protocols.
            </p>
            
            <div className="space-y-3 pt-2">
              <div className="p-4 bg-secondary/50 rounded-2xl flex items-center justify-between border border-border/60">
                <div>
                  <h4 className="text-xs font-bold font-display text-foreground">Early Childhood / ECE</h4>
                  <span className="text-[10px] text-muted-foreground">14 detailed safeguarding metrics</span>
                </div>
                <span className="bg-blue-500/10 text-blue-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">NZTC Reg</span>
              </div>

              <div className="p-4 bg-secondary/50 rounded-2xl flex items-center justify-between border border-border/60">
                <div>
                  <h4 className="text-xs font-bold font-display text-foreground">Clinical Healthcare</h4>
                  <span className="text-[10px] text-muted-foreground">13 clinical safety checks</span>
                </div>
                <span className="bg-blue-500/10 text-blue-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Safety</span>
              </div>

              <div className="p-4 bg-secondary/50 rounded-2xl flex items-center justify-between border border-border/60">
                <div>
                  <h4 className="text-xs font-bold font-display text-foreground">Trades & Construction</h4>
                  <span className="text-[10px] text-muted-foreground">12 physical site productivity markers</span>
                </div>
                <span className="bg-blue-500/10 text-blue-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">Compliant</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <Link href="/builder">
              <a className="w-full flex items-center justify-center py-2.5 border border-border hover:bg-secondary/60 font-semibold rounded-full text-sm transition-all cursor-pointer">
                Manage Questionnaires
              </a>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
