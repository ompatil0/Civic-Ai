"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/firestore";
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { createAuditLog } from "@/lib/audit";

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  logout: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, "users", firebaseUser.uid);
        
        // Set presence on login/session restore
        updateDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp(),
        }).catch((err) => {
          console.warn("Presence update failed:", err);
        });

        unsubscribeUserDoc = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setRole(docSnap.data().role || "citizen");
            } else {
              setRole("citizen");
            }
            setLoading(false);
          },
          (error) => {
            console.error("User doc snapshot error:", error);
            setRole("citizen");
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // Browser Close handler
  useEffect(() => {
    if (!user) return;
    
    const handleBeforeUnload = () => {
      const userRef = doc(db, "users", user.uid);
      // Attempt to set offline and update lastSeen before page teardown
      updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp(),
      }).catch(console.error);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user]);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      if (user) {
        // Audit Log
        await createAuditLog({
          action: "Logout",
          performedByUid: user.uid,
          performedByName: user.displayName || "Anonymous User",
          performedByEmail: user.email || "",
          performedByRole: role || "citizen",
          before: { isOnline: true },
          after: { isOnline: false }
        }).catch(console.error);

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp(),
        }).catch(console.error);
      }
      await firebaseSignOut(auth);
      setUser(null);
      setRole(null);
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, logout: handleSignOut, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
