"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { toast } from "sonner";
import {
  Camera,
  MapPin,
  Sparkles,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  ShieldCheck,
  Building,
} from "lucide-react";
import { db } from "@/lib/firestore";
import { collection, serverTimestamp, doc, setDoc, onSnapshot } from "firebase/firestore";

import Header from "@/components/Header";

const compressImageBase64 = (
  base64Str: string,
  maxWidth = 800,
  maxHeight = 600,
  quality = 0.6
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let currentWidth = img.width;
      let currentHeight = img.height;
      let currentQuality = quality;

      const performCompression = (): string => {
        const canvas = document.createElement("canvas");
        let w = currentWidth;
        let h = currentHeight;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        if (h > maxHeight) {
          w = Math.round((w * maxHeight) / h);
          h = maxHeight;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL("image/jpeg", currentQuality);
        }
        return base64Str;
      };

      let result = performCompression();
      const maxBase64Length = 133333; // ~100 KB
      let attempts = 0;

      while (result.length > maxBase64Length && attempts < 5) {
        attempts++;
        currentWidth = Math.round(currentWidth * 0.8);
        currentHeight = Math.round(currentHeight * 0.8);
        currentQuality = Math.max(0.2, currentQuality - 0.1);
        result = performCompression();
      }

      resolve(result);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

interface IssueRecord {
  title: string;
  description: string;
  imageUrl?: string;
  imageBase64?: string;
  location: string;
  issueType?: string;
  category?: string;
  severity?: string;
  confidence?: number;
  recommendedDepartment?: string;
  estimatedResolution?: string;
  priorityScore?: number;
  status: string;
  latitude: number;
  longitude: number;
  trafficRisk?: boolean;
  nearbySchool?: boolean;
  nearbyHospital?: boolean;
  locationRisk?: boolean;
}

interface AnalysisResult {
  title?: string;
  category?: string;
  severity?: string;
  suggestedDepartment?: string;
  description?: string;
  safetyHazards?: string[];
  confidence?: number;
}

const reportSchema = zod.object({
  title: zod.string().min(5, "Title must be at least 5 characters"),
  description: zod.string().min(10, "Please provide more details (at least 10 characters)"),
  category: zod.string().min(1, "Please select a category"),
  severity: zod.string().min(1, "Please select a severity level"),
  location: zod.string().min(3, "Location details are required"),
  department: zod.string().optional(),
  trafficRisk: zod.boolean(),
  nearbySchool: zod.boolean(),
  nearbyHospital: zod.boolean(),
  locationRisk: zod.boolean(),
});

type ReportFields = zod.infer<typeof reportSchema>;

export default function ReportPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GPS coordinates and state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Camera settings
  const [isMobile, setIsMobile] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Active processing state
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<IssueRecord | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReportFields>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      category: "",
      severity: "",
      department: "",
      trafficRisk: false,
      nearbySchool: false,
      nearbyHospital: false,
      locationRisk: false,
    },
  });

  // Protect page
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  // Detect mobile
  useEffect(() => {
    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    setIsMobile(!!isMobileDevice);
  }, []);

  // Cleanup webcam stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  // Real-time Firestore active issue listener
  useEffect(() => {
    if (!activeIssueId) return;

    const unsubscribe = onSnapshot(doc(db, "issues", activeIssueId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as IssueRecord;
        setActiveIssue(data);
        if (data.status === "open") {
          toast.success("AI Processing Complete!");
        }
      }
    });

    return () => unsubscribe();
  }, [activeIssueId]);

  // Webcam actions
  const startWebcam = async () => {
    setShowWebcam(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Failed to open webcam:", err);
      setError("Could not access camera. Please upload an image instead.");
      setShowWebcam(false);
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setShowWebcam(false);
  };

  const captureWebcamFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      
      if (context) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setImagePreview(dataUrl);
        setAnalysisResult(null);
        stopWebcam();
        toast.success("Photo captured!");
      }
    }
  };

  // Browser Geolocation
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setGpsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        setValue("location", `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        toast.success("GPS Location acquired!");
        
        try {
          const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          if (mapsApiKey) {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${mapsApiKey}`);
            if (res.ok) {
              const data = await res.json();
              if (data.results && data.results[0]) {
                setValue("location", data.results[0].formatted_address);
              }
            }
          }
        } catch (e) {
          console.error("Geocoding failed", e);
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        console.error("Geolocation error", err);
        setError("Failed to retrieve GPS location. Please enter manually.");
        setGpsLoading(false);
        toast.error("GPS access failed.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Handle Image Selection and base64 Conversion
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setAnalysisResult(null); // Clear previous analysis
        toast.success("Image selected!");
      };
      reader.readAsDataURL(file);
    }
  };

  // Trigger Gemini AI Analysis (Client side preview helper)
  const handleAnalyzeImage = async () => {
    if (!imagePreview) {
      setError("Please capture or select an image to analyze.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePreview,
          description: watch("description") || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Analysis failed. Please try again or fill the fields manually.");
      }

      const result = await response.json();
      if (result.success && result.analysis) {
        const ana = result.analysis;
        setAnalysisResult({
          title: ana.issue_type,
          category: ana.category,
          severity: ana.severity,
          suggestedDepartment: ana.recommended_department,
          description: ana.description,
          confidence: ana.confidence,
        });
        
        // Auto-fill fields
        if (ana.issue_type) setValue("title", ana.issue_type);
        if (ana.category) setValue("category", ana.category);
        if (ana.severity) setValue("severity", ana.severity);
        if (ana.recommended_department) setValue("department", ana.recommended_department);
        if (ana.description) setValue("description", ana.description);
        toast.success("AI pre-fill applied!");
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred during AI analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Submit Report to Firestore (Milestone 3 & 4 & 6)
  const onSubmit = async (data: ReportFields) => {
    if (!imagePreview) {
      setError("Please capture or select an image first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      toast.info("Compressing evidence image...");
      // 1. Generate unique issue ID
      const issueDocRef = doc(collection(db, "issues"));
      const issueId = issueDocRef.id;

      // 2. Compress image in browser memory
      const compressedImage = await compressImageBase64(imagePreview);

      // 3. Create initial Firestore document
      toast.info("Registering ticket in Firestore...");
      await setDoc(issueDocRef, {
        reporterId: user?.uid || "",
        imageBase64: compressedImage,
        latitude: coords?.lat || 0,
        longitude: coords?.lng || 0,
        status: "processing",
        createdAt: serverTimestamp(),
        title: data.title,
        description: data.description,
        location: data.location,
        trafficRisk: data.trafficRisk,
        nearbySchool: data.nearbySchool,
        nearbyHospital: data.nearbyHospital,
        locationRisk: data.locationRisk,
      });

      // 4. Trigger process-issue background API
      fetch("/api/process-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      }).catch((e) => console.error("Process API trigger error:", e));

      // 5. Save active issue ID in state to start listening
      setActiveIssueId(issueId);
      toast.success("Issue registered successfully!");
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to submit report. Please check your connection.");
      toast.error("Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setActiveIssueId(null);
    setActiveIssue(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setCoords(null);
    reset();
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
      {/* Background elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-indigo-900/10 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-10">
        {/* If user submitted a ticket and it is processing/open */}
        {activeIssueId ? (
          <div className="pt-8">
            {activeIssue && activeIssue.status === "open" ? (
              <AnalysisResultView issue={activeIssue} onReset={handleReset} />
            ) : (
              <ProcessingPipeline />
            )}
          </div>
        ) : (
          <>
            <div className="mb-10 text-left">
              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                Report a Civic Issue
              </h1>
              <p className="mt-3 text-lg text-slate-400">
                Provide details or let our Gemini-powered AI analyze an image to automatically classify and route the issue.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              {/* Form & Image Upload Column */}
              <div className="lg:col-span-7 space-y-6">
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 shadow-md">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-300">Something went wrong</h4>
                      <p className="mt-1 text-xs text-red-400/90">{error}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Image Upload Area */}
                  <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 backdrop-blur-sm">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                      Evidence Image
                    </span>
                    
                    <input
                      type="file"
                      accept="image/*"
                      capture={isMobile ? "environment" : undefined}
                      ref={fileInputRef}
                      onChange={handleImageChange}
                      className="hidden"
                    />

                    {imagePreview ? (
                      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagePreview}
                          alt="Evidence Preview"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/90 text-white hover:bg-indigo-600 transition-colors"
                          >
                            <Camera className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setAnalysisResult(null);
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/90 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        {/* AI Analyze Trigger inside preview */}
                        {!analysisResult && (
                          <button
                            type="button"
                            onClick={handleAnalyzeImage}
                            disabled={analyzing}
                            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            {analyzing ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Analyzing...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                Analyze with Gemini
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : showWebcam ? (
                      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video flex flex-col justify-end p-4">
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4 z-10">
                          <button
                            type="button"
                            onClick={captureWebcamFrame}
                            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
                          >
                            Capture Photo
                          </button>
                          <button
                            type="button"
                            onClick={stopWebcam}
                            className="rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-300 px-4 py-2.5 text-xs font-bold transition-all active:scale-[0.98]"
                          >
                            Cancel
                          </button>
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 hover:bg-slate-950/60 transition-colors py-12 px-6"
                        >
                          <Camera className="h-10 w-10 text-slate-500 mb-3" />
                          <span className="text-sm font-semibold text-slate-300">
                            {isMobile ? "Take Photo / Select from Library" : "Select Image from Computer"}
                          </span>
                          <span className="text-xs text-slate-500 mt-1">PNG, JPG, or WEBP up to 5MB</span>
                        </button>
                        {!isMobile && (
                          <button
                            type="button"
                            onClick={startWebcam}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/20 py-3 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
                          >
                            <Camera className="h-4 w-4" />
                            Open Live Webcam Fallback
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-5 rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Report Title
                      </label>
                      <input
                        type="text"
                        {...register("title")}
                        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="e.g. Dangerous pothole on Oak Street"
                      />
                      {errors.title && (
                        <p className="mt-1 text-xs text-red-400">{errors.title.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Description / Details
                      </label>
                      <textarea
                        rows={4}
                        {...register("description")}
                        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="Please describe the issue, how long it has been present, and any potential hazard it poses..."
                      />
                      {errors.description && (
                        <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Category
                        </label>
                        <select
                          {...register("category")}
                          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 px-4 text-sm text-white outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none"
                        >
                          <option value="" disabled className="bg-slate-950">Select category</option>
                          <option value="Pothole" className="bg-slate-950">Pothole / Road Damage</option>
                          <option value="Broken Streetlight" className="bg-slate-950">Broken Streetlight</option>
                          <option value="Graffiti" className="bg-slate-950">Graffiti</option>
                          <option value="Illegal Dumping" className="bg-slate-950">Illegal Dumping</option>
                          <option value="Water Leak" className="bg-slate-950">Water Leak</option>
                          <option value="Traffic Hazard" className="bg-slate-950">Traffic Hazard</option>
                          <option value="Other" className="bg-slate-950">Other</option>
                        </select>
                        {errors.category && (
                          <p className="mt-1 text-xs text-red-400">{errors.category.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Severity Level
                        </label>
                        <select
                          {...register("severity")}
                          className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 px-4 text-sm text-white outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none"
                        >
                          <option value="" disabled className="bg-slate-950">Select severity</option>
                          <option value="Low" className="bg-slate-950">Low</option>
                          <option value="Medium" className="bg-slate-950">Medium</option>
                          <option value="High" className="bg-slate-950">High</option>
                          <option value="Critical" className="bg-slate-950">Critical</option>
                        </select>
                        {errors.severity && (
                          <p className="mt-1 text-xs text-red-400">{errors.severity.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Location / Address
                      </label>
                      <div className="relative mt-2">
                        <MapPin className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                        <input
                          type="text"
                          {...register("location")}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-10 pr-24 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 124 Oakwood Ave, Springfield"
                        />
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          disabled={gpsLoading}
                          className="absolute right-2 top-2 rounded-lg bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 px-3 py-1 text-xs font-semibold hover:bg-indigo-600/30 hover:text-indigo-300 transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {gpsLoading ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Locating...
                            </>
                          ) : (
                            <>
                              <MapPin className="h-3 w-3" />
                              GPS
                            </>
                          )}
                        </button>
                      </div>
                      {errors.location && (
                        <p className="mt-1 text-xs text-red-400">{errors.location.message}</p>
                      )}
                    </div>

                    {/* Priority Modifier Checkboxes */}
                    <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-4">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Safety & Location Risk Checklists
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <label className="flex items-center gap-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            {...register("trafficRisk")}
                            className="h-4 w-4 rounded border-slate-850 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                          />
                          <span>Traffic Risk (Road blockage / busy intersection)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            {...register("nearbySchool")}
                            className="h-4 w-4 rounded border-slate-850 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                          />
                          <span>Nearby School / Child safety zone</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            {...register("nearbyHospital")}
                            className="h-4 w-4 rounded border-slate-850 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                          />
                          <span>Nearby Hospital / Emergency pathway</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-slate-350 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            {...register("locationRisk")}
                            className="h-4 w-4 rounded border-slate-850 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                          />
                          <span>High-density / General Location Risk</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Suggested Department (Optional)
                      </label>
                      <div className="relative mt-2">
                        <Building className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                        <input
                          type="text"
                          {...register("department")}
                          className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. Department of Public Works"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-[0.98] disabled:scale-100 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting Report...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Report
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* AI Insights & Assistant Column */}
              <div className="lg:col-span-5">
                <div className="sticky top-24 rounded-2xl border border-slate-900 bg-slate-900/20 p-6 backdrop-blur-xl space-y-6">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="font-bold text-lg text-white">Gemini AI Assistant</h3>
                  </div>

                  {analyzing ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
                      <p className="text-sm font-medium">Scanning image contents...</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-[250px] md:max-w-xs">
                        Using Gemini 2.5 Flash to identify civic hazards, classify types, and assign severity.
                      </p>
                    </div>
                  ) : analysisResult ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-5 text-sm"
                    >
                      <div className="rounded-xl bg-indigo-950/20 border border-indigo-900/30 p-4">
                        <span className="text-xs uppercase font-semibold text-indigo-400 tracking-wider">
                          Gemini Assessment
                        </span>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-semibold text-base text-slate-200">
                            {analysisResult.title || "Civic Hazard"}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              analysisResult.severity === "Critical"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : analysisResult.severity === "High"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {analysisResult.severity} Severity
                          </span>
                        </div>
                        <p className="mt-2.5 text-slate-300 leading-relaxed text-xs">
                          {analysisResult.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-900 pt-4 text-xs text-slate-500">
                        <span>AI Confidence Metric:</span>
                        <span>{analysisResult.confidence || 0}%</span>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/20 text-slate-500">
                      <FileText className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm font-semibold">Ready for Upload</p>
                      <p className="text-xs text-slate-600 mt-1 max-w-[260px] mx-auto">
                        Once you upload an image, click &quot;Analyze with Gemini&quot; to autofill your report details.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// Sub-component for Processing pipeline (Milestone 7)
function ProcessingPipeline() {
  const steps = [
    { name: "Vision Agent", desc: "Analyzing photo for structural patterns & defect classification" },
    { name: "Priority Agent", desc: "Evaluating traffic risk, school/hospital buffers, and public threat score" },
    { name: "Location Agent", desc: "Geocoding coordinates and assessing local infrastructural density" },
    { name: "Routing Agent", desc: "Determining municipal department target and estimating resolution time" },
  ];

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-slate-900/40 rounded-2xl border border-slate-900 backdrop-blur-sm max-w-lg mx-auto my-12">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 animate-pulse">
        <Sparkles className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Gemini AI Dispatching...</h3>
      <p className="text-sm text-slate-400 text-center mb-8 max-w-sm">
        Our multi-agent orchestration pipeline is classifying your report, scoring priority, and routing the request.
      </p>
      
      <div className="w-full space-y-6">
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;
          return (
            <div key={idx} className="flex gap-4 items-start">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ${
                    isCompleted
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : isActive
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/40 animate-pulse"
                      : "bg-slate-950 border-slate-800 text-slate-500"
                  }`}
                >
                  {isCompleted ? "✓" : idx + 1}
                </div>
                {idx < 3 && (
                  <div
                    className={`w-0.5 h-10 transition-colors duration-300 ${
                      isCompleted ? "bg-emerald-600" : "bg-slate-850"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <h4
                  className={`text-sm font-bold transition-colors ${
                    isActive ? "text-indigo-400" : isCompleted ? "text-slate-350" : "text-slate-500"
                  }`}
                >
                  {step.name}
                </h4>
                <p
                  className={`text-xs mt-1 transition-colors leading-relaxed ${
                    isActive ? "text-slate-300" : isCompleted ? "text-slate-400" : "text-slate-650"
                  }`}
                >
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-component for AI result presentation (Milestone 8)
interface AnalysisResultProps {
  issue: {
    title: string;
    description: string;
    imageUrl?: string;
    imageBase64?: string;
    location: string;
    issueType?: string;
    category?: string;
    severity?: string;
    confidence?: number;
    recommendedDepartment?: string;
    estimatedResolution?: string;
    priorityScore?: number;
  };
  onReset: () => void;
}

function AnalysisResultView({ issue, onReset }: AnalysisResultProps) {
  return (
    <div className="max-w-2xl mx-auto rounded-2xl border border-slate-900 bg-slate-900/30 p-6 md:p-8 backdrop-blur-md shadow-2xl my-12">
      <div className="text-center mb-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="h-6 w-6" />
        </div>
        <h3 className="text-2xl font-bold text-white">Issue Registered & Analyzed</h3>
        <p className="text-sm text-slate-400 mt-1">
          Gemini has successfully cataloged and routed your ticket.
        </p>
      </div>

      {(issue.imageBase64 || issue.imageUrl) && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video mb-6 max-h-[240px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={issue.imageBase64 || issue.imageUrl}
            alt="Report Evidence"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="space-y-6">
        <div>
          <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Report Details</span>
          <h4 className="text-lg font-bold text-white mt-1">{issue.title}</h4>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{issue.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-5">
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">Issue Type</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">{issue.issueType || "Other"}</span>
          </div>
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">Category</span>
            <span className="text-sm font-semibold text-indigo-400 mt-1 block">{issue.category || "Other"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">Severity Level</span>
            <span
              className={`text-sm font-bold mt-1 block ${
                issue.severity === "Critical"
                  ? "text-red-400"
                  : issue.severity === "High"
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {issue.severity || "Low"}
            </span>
          </div>
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">AI Confidence</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">{issue.confidence || 0}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">Priority Score</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-white">{issue.priorityScore || 0}</span>
              <span className="text-[10px] text-slate-500">/ 150 pts</span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-950/40 border border-slate-900/60 p-4">
            <span className="text-xs text-slate-500 block uppercase font-bold">Assigned Department</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">
              {issue.recommendedDepartment || "General Administration"}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-indigo-950/10 border border-indigo-900/30 p-4 flex justify-between items-center text-sm">
          <span className="text-slate-400 font-medium">Estimated Resolution Time:</span>
          <span className="font-bold text-indigo-400">{issue.estimatedResolution || "3-5 business days"}</span>
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full mt-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.98]"
      >
        Submit Another Report
      </button>
    </div>
  );
}
