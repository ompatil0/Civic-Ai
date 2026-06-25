"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { ShieldCheck, User, LogOut, FileText, LayoutDashboard, Home, PlusCircle, Building } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Logged out successfully");
      router.push("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  const isCitizen = role === "citizen";
  const isAuthority = role === "authority";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md font-sans">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-6">
          {/* Logo */}
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={() => {
              if (isAuthority) {
                router.push("/dashboard");
              } else if (isCitizen) {
                router.push("/report");
              } else {
                router.push("/");
              }
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white animate-pulse">CivicAI</span>
            {isAuthority && (
              <span className="ml-2 rounded bg-indigo-955 border border-indigo-900 px-2 py-0.5 text-xs text-indigo-400 font-semibold shadow-inner">
                Admin Portal
              </span>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {isCitizen && (
              <>
                <button
                  onClick={() => router.push("/")}
                  className={`hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer ${
                    pathname === "/" ? "text-indigo-400 font-semibold" : "text-slate-400"
                  }`}
                >
                  <Home className="h-4 w-4" />
                  Home
                </button>
                <button
                  onClick={() => router.push("/report")}
                  className={`hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer ${
                    pathname === "/report" ? "text-indigo-400 font-semibold" : "text-slate-400"
                  }`}
                >
                  <PlusCircle className="h-4 w-4" />
                  Report Issue
                </button>
                <button
                  onClick={() => router.push("/my-reports")}
                  className={`hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer ${
                    pathname === "/my-reports" ? "text-indigo-400 font-semibold" : "text-slate-400"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  My Reports
                </button>
              </>
            )}

            {isAuthority && (
              <>
                <button
                  onClick={() => router.push("/dashboard")}
                  className={`hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer ${
                    pathname === "/dashboard" ? "text-indigo-400 font-semibold" : "text-slate-400"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="hover:text-white transition-colors flex items-center gap-1.5 text-slate-400 cursor-pointer"
                >
                  <Building className="h-4 w-4" />
                  Control Center
                </button>
              </>
            )}
          </nav>

          {/* User profile actions */}
          <div className="flex items-center gap-4 relative">
            {isCitizen && (
              <button
                onClick={() => router.push("/report")}
                className="hidden sm:inline-flex rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.98] cursor-pointer"
              >
                Report Issue
              </button>
            )}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 focus:outline-none cursor-pointer"
                >
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="h-8 w-8 rounded-full border border-indigo-500/30 object-cover hover:border-indigo-500 transition-colors"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:border-indigo-500 hover:text-white transition-colors">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <>
                      {/* Overlay background to close on click outside */}
                      <div 
                        className="fixed inset-0 z-40 cursor-default" 
                        onClick={() => setMenuOpen(false)}
                      />
                      
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl backdrop-blur-xl z-50 text-slate-200"
                      >
                        {/* Profile Info Summary */}
                        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800">
                          <span className="text-sm font-bold text-white leading-none">
                            {user.displayName || "Anonymous User"}
                          </span>
                          <span className="text-xs text-slate-400 truncate mt-1">
                            {user.email}
                          </span>
                          <span className="mt-2.5 inline-block self-start rounded-full bg-indigo-950 border border-indigo-900/60 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-400 capitalize">
                            Role: {role || "Citizen"}
                          </span>
                        </div>

                        {/* Menu Options */}
                        <div className="flex flex-col gap-1 pt-3">
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setShowProfileModal(true);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-left cursor-pointer"
                          >
                            <User className="h-4 w-4 text-slate-400" />
                            My Profile
                          </button>

                          {isCitizen && (
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                router.push("/my-reports");
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-left cursor-pointer"
                            >
                              <FileText className="h-4 w-4 text-slate-400" />
                              My Reports
                            </button>
                          )}

                          {isAuthority && (
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                router.push("/dashboard");
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-left cursor-pointer"
                            >
                              <LayoutDashboard className="h-4 w-4 text-slate-400" />
                              Dashboard
                            </button>
                          )}

                          <button
                            onClick={handleLogout}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-red-950/25 text-red-400 hover:text-red-300 transition-all text-left mt-1 border-t border-slate-800/50 pt-2 cursor-pointer"
                          >
                            <LogOut className="h-4 w-4" />
                            Logout
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* User Profile Details Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Modal Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-black"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl z-50 text-slate-200 font-sans"
            >
              <h3 className="text-lg font-bold text-white mb-4">User Profile</h3>
              
              <div className="flex flex-col items-center gap-3 text-center mb-6">
                {user?.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="h-20 w-20 rounded-full border border-indigo-500/45 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-950 border border-slate-850 text-slate-400 animate-pulse">
                    <User className="h-10 w-10" />
                  </div>
                )}
                <div>
                  <h4 className="text-base font-bold text-white">{user?.displayName || "Anonymous User"}</h4>
                  <p className="text-xs text-slate-450 mt-1">{user?.email}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-850">
                <div className="flex justify-between">
                  <span className="text-slate-500 uppercase font-semibold tracking-wider text-[10px]">User ID</span>
                  <span className="font-mono text-slate-350 truncate max-w-[180px]">{user?.uid}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 uppercase font-semibold tracking-wider text-[10px]">Role</span>
                  <span className="rounded bg-indigo-950 border border-indigo-900 px-2.5 py-0.5 font-bold text-indigo-400 capitalize">
                    {role || "Citizen"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowProfileModal(false)}
                className="mt-6 w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 text-xs font-semibold shadow transition-all active:scale-[0.98] cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
