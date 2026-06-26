"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { db } from "@/lib/firestore";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs 
} from "firebase/firestore";
import { createAuditLog } from "@/lib/audit";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  ShieldAlert, 
  UserPlus, 
  UserX, 
  Search, 
  Filter, 
  CheckCircle, 
  Ban, 
  RefreshCw, 
  Trash2, 
  UserCheck, 
  Shield, 
  Users, 
  Mail, 
  User, 
  ChevronRight, 
  Activity 
} from "lucide-react";

interface WhitelistEntry {
  email: string;
  displayName: string;
  role: "authority" | "super_admin";
  status: "active" | "blocked";
  createdAt: unknown;
  createdBy: string;
}

interface UserEntry {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: string;
  createdAt: unknown;
  lastLogin: unknown;
  lastSeen?: unknown;
  isOnline?: boolean;
}

export default function SuperAdminPanel() {
  const { user: currentUser, role: currentRole } = useAuth();
  
  // Whitelist State
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [whitelistLoading, setWhitelistLoading] = useState(true);
  const [searchWhitelist, setSearchWhitelist] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Add form fields
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"authority" | "super_admin">("authority");
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Users State
  const [usersList, setUsersList] = useState<UserEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [searchUsers, setSearchUsers] = useState("");
  const [filterUserRole, setFilterUserRole] = useState<string>("All");

  // Tab State
  const [activeTab, setActiveTab] = useState<"whitelist" | "users">("whitelist");

  // Realtime subscription to authorizedAuthorities
  useEffect(() => {
    const whitelistRef = collection(db, "authorizedAuthorities");
    const unsubscribe = onSnapshot(
      whitelistRef,
      (snapshot) => {
        const data: WhitelistEntry[] = [];
        snapshot.forEach((docSnap) => {
          data.push({ email: docSnap.id, ...docSnap.data() } as WhitelistEntry);
        });
        setWhitelist(data);
        setWhitelistLoading(false);
      },
      (err) => {
        console.error("Error subscribing to whitelist:", err);
        setWhitelistLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Realtime subscription to users collection
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const data: UserEntry[] = [];
        snapshot.forEach((docSnap) => {
          data.push({ uid: docSnap.id, ...docSnap.data() } as UserEntry);
        });
        setUsersList(data);
        setUsersLoading(false);
      },
      (err) => {
        console.error("Error subscribing to users list:", err);
        setUsersLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Helper: sync user role in users collection
  const syncUserRoleByEmail = async (email: string, targetRole: string) => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);
      
      const updates = querySnapshot.docs.map((docSnap) => {
        const userRef = doc(db, "users", docSnap.id);
        return updateDoc(userRef, { role: targetRole });
      });
      await Promise.all(updates);
    } catch (err) {
      console.error("Error syncing role to users collection:", err);
    }
  };

  // Add Authority to Whitelist
  const handleAddAuthority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newDisplayName.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }

    const emailKey = newEmail.trim().toLowerCase();
    setSubmittingAdd(true);

    try {
      const docRef = doc(db, "authorizedAuthorities", emailKey);
      
      const newEntry: WhitelistEntry = {
        email: emailKey,
        displayName: newDisplayName.trim(),
        role: newRole,
        status: "active",
        createdAt: new Date(), // Local fallback, serverTimestamp resolves later
        createdBy: currentUser?.email || "Super Admin",
      };

      // Write to authorizedAuthorities
      await setDoc(docRef, {
        email: emailKey,
        displayName: newEntry.displayName,
        role: newEntry.role,
        status: newEntry.status,
        createdAt: serverTimestamp(),
        createdBy: newEntry.createdBy,
      });

      // Synchronize role to users collection immediately
      await syncUserRoleByEmail(emailKey, newRole);

      // Audit Log
      await createAuditLog({
        action: "Authority Created",
        performedByUid: currentUser?.uid || "system",
        performedByName: currentUser?.displayName || "Super Admin",
        performedByEmail: currentUser?.email || "",
        performedByRole: currentRole || "super_admin",
        after: { email: emailKey, displayName: newEntry.displayName, role: newEntry.role, status: newEntry.status },
        metadata: { authorityEmail: emailKey }
      });

      toast.success("Authority whitelisted successfully!");
      setNewEmail("");
      setNewDisplayName("");
      setShowAddForm(false);
    } catch (err: unknown) {
      console.error("Failed to add whitelist entry:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${errMsg}`);
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Remove Authority from Whitelist
  const handleRemoveAuthority = async (entry: WhitelistEntry) => {
    const isSelf = currentUser?.email?.toLowerCase() === entry.email.toLowerCase();
    if (isSelf) {
      toast.error("You cannot remove your own whitelist entry.");
      return;
    }

    if (!confirm(`Are you sure you want to remove ${entry.displayName} from the whitelist?`)) {
      return;
    }

    try {
      const docRef = doc(db, "authorizedAuthorities", entry.email);
      await deleteDoc(docRef);

      // Revert role in users collection to citizen
      await syncUserRoleByEmail(entry.email, "citizen");

      // Audit Log
      await createAuditLog({
        action: "Authority Removed",
        performedByUid: currentUser?.uid || "system",
        performedByName: currentUser?.displayName || "Super Admin",
        performedByEmail: currentUser?.email || "",
        performedByRole: currentRole || "super_admin",
        before: { email: entry.email, displayName: entry.displayName, role: entry.role, status: entry.status },
        metadata: { authorityEmail: entry.email }
      });

      toast.success("Authority removed from whitelist.");
    } catch (err: unknown) {
      console.error("Failed to delete whitelist entry:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${errMsg}`);
    }
  };

  // Block / Activate Authority status
  const handleToggleStatus = async (entry: WhitelistEntry) => {
    const isSelf = currentUser?.email?.toLowerCase() === entry.email.toLowerCase();
    if (isSelf) {
      toast.error("You cannot block or modify your own status.");
      return;
    }

    const nextStatus = entry.status === "active" ? "blocked" : "active";
    const auditAction = nextStatus === "blocked" ? "Authority Blocked" : "Authority Activated";

    try {
      const docRef = doc(db, "authorizedAuthorities", entry.email);
      await updateDoc(docRef, { status: nextStatus });

      // If blocked, downgrade user collection role to citizen immediately
      // If activated, restore their whitelist role
      const syncedRole = nextStatus === "blocked" ? "citizen" : entry.role;
      await syncUserRoleByEmail(entry.email, syncedRole);

      // Audit Log
      await createAuditLog({
        action: auditAction,
        performedByUid: currentUser?.uid || "system",
        performedByName: currentUser?.displayName || "Super Admin",
        performedByEmail: currentUser?.email || "",
        performedByRole: currentRole || "super_admin",
        before: { status: entry.status },
        after: { status: nextStatus },
        metadata: { authorityEmail: entry.email }
      });

      toast.success(`Authority status updated to ${nextStatus}.`);
    } catch (err: unknown) {
      console.error("Failed to update status:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${errMsg}`);
    }
  };

  // Change Role
  const handleChangeRole = async (entry: WhitelistEntry, targetRole: "authority" | "super_admin") => {
    const isSelf = currentUser?.email?.toLowerCase() === entry.email.toLowerCase();
    if (isSelf) {
      toast.error("You cannot downgrade or change your own role.");
      return;
    }

    if (entry.role === targetRole) return;

    try {
      const docRef = doc(db, "authorizedAuthorities", entry.email);
      await updateDoc(docRef, { role: targetRole });

      // Sync user collection if they are currently active (not blocked)
      if (entry.status === "active") {
        await syncUserRoleByEmail(entry.email, targetRole);
      }

      // Audit Log
      await createAuditLog({
        action: "Role Changed",
        performedByUid: currentUser?.uid || "system",
        performedByName: currentUser?.displayName || "Super Admin",
        performedByEmail: currentUser?.email || "",
        performedByRole: currentRole || "super_admin",
        before: { role: entry.role },
        after: { role: targetRole },
        metadata: { authorityEmail: entry.email, previousRole: entry.role, newRole: targetRole }
      });

      toast.success(`Role updated to ${targetRole}.`);
    } catch (err: unknown) {
      console.error("Failed to update role:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Error: ${errMsg}`);
    }
  };

  // Filter Whitelist
  const filteredWhitelist = whitelist.filter((entry) => {
    const matchesSearch = entry.email.toLowerCase().includes(searchWhitelist.toLowerCase()) || 
                          entry.displayName.toLowerCase().includes(searchWhitelist.toLowerCase());
    return matchesSearch;
  });

  // Filter & Search Users
  const filteredUsers = usersList.filter((userEntry) => {
    const matchesSearch = userEntry.displayName.toLowerCase().includes(searchUsers.toLowerCase()) ||
                          userEntry.email.toLowerCase().includes(searchUsers.toLowerCase()) ||
                          userEntry.uid.toLowerCase().includes(searchUsers.toLowerCase());
    const matchesFilter = filterUserRole === "All" || userEntry.role === filterUserRole;
    return matchesSearch && matchesFilter;
  });

  const formatTimestamp = (ts: unknown) => {
    if (!ts) return "Syncing...";
    const hasToDate = ts && typeof ts === "object" && "toDate" in ts && typeof (ts as { toDate: unknown }).toDate === "function";
    const date = hasToDate ? (ts as { toDate: () => Date }).toDate() : new Date(ts as string | number | Date);
    return date.toLocaleString();
  };

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

  return (
    <div className="space-y-6 font-sans text-slate-100">
      {/* Super Admin Top Navigation tabs */}
      <div className="flex border-b border-slate-900">
        <button
          onClick={() => setActiveTab("whitelist")}
          className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "whitelist"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Shield className="h-4 w-4" />
          Whitelisted Authorities
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "users"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" />
          User Directory & Presence
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "whitelist" ? (
          <motion.div
            key="whitelist-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Whitelist controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-slate-900 bg-slate-900/20 p-4 backdrop-blur-sm">
              <div className="relative flex-1 min-w-[260px] w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-550" />
                <input
                  type="text"
                  placeholder="Search whitelist by name or email..."
                  value={searchWhitelist}
                  onChange={(e) => setSearchWhitelist(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-semibold shadow shadow-indigo-600/20 transition-all active:scale-[0.98] cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                {showAddForm ? "Close Form" : "Whitelist New Authority"}
              </button>
            </div>

            {/* Whitelist entry form */}
            {showAddForm && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddAuthority}
                className="p-5 rounded-xl border border-indigo-900/30 bg-indigo-950/5 space-y-4 max-w-xl"
              >
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                  <UserCheck className="h-4 w-4" /> Add Authority Credentials
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. officer@city.gov"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/50 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-slate-500">Officer Display Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Officer Ryan"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/50 py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Assigned Role</span>
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-900 text-xs">
                      <button
                        type="button"
                        onClick={() => setNewRole("authority")}
                        className={`px-3 py-1 font-bold rounded transition-all cursor-pointer ${
                          newRole === "authority" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Authority
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRole("super_admin")}
                        className={`px-3 py-1 font-bold rounded transition-all cursor-pointer ${
                          newRole === "super_admin" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Super Admin
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingAdd}
                    className="w-full sm:w-auto rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-5 text-xs font-semibold shadow transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {submittingAdd ? "Whitelisting..." : "Save Whitelist Access"}
                  </button>
                </div>
              </motion.form>
            )}

            {/* Whitelist Display List */}
            <div className="rounded-xl border border-slate-900 bg-slate-950 overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/35 border-b border-slate-900 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      <th className="p-4">Name / Email</th>
                      <th className="p-4">Authority Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Created By</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelistLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
                          <span className="text-xs">Loading authorization whitelist...</span>
                        </td>
                      </tr>
                    ) : filteredWhitelist.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 text-xs">
                          No whitelisted authorities found.
                        </td>
                      </tr>
                    ) : (
                      filteredWhitelist.map((entry) => {
                        const isSelf = currentUser?.email?.toLowerCase() === entry.email.toLowerCase();
                        return (
                          <tr 
                            key={entry.email}
                            className="border-b border-slate-900/50 hover:bg-slate-900/10 text-xs text-slate-350"
                          >
                            <td className="p-4">
                              <div className="font-semibold text-slate-200">{entry.displayName}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Mail className="h-3 w-3" /> {entry.email}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold capitalize ${getRoleBadge(entry.role)}`}>
                                {entry.role === "super_admin" ? "Super Admin" : "Authority"}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                                entry.status === "active" 
                                  ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/20" 
                                  : "text-red-400 bg-red-950/20 border-red-500/20"
                              }`}>
                                {entry.status}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="text-slate-400 font-medium">{entry.createdBy}</div>
                              <div className="text-[9px] text-slate-600 mt-0.5">
                                {formatTimestamp(entry.createdAt)}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* Toggle Status */}
                                <button
                                  onClick={() => handleToggleStatus(entry)}
                                  disabled={isSelf}
                                  title={entry.status === "active" ? "Block Authority" : "Activate Authority"}
                                  className={`rounded p-1.5 border transition-all ${
                                    entry.status === "active"
                                      ? "border-red-900/40 text-red-400 hover:bg-red-950/30"
                                      : "border-emerald-900/40 text-emerald-400 hover:bg-emerald-950/30"
                                  } disabled:opacity-30 disabled:pointer-events-none cursor-pointer`}
                                >
                                  {entry.status === "active" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                                </button>

                                {/* Toggle Role */}
                                <button
                                  onClick={() => handleChangeRole(entry, entry.role === "authority" ? "super_admin" : "authority")}
                                  disabled={isSelf}
                                  title={entry.role === "authority" ? "Make Super Admin" : "Demote to Authority"}
                                  className="rounded p-1.5 border border-indigo-900/40 text-indigo-400 hover:bg-indigo-950/30 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </button>

                                {/* Delete whitelist entry */}
                                <button
                                  onClick={() => handleRemoveAuthority(entry)}
                                  disabled={isSelf}
                                  title="Delete Authority"
                                  className="rounded p-1.5 border border-slate-800 text-slate-400 hover:border-red-500 hover:text-red-400 hover:bg-red-950/20 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="users-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Search and filter registered users */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-slate-900 bg-slate-900/20 p-4 backdrop-blur-sm">
              <div className="relative flex-1 min-w-[260px] w-full">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-550" />
                <input
                  type="text"
                  placeholder="Search users by name, email, or UID..."
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/40 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto w-full sm:w-auto">
                <Filter className="h-3.5 w-3.5 text-slate-550" />
                <select
                  value={filterUserRole}
                  onChange={(e) => setFilterUserRole(e.target.value)}
                  className="w-full sm:w-auto rounded-lg border border-slate-800 bg-slate-950/40 py-2 px-3 text-xs text-slate-350 outline-none focus:border-indigo-500"
                >
                  <option value="All">All Roles</option>
                  <option value="citizen">Citizens</option>
                  <option value="authority">Authorities</option>
                  <option value="super_admin">Super Admins</option>
                </select>
              </div>
            </div>

            {/* Users Display table */}
            <div className="rounded-xl border border-slate-900 bg-slate-950 overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/35 border-b border-slate-900 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      <th className="p-4">User Details</th>
                      <th className="p-4">Associated Role</th>
                      <th className="p-4">Realtime Presence</th>
                      <th className="p-4">Last Activity Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">
                          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
                          <span className="text-xs">Loading user directories...</span>
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500 text-xs">
                          No users matching search queries were located.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((userEntry) => (
                        <tr 
                          key={userEntry.uid}
                          className="border-b border-slate-900/50 hover:bg-slate-900/10 text-xs text-slate-350"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {userEntry.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={userEntry.photoURL}
                                  alt={userEntry.displayName}
                                  className="h-8 w-8 rounded-full border border-slate-800 object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 border border-slate-850 text-slate-500">
                                  <User className="h-4.5 w-4.5" />
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-200">{userEntry.displayName}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Mail className="h-3 w-3" /> {userEntry.email}
                                </div>
                                <div className="text-[9px] text-slate-650 font-mono mt-0.5">UID: {userEntry.uid}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold capitalize ${getRoleBadge(userEntry.role)}`}>
                              {userEntry.role === "super_admin" ? "Super Admin" : userEntry.role === "authority" ? "Authority" : "Citizen"}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${
                                userEntry.isOnline 
                                  ? "bg-emerald-500 shadow shadow-emerald-500/55 animate-pulse" 
                                  : "bg-slate-750"
                              }`} />
                              <span className={`font-semibold ${userEntry.isOnline ? "text-emerald-400" : "text-slate-500"}`}>
                                {userEntry.isOnline ? "Online" : "Offline"}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-0.5 text-[10px] text-slate-400 font-medium">
                              <div><span className="text-slate-600">Last Seen:</span> {formatTimestamp(userEntry.lastSeen)}</div>
                              <div><span className="text-slate-600">Last Session:</span> {formatTimestamp(userEntry.lastLogin)}</div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
