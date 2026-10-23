// ============================================
// 8CM — Monitor audit log
// ============================================
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

export async function logAction(action, { resourceType = "", resourceId = "", summary = "" } = {}) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, "activityLogs"), {
      action,
      resourceType,
      resourceId,
      summary,
      monitorUid: user.uid,
      monitorName: user.displayName || user.email || "Monitor",
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

export function subscribeAuditLog(callback, maxEntries = 100) {
  const q = query(
    collection(db, "activityLogs"),
    orderBy("timestamp", "desc"),
    limit(maxEntries)
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestampMs: data.timestamp && data.timestamp.toMillis ? data.timestamp.toMillis() : 0,
        };
      });
      callback(entries);
    },
    (err) => {
      console.error("Failed to load audit log:", err);
      callback(null);
    }
  );
}

export function formatAuditEntry(entry) {
  const when = entry.timestampMs
    ? new Date(entry.timestampMs).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
  const who = entry.monitorName || entry.monitorUid || "Monitor";
  const what =
    entry.summary ||
    `${entry.action || "action"}${entry.resourceType ? " " + entry.resourceType : ""}`.trim();
  return { when, who, what, action: entry.action, resourceType: entry.resourceType };
}
