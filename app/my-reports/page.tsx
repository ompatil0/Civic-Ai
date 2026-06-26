"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { db } from "@/lib/firestore";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import Header from "@/components/Header";
import { Loader2, FileText, Calendar, MapPin, Sparkles, CheckCircle, X, Eye } from "lucide-react";

interface CivicIssue {
  id: string;
  reporterId: string;
  imageUrl?: string;
  imageBase64?: string;
  latitude: number;
  longitude: number;
  status: string;
  createdAt?: any;
  title: string;
  description: string;
  location: string;
  trafficRisk: boolean;
  nearbySchool: boolean;
  nearbyHospital: boolean;
  locationRisk: boolean;
  
  issueType?: string;
  category?: string;
  severity?: string;
  confidence?: number;
  recommendedDepartment?: string;
  estimatedResolution?: string;
  priorityScore?: number;
  analyzedAt?: any;

  department?: string;
  assignedOfficer?: string;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  officerNotes?: string;
  updatedAt?: any;
  assignedAt?: any;
  inProgressAt?: any;
  resolvedAt?: any;
}

export default function MyReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [selectedIssueLogs, setSelectedIssueLogs] = useState<any[]>([]);
  const [issueLogsLoading, setIssueLogsLoading] = useState(false);

  // Real-time selected issue audit logs listener
  useEffect(() => {
    if (!selectedIssue) {
      const timer = setTimeout(() => {
        setSelectedIssueLogs([]);
      }, 0);
      return () => clearTimeout(timer);
    }
    
    const loadingTimer = setTimeout(() => {
      setIssueLogsLoading(true);
    }, 0);
    const logsRef = collection(db, "auditLogs");
    const q = query(
      logsRef,
      where("issueId", "==", selectedIssue.id),
      orderBy("timestamp", "asc")
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logsData: any[] = [];
        snapshot.forEach((docSnap) => {
          logsData.push({ id: docSnap.id, ...docSnap.data() });
        });
        setSelectedIssueLogs(logsData);
        setIssueLogsLoading(false);
      },
      (error) => {
        console.error("Error listening to selected issue logs:", error);
        setIssueLogsLoading(false);
      }
    );
    
    return () => {
      clearTimeout(loadingTimer);
      unsubscribe();
    };
  }, [selectedIssue]);

  const getRoleBadge = (roleStr: string) => {
    switch (roleStr) {
      case "super_admin":
        return "text-purple-400 bg-purple-950/40 border border-purple-500/30";
      case "authority":
        return "text-indigo-400 bg-indigo-950/40 border border-indigo-500/30";
      case "citizen":
        return "text-slate-400 bg-slate-900 border border-slate-800";
      default:
        return "text-slate-500 bg-slate-950 border border-slate-900";
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "Syncing...";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString();
  };

  // Protected route
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  // Real-time Firestore subscription to citizen's issues
  useEffect(() => {
    if (!user) return;

    const issuesRef = collection(db, "issues");
    const q = query(
      issuesRef, 
      where("reporterId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const issuesData: CivicIssue[] = [];
        snapshot.forEach((doc) => {
          issuesData.push({ id: doc.id, ...doc.data() } as CivicIssue);
        });
        
        // Sort by createdAt client-side
        issuesData.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return timeB - timeA; // latest first
        });

        setIssues(issuesData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore subscription error for citizen:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const getSeverityColor = (sev?: string) => {
    switch (sev) {
      case "Critical": return "text-red-400 bg-red-950/40 border border-red-500/30";
      case "High": return "text-amber-400 bg-amber-950/40 border border-amber-500/30";
      case "Medium": return "text-yellow-400 bg-yellow-950/40 border border-yellow-500/30";
      case "Low": return "text-emerald-400 bg-emerald-950/40 border border-emerald-500/30";
      default: return "text-slate-400 bg-slate-900 border border-slate-800";
    }
  };

  const getStatusColor = (stat?: string) => {
    if (stat === "Resolved" || stat === "resolved") {
      return "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20";
    } else if (stat === "In Progress" || stat === "in-progress" || stat === "in_progress") {
      return "text-amber-400 bg-amber-950/30 border border-amber-500/20";
    } else if (stat === "assigned") {
      return "text-indigo-400 bg-indigo-950/30 border border-indigo-500/20";
    } else if (stat === "processing") {
      return "text-indigo-400 bg-indigo-950/20 border border-indigo-500/20 animate-pulse";
    } else {
      return "text-blue-400 bg-blue-950/30 border border-blue-500/20";
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 font-sans text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white pb-20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/15 via-slate-950 to-slate-950 pointer-events-none" />
      
      <Header />

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            My Reported Issues
          </h1>
          <p className="mt-2 text-sm text-slate-400 font-medium">
            Track real-time status updates, municipal assignments, and Gemini AI analysis of your submitted reports.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
            <p className="text-sm font-semibold">Loading your reports...</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-slate-900 bg-slate-900/10 text-slate-500">
            <FileText className="h-10 w-10 mx-auto text-slate-700 mb-3" />
            <p className="text-sm font-semibold">You haven&apos;t reported any issues yet.</p>
            <p className="text-xs text-slate-600 mt-1 mb-6">Help keep our city clean and safe by reporting potholes, broken lights, and hazards.</p>
            <button
              onClick={() => router.push("/report")}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.98] cursor-pointer"
            >
              Report First Issue
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12 items-start">
            {/* List block */}
            <div className="md:col-span-6 space-y-4">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className={`group relative overflow-hidden rounded-xl border p-4 transition-all cursor-pointer ${
                    selectedIssue?.id === issue.id
                      ? "border-indigo-500 bg-indigo-950/15"
                      : "border-slate-900 bg-slate-900/20 hover:border-slate-800 hover:bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {issue.category && (
                          <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-950 border border-indigo-900/60 rounded px-1.5 py-0.5">
                            {issue.category}
                          </span>
                        )}
                        {issue.severity && (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${getSeverityColor(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {issue.title || issue.issueType || "Reported Issue"}
                      </h4>
                      
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {issue.description}
                      </p>
                      
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-650" />
                          <span className="truncate max-w-[150px]">{issue.location}</span>
                        </span>
                        {issue.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-650" />
                            {issue.createdAt.toDate ? issue.createdAt.toDate().toLocaleDateString() : "Pending"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between self-stretch h-full min-h-[60px]">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${getStatusColor(issue.status)}`}>
                        {issue.status === "open" ? "Open" : issue.status === "assigned" ? "Assigned" : issue.status}
                      </span>
                      <button className="text-slate-650 group-hover:text-indigo-400 transition-colors p-1">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail block */}
            <div className="md:col-span-6 sticky top-24">
              {selectedIssue ? (
                <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Details</span>
                    <button 
                      onClick={() => setSelectedIssue(null)}
                      className="text-slate-500 hover:text-white cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Photo & Priority Banner */}
                  {(selectedIssue.imageBase64 || selectedIssue.imageUrl) ? (
                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedIssue.imageBase64 || selectedIssue.imageUrl}
                        alt="Evidence image"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold border shadow ${getSeverityColor(selectedIssue.severity)}`}>
                          {selectedIssue.severity || "Medium"}
                        </span>
                        {selectedIssue.priorityScore !== undefined && (
                          <span className="rounded-full px-2.5 py-0.5 text-[9px] font-extrabold border bg-slate-950/80 border-slate-800 text-amber-300 shadow">
                            Score: {selectedIssue.priorityScore}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8 rounded-xl bg-slate-900/50 border border-slate-850 aspect-video text-slate-500 text-xs">
                      No photo provided
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-extrabold text-white leading-tight">
                      {selectedIssue.title || selectedIssue.issueType || "Civic Complaint"}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold mt-1">
                      <Sparkles className="h-3 w-3" />
                      <span>Classified: {selectedIssue.issueType || selectedIssue.category || "General Issue"}</span>
                      {selectedIssue.confidence && (
                        <span className="text-[10px] text-slate-500">({selectedIssue.confidence}% confidence)</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-slate-900 pt-5 text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your description</span>
                      <p className="text-xs text-slate-350 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-900">
                        {selectedIssue.description || "No details provided."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</span>
                        <p className="font-semibold text-slate-200 mt-0.5">{selectedIssue.category || "Other"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Assigned Department</span>
                        <p className="font-semibold text-indigo-400 mt-0.5">{selectedIssue.department || selectedIssue.recommendedDepartment || "Pending Routing"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estimated SLA</span>
                        <p className="font-semibold text-slate-200 mt-0.5">{selectedIssue.estimatedResolution || "3-5 business days"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ticket Status</span>
                        <p className="font-semibold text-slate-200 mt-0.5 capitalize">{selectedIssue.status}</p>
                      </div>
                    </div>

                    {/* Timeline progress logs */}
                    <div className="border-t border-slate-900 pt-5 space-y-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Timeline progress logs
                      </span>

                      <div className="relative pl-4 border-l border-slate-850 space-y-5 text-xs text-slate-400">
                        {/* Step 1: Created */}
                        {(() => {
                          const log = selectedIssueLogs.find((l) => l.action === "Issue Created");
                          const isActive = !!log || !!selectedIssue?.createdAt;
                          const timestamp = log?.timestamp || selectedIssue?.createdAt;
                          return (
                            <div className={`relative ${isActive ? "text-slate-200" : "text-slate-650"}`}>
                              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${isActive ? "bg-indigo-500" : "bg-slate-800"}`} />
                              <div className="font-semibold">Ticket Created</div>
                              {isActive ? (
                                <div className="text-[10px] text-slate-400 mt-1 space-y-1">
                                  <div><span className="text-slate-500">Performer:</span> {log?.performedByName || "Citizen"} <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${getRoleBadge(log?.performedByRole || "citizen")}`}>{log?.performedByRole || "citizen"}</span></div>
                                  <div><span className="text-slate-500">Time:</span> {timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
                                  <div><span className="text-slate-500">Action:</span> Ticket registered successfully.</div>
                                  {log?.after && (
                                    <div className="text-[9px] text-slate-555 font-mono mt-0.5"><span className="text-emerald-500/80 font-bold uppercase">Details:</span> {JSON.stringify(log.after)}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-650 mt-0.5">Pending Ticket registration</div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Step 2: AI Processed */}
                        {(() => {
                          const log = selectedIssueLogs.find((l) => l.action === "AI Analysis Completed");
                          const isActive = !!log || !!selectedIssue?.analyzedAt;
                          const timestamp = log?.timestamp || selectedIssue?.analyzedAt;
                          return (
                            <div className={`relative ${isActive ? "text-slate-200" : "text-slate-650"}`}>
                              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${isActive ? "bg-violet-400" : "bg-slate-800"}`} />
                              <div className="font-semibold">AI Processed</div>
                              {isActive ? (
                                <div className="text-[10px] text-slate-400 mt-1 space-y-1">
                                  <div><span className="text-slate-550">Performer:</span> {log?.performedByName || "Gemini AI"} <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${getRoleBadge(log?.performedByRole || "system")}`}>{log?.performedByRole || "system"}</span></div>
                                  <div><span className="text-slate-550">Time:</span> {timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
                                  <div><span className="text-slate-550">Action:</span> Issue auto-analyzed and classified.</div>
                                  {log?.after && (
                                    <div className="text-[9px] text-slate-550 font-mono mt-0.5"><span className="text-emerald-500/80 font-bold uppercase">Classification:</span> {JSON.stringify(log.after)}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-650 mt-0.5">Waiting for AI assessment</div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Step 3: Assigned */}
                        {(() => {
                          const log = [...selectedIssueLogs].reverse().find(
                            (l) => l.action === "Assigned" || l.action === "Officer Assigned" || l.action === "Department Changed"
                          );
                          const isActive = !!log || !!selectedIssue?.assignedAt;
                          const timestamp = log?.timestamp || selectedIssue?.assignedAt;
                          return (
                            <div className={`relative ${isActive ? "text-slate-200" : "text-slate-655"}`}>
                              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${isActive ? "bg-blue-400" : "bg-slate-800"}`} />
                              <div className="font-semibold">Assigned</div>
                              {isActive ? (
                                <div className="text-[10px] text-slate-400 mt-1 space-y-1">
                                  <div><span className="text-slate-550">Performer:</span> {log?.performedByName || "Dispatcher"} <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${getRoleBadge(log?.performedByRole || "authority")}`}>{log?.performedByRole || "authority"}</span></div>
                                  <div><span className="text-slate-550">Time:</span> {timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
                                  <div><span className="text-slate-550">Action:</span> Routed to {selectedIssue?.department || "Operations"} Department.</div>
                                  {log?.before && (
                                    <div className="text-[9px] text-slate-550 font-mono"><span className="text-red-500/70 font-bold uppercase">Before:</span> {JSON.stringify(log.before)}</div>
                                  )}
                                  {log?.after && (
                                    <div className="text-[9px] text-slate-550 font-mono"><span className="text-emerald-500/80 font-bold uppercase">After:</span> {JSON.stringify(log.after)}</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-650 mt-0.5">Awaiting routing/officer assignment</div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Step 4: In Progress */}
                        {(() => {
                          const log = selectedIssueLogs.find(
                            (l) => l.action === "Status Changed" && (l.after?.status === "In Progress" || l.metadata?.newStatus === "In Progress")
                          );
                          const isActive = !!log || !!selectedIssue?.inProgressAt;
                          const timestamp = log?.timestamp || selectedIssue?.inProgressAt;
                          return (
                            <div className={`relative ${isActive ? "text-slate-200" : "text-slate-655"}`}>
                              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${isActive ? "bg-amber-400" : "bg-slate-800"}`} />
                              <div className="font-semibold">In Progress</div>
                              {isActive ? (
                                <div className="text-[10px] text-slate-400 mt-1 space-y-1">
                                  <div><span className="text-slate-550">Performer:</span> {log?.performedByName || "Dispatch Crew"} <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${getRoleBadge(log?.performedByRole || "authority")}`}>{log?.performedByRole || "authority"}</span></div>
                                  <div><span className="text-slate-555">Time:</span> {timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
                                  <div><span className="text-slate-555">Action:</span> Repair crew dispatched to site.</div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-650 mt-0.5">Repair queue pending</div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Step 5: Resolved */}
                        {(() => {
                          const log = [...selectedIssueLogs].reverse().find(
                            (l) => l.action === "Issue Resolved" || l.action === "Resolution Added"
                          );
                          const isActive = !!log || !!selectedIssue?.resolvedAt;
                          const timestamp = log?.timestamp || selectedIssue?.resolvedAt;
                          return (
                            <div className={`relative ${isActive ? "text-slate-200" : "text-slate-655"}`}>
                              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${isActive ? "bg-emerald-500" : "bg-slate-800"}`} />
                              <div className={`font-semibold ${isActive ? "text-emerald-450 font-bold" : ""}`}>Resolved</div>
                              {isActive ? (
                                <div className="text-[10px] text-slate-400 mt-1 space-y-1">
                                  <div><span className="text-slate-550">Performer:</span> {log?.performedByName || "Officer"} <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold ${getRoleBadge(log?.performedByRole || "authority")}`}>{log?.performedByRole || "authority"}</span></div>
                                  <div><span className="text-slate-555">Time:</span> {timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
                                  <div><span className="text-slate-555">Action:</span> Resolved and verified.</div>
                                  {selectedIssue?.officerNotes && (
                                    <div className="mt-1 text-[10px] text-slate-350 italic font-mono bg-slate-900/50 p-2 rounded border border-slate-850">
                                      Notes: {selectedIssue.officerNotes}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-650 mt-0.5">Awaiting resolution verification</div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 rounded-xl border border-slate-900 bg-slate-900/10 text-slate-500">
                  <p className="text-sm font-semibold">Select a report to view details</p>
                  <p className="text-xs text-slate-650 mt-1">Select any item from your report history to track AI logs, GPS coordinates, and status timelines.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
