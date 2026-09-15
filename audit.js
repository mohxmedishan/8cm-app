// ============================================
// 8CM — Monitor audit log
// ------------------------------------------------
// Append-only record of important monitor actions. Firestore rules
// (activityLogs) enforce: monitor-only read, monitor-only create,
// no update/delete. This module is a thin client for producing and
// displaying those entries.
//
// Writes are intentionally fire-and-forget: an audit-log failure must
// never block the actual content operation it's recording. We do a
// single addDoc per action — no batching games, no notification spam.
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

// action: short verb ("created" | "updated" | "deleted" | "deactivated" | ...)
// info: { resourceType, resourceId, summary }
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
// Non-fatal — the actual content change already succeeded.
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
callback(null); // null = failed, distinct from empty list
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
${entry.action || "action"}${entry.resourceType ? " " + entry.resourceType : ""}.trim();
return { when, who, what, action: entry.action, resourceType: entry.resourceType };
}
