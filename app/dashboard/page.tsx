"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
  TrendingUp,
  Filter,
  Search,
  Eye,
  RefreshCw,
  MapPin,
  Calendar,
  Sparkles,
  User,
  Loader2,
  X,
  Map as MapIcon,
  Layers,
  UserCheck,
  FileText,
  Activity,
  AlertCircle,
  ClipboardList
} from "lucide-react";
import { db } from "@/lib/firestore";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import Header from "@/components/Header";

interface CivicIssue {
  id: string;
  reporterId: string;
  imageUrl?: string;
  imageBase64?: string;
  latitude: number;
  longitude: number;
  status: string; // "processing", "open", "assigned", "In Progress", "Resolved"
  createdAt?: any;
  title: string;
  description: string;
  location: string;
  trafficRisk: boolean;
  nearbySchool: boolean;
  nearbyHospital: boolean;
  locationRisk: boolean;
  
  // From process-issue analysis:
  issueType?: string;
  category?: string;
  severity?: string; // "Low", "Medium", "High", "Critical"
  confidence?: number;
  recommendedDepartment?: string;
  estimatedResolution?: string;
  priorityScore?: number;
  analyzedAt?: any;

  // Custom updates by officer/admin:
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

// Subcomponent to handle Heatmap rendering safely inside Google Maps
interface HeatmapLayerProps {
  points: { lat: number; lng: number; weight?: number }[];
  onError: (err: Error) => void;
}

function HeatmapLayer({ points, onError }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    let heatmap: any = null;

    try {
      if (!window.google?.maps?.visualization?.HeatmapLayer) {
        throw new Error("Google Maps Visualization library is not loaded.");
      }

      const googlePoints = points.map(
        (p) => new window.google.maps.LatLng(p.lat, p.lng)
      );

      heatmap = new (window.google.maps.visualization.HeatmapLayer as any)({
        data: googlePoints,
        map: map,
        radius: 30,
        opacity: 0.8,
      });

      return () => {
        if (heatmap) {
          heatmap.setMap(null);
        }
      };
    } catch (err: any) {
      console.error("Failed to initialize Heatmap Layer:", err);
      onError(err);
    }
  }, [map, points, onError]);

  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Firestore Real-time states
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);

  // Filter & Search states
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterSeverity, setFilterSeverity] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"priority" | "latest" | "oldest">("priority");

  // Map settings
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 37.7749, lng: -122.4194 }); // default: SF
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [isHeatmapView, setIsHeatmapView] = useState<boolean>(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);

  // AI Summary states
  const [aiSummary, setAiSummary] = useState<string>("");
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [lastBriefedAt, setLastBriefedAt] = useState<Date | null>(null);

  // Officer Update form states
  const [assignedDepartment, setAssignedDepartment] = useState("");
  const [assignedOfficer, setAssignedOfficer] = useState("");
  const [officerNotes, setOfficerNotes] = useState("");
  const [statusValue, setStatusValue] = useState("");
  const [updatingTicket, setUpdatingTicket] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace("/login");
      } else if (role !== "authority") {
        router.replace("/report");
      }
    }
  }, [user, role, authLoading, router]);

  // Real-time Firestore subscription to `"issues"`
  useEffect(() => {
    const issuesRef = collection(db, "issues");
    const unsubscribe = onSnapshot(
      issuesRef,
      (snapshot) => {
        const issuesData: CivicIssue[] = [];
        snapshot.forEach((doc) => {
          issuesData.push({ id: doc.id, ...doc.data() } as CivicIssue);
        });
        setIssues(issuesData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore subscription error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Update map center to the first available issue location
  useEffect(() => {
    if (issues.length > 0) {
      const validIssue = issues.find(r => r.latitude && r.longitude);
      if (validIssue) {
        const timer = setTimeout(() => {
          setMapCenter({ lat: validIssue.latitude, lng: validIssue.longitude });
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [issues]);

  // Sync details drawer input state when selection changes
  useEffect(() => {
    if (selectedIssue) {
      const timer = setTimeout(() => {
        setAssignedDepartment(selectedIssue.department || selectedIssue.recommendedDepartment || "");
        setAssignedOfficer(selectedIssue.assignedOfficer || "");
        setOfficerNotes(selectedIssue.officerNotes || "");
        setStatusValue(selectedIssue.status || "open");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedIssue]);

  // AI summary fetching with 10-minute caching
  const fetchAiSummary = useCallback(async (force: boolean = false) => {
    if (issues.length === 0) return;

    const CACHE_KEY = "civic_ai_briefing_cache";
    const CACHE_TIME_KEY = "civic_ai_briefing_time";

    if (!force) {
      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && cachedTime) {
        const elapsed = Date.now() - parseInt(cachedTime, 10);
        const tenMinutes = 10 * 60 * 1000;
        if (elapsed < tenMinutes) {
          setAiSummary(cached);
          setLastBriefedAt(new Date(parseInt(cachedTime, 10)));
          return;
        }
      }
    }

    setSummaryLoading(true);
    try {
      const res = await fetch("/api/dashboard-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issues }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.summary) {
          setAiSummary(data.summary);
          setLastBriefedAt(new Date());
          localStorage.setItem(CACHE_KEY, data.summary);
          localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
          toast.success("AI Command brief refreshed!");
        } else {
          throw new Error(data.error || "Briefing calculation error");
        }
      } else {
        throw new Error("HTTP connection error");
      }
    } catch (err: any) {
      console.error("AI briefing refresh failed:", err);
      toast.error(`Briefing unavailable: ${err.message || err}`);
    } finally {
      setSummaryLoading(false);
    }
  }, [issues]);

  // Run AI summary auto-load on issues load
  useEffect(() => {
    if (issues.length > 0 && !aiSummary) {
      const timer = setTimeout(() => {
        fetchAiSummary(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [issues, aiSummary, fetchAiSummary]);

  // Officer Update Handler writing to Firestore
  const handleUpdateIssue = async () => {
    if (!selectedIssue) return;
    setUpdatingTicket(true);
    try {
      const docRef = doc(db, "issues", selectedIssue.id);
      const updates: any = {
        department: assignedDepartment,
        assignedOfficer: assignedOfficer,
        assignedOfficerName: assignedOfficer,
        assignedOfficerId: assignedOfficer ? "officer-" + assignedOfficer.trim().toLowerCase().replace(/\s+/g, "-") : "",
        officerNotes: officerNotes,
        status: statusValue,
        updatedAt: serverTimestamp(),
      };

      // Logging status transition timestamps
      if (statusValue !== selectedIssue.status) {
        if (statusValue === "assigned") {
          updates.assignedAt = serverTimestamp();
        } else if (statusValue === "In Progress") {
          updates.inProgressAt = serverTimestamp();
        } else if (statusValue === "Resolved") {
          updates.resolvedAt = serverTimestamp();
        }
      }

      // Automatically change status to "assigned" if a department is newly assigned
      if (assignedDepartment && !selectedIssue.department && statusValue === "open") {
        updates.status = "assigned";
        updates.assignedAt = serverTimestamp();
        setStatusValue("assigned");
      }

      await updateDoc(docRef, updates);
      toast.success("Ticket database updated successfully!");
      
      // Merge values into the drawer view locally to keep layout reactive
      setSelectedIssue(prev => prev ? {
        ...prev,
        ...updates,
        assignedAt: updates.assignedAt ? { toDate: () => new Date() } : prev.assignedAt,
        inProgressAt: updates.inProgressAt ? { toDate: () => new Date() } : prev.inProgressAt,
        resolvedAt: updates.resolvedAt ? { toDate: () => new Date() } : prev.resolvedAt,
      } : null);

    } catch (error: any) {
      console.error("Failed to sync issue updates:", error);
      toast.error(`Sync error: ${error.message}`);
    } finally {
      setUpdatingTicket(false);
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

  // --- STATS COMPUTATION ---
  const totalCount = issues.length;
  const openCount = issues.filter(r => r.status === "open").length;
  const assignedCount = issues.filter(r => r.status === "assigned").length;
  const inProgressCount = issues.filter(r => r.status === "In Progress" || r.status === "in-progress" || r.status === "in_progress").length;
  const resolvedCount = issues.filter(r => r.status === "Resolved" || r.status === "resolved").length;
  const criticalCount = issues.filter(r => r.severity === "Critical" || r.severity === "critical").length;

  // Severity Ratios
  const lowCount = issues.filter(r => r.severity === "Low").length;
  const mediumCount = issues.filter(r => r.severity === "Medium").length;
  const highCount = issues.filter(r => r.severity === "High").length;
  
  // Department workloads mapping
  const deptWorkloads: Record<string, number> = {};
  issues.forEach((issue) => {
    const dept = issue.department || issue.recommendedDepartment || "Unassigned";
    deptWorkloads[dept] = (deptWorkloads[dept] || 0) + 1;
  });
  const sortedDepts = Object.entries(deptWorkloads).sort((a, b) => b[1] - a[1]);

  // Filtered lists
  const filteredIssues = issues.filter((issue) => {
    const matchesCategory = filterCategory === "All" || issue.category === filterCategory;
    const matchesSeverity = filterSeverity === "All" || issue.severity === filterSeverity;
    
    // Normalize status filters
    let matchesStatus = true;
    if (filterStatus !== "All") {
      if (filterStatus === "In Progress") {
        matchesStatus = issue.status === "In Progress" || issue.status === "in-progress" || issue.status === "in_progress";
      } else if (filterStatus === "Resolved") {
        matchesStatus = issue.status === "Resolved" || issue.status === "resolved";
      } else {
        matchesStatus = issue.status === filterStatus;
      }
    }

    const matchesSearch =
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (issue.issueType && issue.issueType.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (issue.department && issue.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (issue.recommendedDepartment && issue.recommendedDepartment.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSeverity && matchesStatus && matchesSearch;
  });

  // Client side sorting to bypass firestore composite index queries
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    if (sortBy === "priority") {
      const scoreDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    } else if (sortBy === "latest") {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeB - timeA;
    } else {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return timeA - timeB;
    }
  });

  // Map markers & heatmap configurations
  const mapPoints = issues
    .filter((r) => r.latitude && r.longitude)
    .map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      weight: r.severity === "Critical" ? 4 : r.severity === "High" ? 3 : r.severity === "Medium" ? 2 : 1,
    }));

  const getSeverityColor = (sev?: string) => {
    switch (sev) {
      case "Critical": return "text-red-400 bg-red-950/40 border-red-500/30";
      case "High": return "text-amber-400 bg-amber-950/40 border-amber-500/30";
      case "Medium": return "text-yellow-400 bg-yellow-950/40 border-yellow-500/30";
      case "Low": return "text-emerald-400 bg-emerald-950/40 border-emerald-500/30";
      default: return "text-slate-400 bg-slate-900 border-slate-800";
    }
  };

  const getStatusColor = (stat?: string) => {
    if (stat === "Resolved" || stat === "resolved") {
      return "text-emerald-400 bg-emerald-950/30 border border-emerald-500/20";
    } else if (stat === "In Progress" || stat === "in-progress" || stat === "in_progress") {
      return "text-amber-400 bg-amber-950/30 border border-amber-500/20";
    } else if (stat === "assigned") {
      return "text-indigo-400 bg-indigo-950/30 border border-indigo-500/20";
    } else {
      return "text-blue-400 bg-blue-950/30 border border-blue-500/20";
    }
  };

  const getSeverityMarkerPin = (sev?: string) => {
    switch (sev) {
      case "Critical": return "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
      case "High": return "https://maps.google.com/mapfiles/ms/icons/orange-dot.png";
      case "Medium": return "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
      default: return "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/15 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Header */}
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {/* Title */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Smart City Control Center
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Live operational dashboard with automated AI assessments, geocoding maps, and department workflows.
            </p>
          </div>
          <button
            onClick={() => {
              setFilterCategory("All");
              setFilterSeverity("All");
              setFilterStatus("All");
              setSearchQuery("");
              setSortBy("priority");
              fetchAiSummary(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3.5 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-900/80 transition-all self-start md:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Dashboard Data
          </button>
        </div>

        {/* Live Summary Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {/* Card: Total */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Total Reports</span>
              <TrendingUp className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-white">{loading ? "..." : totalCount}</p>
          </div>
          
          {/* Card: Open */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Open Issues</span>
              <AlertCircle className="h-4 w-4 text-blue-400" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-blue-400">{loading ? "..." : openCount}</p>
          </div>

          {/* Card: Assigned */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Assigned</span>
              <UserCheck className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-indigo-400">{loading ? "..." : assignedCount}</p>
          </div>

          {/* Card: In Progress */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455">In Progress</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-amber-400">{loading ? "..." : inProgressCount}</p>
          </div>

          {/* Card: Resolved */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Resolved</span>
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-emerald-400">{loading ? "..." : resolvedCount}</p>
          </div>

          {/* Card: Critical */}
          <div className="relative overflow-hidden rounded-xl border border-slate-900 bg-slate-900/25 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455">Critical</span>
              <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-red-400">{loading ? "..." : criticalCount}</p>
          </div>
        </div>

        {/* AI Operations Summary Panel */}
        <div className="rounded-2xl border border-indigo-900/35 bg-indigo-950/10 p-6 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-indigo-600/5 blur-[64px] pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-900/25 pb-4 mb-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="h-5 w-5" />
              <h3 className="font-bold text-base text-white">AI Command briefing</h3>
              {lastBriefedAt && (
                <span className="text-[10px] text-slate-500 ml-2">
                  Last updated: {lastBriefedAt.toLocaleTimeString()}
                </span>
              )}
            </div>

            <button
              onClick={() => fetchAiSummary(true)}
              disabled={summaryLoading || issues.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 px-3.5 py-1.5 text-xs font-semibold hover:bg-indigo-600/35 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {summaryLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating briefing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Refresh AI Summary
                </>
              )}
            </button>
          </div>

          {summaryLoading ? (
            <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-center gap-2">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
              <p className="text-xs">Analyzing civic logs with Gemini 2.5 Flash...</p>
            </div>
          ) : aiSummary ? (
            <div 
              className="text-sm text-slate-300 leading-relaxed font-sans prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: aiSummary }}
            />
          ) : (
            <p className="text-xs text-slate-550 py-4 text-center">
              No live briefing calculated yet. Click refresh or import report issues to generate insights.
            </p>
          )}
        </div>

        {/* CSS/SVG Metric Analytics Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chart 1: Resolution Performance (Progress Ring) */}
          <div className="rounded-xl border border-slate-900 bg-slate-900/15 p-5 flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450">Resolution Rate</h4>
              <p className="text-2xl font-extrabold text-white">
                {totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0}%
              </p>
              <p className="text-[10px] text-slate-500">
                {resolvedCount} of {totalCount} reported complaints resolved
              </p>
            </div>
            
            <div className="relative h-20 w-20 flex-shrink-0 flex items-center justify-center">
              <svg className="absolute transform -rotate-90" width="80" height="80">
                {/* Background Ring */}
                <circle cx="40" cy="40" r="32" stroke="#1e293b" strokeWidth="6" fill="transparent" />
                {/* Active Ring */}
                <circle 
                  cx="40" 
                  cy="40" 
                  r="32" 
                  stroke="#10b981" 
                  strokeWidth="6" 
                  fill="transparent" 
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - (totalCount ? resolvedCount / totalCount : 0))}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs font-extrabold text-emerald-400">
                {totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0}%
              </span>
            </div>
          </div>

          {/* Chart 2: Severity Distribution Indexes */}
          <div className="rounded-xl border border-slate-900 bg-slate-900/15 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450">Severity Ratio</h4>
              <span className="text-[10px] text-red-400 font-semibold">{criticalCount} Critical Active</span>
            </div>
            
            {/* Multicolored bar */}
            <div className="h-4 w-full rounded-full bg-slate-900 overflow-hidden flex mb-3">
              <div 
                style={{ width: `${totalCount ? (criticalCount / totalCount) * 100 : 0}%` }}
                className="h-full bg-red-500"
                title={`Critical: ${criticalCount}`}
              />
              <div 
                style={{ width: `${totalCount ? (highCount / totalCount) * 100 : 0}%` }}
                className="h-full bg-amber-500"
                title={`High: ${highCount}`}
              />
              <div 
                style={{ width: `${totalCount ? (mediumCount / totalCount) * 100 : 0}%` }}
                className="h-full bg-yellow-500"
                title={`Medium: ${mediumCount}`}
              />
              <div 
                style={{ width: `${totalCount ? (lowCount / totalCount) * 100 : 0}%` }}
                className="h-full bg-emerald-500"
                title={`Low: ${lowCount}`}
              />
            </div>

            <div className="grid grid-cols-4 text-[10px] text-slate-400 gap-1 text-center font-medium">
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span>Crit ({criticalCount})</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>High ({highCount})</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span>Med ({mediumCount})</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Low ({lowCount})</span>
              </div>
            </div>
          </div>

          {/* Chart 3: Department Workloads Chart */}
          <div className="rounded-xl border border-slate-900 bg-slate-900/15 p-5 flex flex-col justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450 mb-3">Top Department workloads</h4>
            
            <div className="space-y-2 max-h-[80px] overflow-y-auto pr-1">
              {sortedDepts.slice(0, 3).map(([dept, count]) => {
                const percent = totalCount ? (count / totalCount) * 100 : 0;
                return (
                  <div key={dept} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-medium text-slate-350">
                      <span className="truncate max-w-[170px]">{dept}</span>
                      <span className="text-indigo-400">{count} tickets</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percent}%` }}
                        className="h-full bg-indigo-500 rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
              {sortedDepts.length === 0 && (
                <div className="text-center text-[10px] text-slate-500 py-3">No departments assigned yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Grid Map / List Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main Issue List Panel (Left) */}
          <div className="lg:col-span-6 space-y-4">
            
            {/* Search & Filters control center */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-900 bg-slate-900/20 p-4 backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-550" />
                  <input
                    type="text"
                    placeholder="Search type, location, department..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Sorting Select */}
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 py-2 px-3 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="priority">Highest Priority</option>
                  <option value="latest">Latest Reports</option>
                  <option value="oldest">Oldest Reports</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-900/50 pt-3">
                {/* Category select */}
                <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                  <Filter className="h-3.5 w-3.5 text-slate-550" />
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                  >
                    <option value="All">All Categories</option>
                    <option value="Pothole">Pothole</option>
                    <option value="Broken Streetlight">Broken Streetlight</option>
                    <option value="Graffiti">Graffiti</option>
                    <option value="Illegal Dumping">Illegal Dumping</option>
                    <option value="Water Leak">Water Leak</option>
                    <option value="Traffic Hazard">Traffic Hazard</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Severity select */}
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="All">All Severities</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>

                {/* Status select */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 py-1.5 px-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
            </div>

            {/* Main Issues list */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
                  <p className="text-sm font-semibold">Syncing Control Center with Firestore...</p>
                </div>
              ) : sortedIssues.length === 0 ? (
                <div className="text-center py-20 rounded-xl border border-slate-900 bg-slate-900/10 text-slate-500">
                  <p className="text-sm font-semibold">No civic issues match your current filters.</p>
                  <p className="text-xs text-slate-600 mt-1">Try resetting search fields or query parameters.</p>
                </div>
              ) : (
                sortedIssues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => {
                      setSelectedIssue(issue);
                      if (issue.latitude && issue.longitude) {
                        setMapCenter({ lat: issue.latitude, lng: issue.longitude });
                        setMapZoom(16);
                      }
                    }}
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
                          {issue.priorityScore !== undefined && (
                            <span className="text-[9px] text-amber-300 bg-amber-950/40 border border-amber-900/30 rounded px-1.5 py-0.5 font-bold">
                              Priority: {issue.priorityScore}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {issue.title || issue.issueType || "Reported Issue"}
                        </h4>
                        
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {issue.description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-1">
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
                ))
              )}
            </div>
          </div>

          {/* Interactive Google Maps Panel (Middle/Right) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-4 backdrop-blur-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-900/50 pb-3">
                <div className="flex items-center gap-2">
                  <MapIcon className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Smart City Heatmap & Markers</h3>
                </div>

                {/* View Toggles */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-900">
                  <button
                    onClick={() => {
                      setIsHeatmapView(false);
                      setHeatmapError(null);
                    }}
                    className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded transition-all ${
                      !isHeatmapView
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-450 hover:text-white"
                    }`}
                  >
                    <MapPin className="h-3 w-3" />
                    Markers
                  </button>
                  <button
                    onClick={() => {
                      setIsHeatmapView(true);
                    }}
                    className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold rounded transition-all ${
                      isHeatmapView
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-450 hover:text-white"
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    Heatmap
                  </button>
                </div>
              </div>

              {/* Heatmap Fallback Alert Notification */}
              {heatmapError && (
                <div className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-950/20 p-2.5 text-xs text-red-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Heatmap visualization failed to render. Reverting to severity marker pins.</span>
                  </div>
                  <button onClick={() => setHeatmapError(null)} className="text-slate-500 hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Map Canvas */}
              {mounted && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                <div className="w-full rounded-xl overflow-hidden border border-slate-900 aspect-square lg:aspect-[4/3] bg-slate-950 relative">
                  <APIProvider 
                    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} 
                    libraries={['visualization']}
                  >
                    <Map
                      center={mapCenter}
                      zoom={mapZoom}
                      onCenterChanged={(ev) => setMapCenter(ev.detail.center)}
                      onZoomChanged={(ev) => setMapZoom(ev.detail.zoom)}
                      mapId="civic_ai_control_center_map"
                      disableDefaultUI={false}
                      className="w-full h-full"
                    >
                      {/* Render Heatmap View */}
                      {isHeatmapView && !heatmapError ? (
                        <HeatmapLayer
                          points={mapPoints}
                          onError={(err) => {
                            setHeatmapError(err.message);
                            setIsHeatmapView(false); // revert back automatically
                            toast.error("Heatmap layer failed. Reverted to Marker View.");
                          }}
                        />
                      ) : (
                        // Render standard colored Markers
                        issues
                          .filter((r) => r.latitude && r.longitude)
                          .map((issue) => (
                            <Marker
                              key={issue.id}
                              position={{ lat: issue.latitude, lng: issue.longitude }}
                              title={issue.title}
                              icon={{
                                url: getSeverityMarkerPin(issue.severity),
                                scaledSize: new window.google.maps.Size(32, 32),
                              }}
                              onClick={() => {
                                setSelectedIssue(issue);
                                setMapCenter({ lat: issue.latitude, lng: issue.longitude });
                                setMapZoom(15);
                              }}
                            />
                          ))
                      )}
                    </Map>
                  </APIProvider>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-slate-950 aspect-square lg:aspect-[4/3] text-slate-500 border border-slate-900">
                  <MapPin className="h-8 w-8 text-slate-700 mb-2" />
                  <p className="text-xs font-semibold">Google Maps is not initialized</p>
                  <p className="text-[10px] text-slate-650 mt-1 max-w-[280px]">
                    Please configure the NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable to visualize geo-location issues.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Sidebar / Issue Detail Drawer Panel */}
      <AnimatePresence>
        {selectedIssue && (
          <motion.div
            initial={{ opacity: 0, x: 200 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-slate-950 border-l border-slate-900 shadow-2xl flex flex-col font-sans"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-900 flex items-center justify-between bg-slate-950/60 backdrop-blur">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Management</span>
              </div>
              <button
                onClick={() => setSelectedIssue(null)}
                className="rounded-lg p-1.5 hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Photo & Priority Banner */}
              <div className="space-y-4">
                {(selectedIssue.imageBase64 || selectedIssue.imageUrl) ? (
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video relative group">
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
              </div>

              {/* Core description details */}
              <div className="space-y-4 border-t border-slate-900 pt-5">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Report details</span>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/20 p-3 rounded-lg border border-slate-900/60">
                    {selectedIssue.description || "No user details provided."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</span>
                    <p className="font-semibold text-slate-200">{selectedIssue.category || "Other"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recommended Dept.</span>
                    <p className="font-semibold text-indigo-400">{selectedIssue.recommendedDepartment || "General Administration"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estimated SLA</span>
                    <p className="font-semibold text-slate-200">{selectedIssue.estimatedResolution || "3-5 business days"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reporter ID</span>
                    <p className="font-mono text-[10px] text-slate-400 truncate" title={selectedIssue.reporterId}>
                      {selectedIssue.reporterId || "Anonymous"}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GPS Coordinates</span>
                  <div className="flex items-center gap-1.5 text-slate-350">
                    <MapPin className="h-3.5 w-3.5 text-slate-650" />
                    <span>Lat: {selectedIssue.latitude?.toFixed(6) ?? "0"}, Lng: {selectedIssue.longitude?.toFixed(6) ?? "0"}</span>
                  </div>
                </div>

                {/* Safety Modifier checklist logs */}
                <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-slate-900/30 border border-slate-900 p-3 text-[10px] text-slate-350">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${selectedIssue.trafficRisk ? "bg-red-500" : "bg-slate-700"}`} />
                    <span>Traffic Risk: {selectedIssue.trafficRisk ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${selectedIssue.nearbySchool ? "bg-red-500" : "bg-slate-700"}`} />
                    <span>School Zone: {selectedIssue.nearbySchool ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${selectedIssue.nearbyHospital ? "bg-red-500" : "bg-slate-700"}`} />
                    <span>Hospital Road: {selectedIssue.nearbyHospital ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${selectedIssue.locationRisk ? "bg-red-500" : "bg-slate-700"}`} />
                    <span>High Density: {selectedIssue.locationRisk ? "Yes" : "No"}</span>
                  </div>
                </div>
              </div>

              {/* Authority update workflow form */}
              {role === "authority" && (
                <div className="border-t border-slate-900 pt-5 space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <ClipboardList className="h-3 w-3 text-indigo-400" />
                    Officer actions
                  </span>

                  <div className="space-y-3.5">
                    {/* Status selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500">Ticket Status</label>
                      <select
                        value={statusValue}
                        onChange={(e) => setStatusValue(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      >
                        <option value="open">Open (Unassigned)</option>
                        <option value="assigned">Assigned</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>

                    {/* Department selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500">Assigned Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Department of Public Works"
                        value={assignedDepartment}
                        onChange={(e) => setAssignedDepartment(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Assigned Officer */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500">Assigned Dispatch Officer</label>
                      <input
                        type="text"
                        placeholder="e.g. Officer Davis"
                        value={assignedOfficer}
                        onChange={(e) => setAssignedOfficer(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Resolution Notes */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-500">
                        {statusValue === "Resolved" ? "Resolution Notes (Required)" : "Action / Log Notes"}
                      </label>
                      <textarea
                        rows={3}
                        placeholder={statusValue === "Resolved" ? "Explain repairs executed (e.g. Pothole filled with cold asphalt compound)..." : "Log any progress updates here..."}
                        value={officerNotes}
                        onChange={(e) => setOfficerNotes(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <button
                      onClick={handleUpdateIssue}
                      disabled={updatingTicket || (statusValue === "Resolved" && !officerNotes.trim())}
                      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white py-2 text-xs font-semibold shadow transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {updatingTicket ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" />
                          Update Ticket Details
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Progress History Activity Timeline */}
              <div className="border-t border-slate-900 pt-5 space-y-4 pb-10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Activity className="h-3 w-3 text-indigo-400" />
                  Timeline progress logs
                </span>

                <div className="relative pl-4 border-l border-slate-850 space-y-5 text-xs text-slate-400">
                  {/* Step: Created */}
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 border border-slate-950" />
                    <div className="font-semibold text-slate-200">Ticket Registered</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {selectedIssue.createdAt?.toDate ? selectedIssue.createdAt.toDate().toLocaleString() : "Syncing..."}
                    </div>
                  </div>

                  {/* Step: Analyzed */}
                  {selectedIssue.analyzedAt && (
                    <div className="relative animate-fadeIn">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-violet-400 border border-slate-950" />
                      <div className="font-semibold text-slate-200">AI Visual Scan Executed</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Category and Severity mapped to &quot;{selectedIssue.category}&quot; with {selectedIssue.confidence || 90}% confidence.
                      </div>
                      <div className="text-[10px] text-slate-650">
                        {selectedIssue.analyzedAt.toDate ? selectedIssue.analyzedAt.toDate().toLocaleString() : ""}
                      </div>
                    </div>
                  )}

                  {/* Step: Assigned */}
                  {selectedIssue.assignedAt && (
                    <div className="relative animate-fadeIn">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-400 border border-slate-950" />
                      <div className="font-semibold text-slate-200">Department Assigned</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Routed to {selectedIssue.department || "Public Works"}.
                        {(selectedIssue.assignedOfficerName || selectedIssue.assignedOfficer) && ` Dispatched: ${selectedIssue.assignedOfficerName || selectedIssue.assignedOfficer}`}
                        {selectedIssue.assignedOfficerId && ` (ID: ${selectedIssue.assignedOfficerId})`}
                      </div>
                      <div className="text-[10px] text-slate-650">
                        {selectedIssue.assignedAt.toDate ? selectedIssue.assignedAt.toDate().toLocaleString() : ""}
                      </div>
                    </div>
                  )}

                  {/* Step: In Progress */}
                  {selectedIssue.inProgressAt && (
                    <div className="relative animate-fadeIn">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-amber-400 border border-slate-950" />
                      <div className="font-semibold text-slate-200">Work In Progress</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Dispatch crew performing inspection/repair.</div>
                      <div className="text-[10px] text-slate-650">
                        {selectedIssue.inProgressAt.toDate ? selectedIssue.inProgressAt.toDate().toLocaleString() : ""}
                      </div>
                    </div>
                  )}

                  {/* Step: Resolved */}
                  {selectedIssue.resolvedAt && (
                    <div className="relative animate-fadeIn">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
                      <div className="font-semibold text-emerald-400">Issue Resolved</div>
                      {selectedIssue.officerNotes && (
                        <p className="mt-1 text-[10px] text-slate-350 italic font-mono bg-slate-900/50 p-2 rounded border border-slate-850">
                          Notes: {selectedIssue.officerNotes}
                        </p>
                      )}
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {selectedIssue.resolvedAt.toDate ? selectedIssue.resolvedAt.toDate().toLocaleString() : ""}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
