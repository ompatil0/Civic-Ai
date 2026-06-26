import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firestore";

export interface AuditLogPayload {
  issueId?: string | null;
  action: string;
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  performedByRole: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export async function createAuditLog(payload: AuditLogPayload) {
  try {
    const logsRef = collection(db, "auditLogs");
    await addDoc(logsRef, {
      issueId: payload.issueId || null,
      action: payload.action,
      performedByUid: payload.performedByUid,
      performedByName: payload.performedByName,
      performedByEmail: payload.performedByEmail,
      performedByRole: payload.performedByRole,
      timestamp: serverTimestamp(),
      before: payload.before || null,
      after: payload.after || null,
      metadata: payload.metadata || {},
    });
  } catch (error) {
    console.error("Error creating audit log in Firestore:", error);
  }
}
