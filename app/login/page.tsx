"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { Mail, Lock, Shield, ChevronRight, Loader2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/firestore";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { createAuditLog } from "@/lib/audit";

const loginSchema = zod.object({
  email: zod.string().email("Please enter a valid email address"),
  password: zod.string().min(6, "Password must be at least 6 characters"),
});

type LoginFields = zod.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (!authLoading && user && role) {
      if (role === "authority" || role === "super_admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/report");
      }
    }
  }, [user, role, authLoading, router]);

  const upsertUser = async (firebaseUser: import("firebase/auth").User): Promise<string> => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);
    const email = firebaseUser.email || "";
    let finalRole = "citizen";

    if (email) {
      try {
        const whitelistRef = doc(db, "authorizedAuthorities", email.toLowerCase());
        const whitelistSnap = await getDoc(whitelistRef);
        if (whitelistSnap.exists() && whitelistSnap.data().status === "active") {
          finalRole = whitelistSnap.data().role || "authority";
        }
      } catch (err) {
        console.error("Error looking up whitelist:", err);
      }
    }

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || "Anonymous User",
        email: firebaseUser.email || "",
        photoURL: firebaseUser.photoURL || "",
        role: finalRole,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
      return finalRole;
    } else {
      await updateDoc(userRef, {
        displayName: firebaseUser.displayName || userSnap.data().displayName || "Anonymous User",
        photoURL: firebaseUser.photoURL || userSnap.data().photoURL || "",
        lastLogin: serverTimestamp(),
        role: finalRole,
      });
      return finalRole;
    }
  };

  const onSubmit = async (data: LoginFields) => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const userRole = await upsertUser(userCredential.user);
      
      // Audit Log
      await createAuditLog({
        action: "Login",
        performedByUid: userCredential.user.uid,
        performedByName: userCredential.user.displayName || "Anonymous User",
        performedByEmail: userCredential.user.email || "",
        performedByRole: userRole,
        after: { lastLogin: new Date() },
        metadata: { loginMethod: "email" }
      });

      if (userRole === "authority" || userRole === "super_admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/report");
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Invalid email or password.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const userRole = await upsertUser(userCredential.user);

      // Audit Log
      await createAuditLog({
        action: "Login",
        performedByUid: userCredential.user.uid,
        performedByName: userCredential.user.displayName || "Anonymous User",
        performedByEmail: userCredential.user.email || "",
        performedByRole: userRole,
        after: { lastLogin: new Date() },
        metadata: { loginMethod: "google" }
      });

      if (userRole === "authority" || userRole === "super_admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/report");
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Google authentication failed.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
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
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 overflow-hidden font-sans text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950 to-slate-950" />
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[128px]" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-[128px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-8 backdrop-blur-xl shadow-2xl"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/20">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Welcome to CivicAI</h2>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access your dashboard or report a civic issue
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Email Address
            </label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
              <input
                type="email"
                disabled={loading}
                {...register("email")}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="you@example.com"
              />
            </div>
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
              <input
                type="password"
                disabled={loading}
                {...register("password")}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-[0.98] disabled:scale-100 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              <>
                Sign In with Email
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <hr className="w-full border-slate-800" />
          <span className="absolute bg-slate-900/60 px-3 text-xs uppercase tracking-wider text-slate-500 backdrop-blur-sm">
            or continue with
          </span>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/30 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-slate-950/60 hover:text-white active:scale-[0.98] disabled:scale-100 disabled:opacity-50"
        >
          <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Google Account
        </button>
      </motion.div>
    </div>
  );
}
