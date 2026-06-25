"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, ArrowRight, Activity, Building2 } from "lucide-react";
import Header from "@/components/Header";

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 100,
      },
    },
  };

  return (
    <div className="relative min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-violet-600/10 blur-[128px]" />
      <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-indigo-600/10 blur-[128px]" />

      {/* Nav */}
      <Header />

      {/* Hero Section */}
      <main className="mx-auto max-w-7xl px-6 pt-20 pb-24 text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center justify-center"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-950/30 px-4 py-1.5 text-xs text-indigo-400 font-semibold mb-6 backdrop-blur-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Empowering Smarter Municipal Response
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={itemVariants}
            className="max-w-4xl text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent"
          >
            Bridge the Gap Between <br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Citizens and Cities
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed"
          >
            CivicAI harnesses the power of Gemini 2.5 Flash to automatically detect, catalog, and route community issues from photos directly to the right municipal department.
          </motion.p>

          {/* Buttons */}
          <motion.div variants={itemVariants} className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="/report"
              className="group flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-indigo-600/35 transition-all hover:shadow-indigo-500/40 active:scale-[0.98]"
            >
              Report a Civic Issue
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-300 hover:text-white transition-all active:scale-[0.98]"
            >
              Access Authority Console
            </a>
          </motion.div>
        </motion.div>

        {/* Feature Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-28 grid grid-cols-1 md:grid-cols-3 gap-6 text-left"
        >
          {/* Card 1 */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-8 backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/15 mb-6">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Gemini Visual Assessment</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Snap a photo and watch the AI outline safety hazards, score issue severity, and suggest the target department instantly.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-8 backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/15 mb-6">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Automated Department Routing</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Eliminate manually sorting reports. Tickets auto-assign to Public Works, Water Management, or Traffic Safety based on content.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/20 p-8 backdrop-blur-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/15 mb-6">
              <Activity className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Realtime Resolution Pipeline</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              City workers monitor tickets live, updating status logs so citizens stay informed as issues progress from report to repair.
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 bg-slate-950/20 backdrop-blur-sm text-center text-xs text-slate-650 mt-12">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 CivicAI. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-indigo-400">Terms of Use</a>
            <a href="#" className="hover:text-indigo-400">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
