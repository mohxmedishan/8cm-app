// ============================================
// 8CM — Achievements (lightweight)
// ------------------------------------------------
// Recognition only — no scoring, no leaderboards, no badge trees.
// Monitors award an achievement to a student; students and anyone else
// can read them on the achievements page. Public-read, monitor-write.
// ============================================
import {
collection,
doc,
addDoc,
updateDoc,
deleteDoc,
onSnapshot,
query,
orderBy,
serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { getStudentsSync, loadStudents, onStudents } from "./students.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);

let cache = [];
let isCurrentMonitor = false;
let editingId = null;
let latestStudents = [];

const listeners = new Set();

function notify() {
listeners.forEach((cb) => cb(cache.slice()));
}

export function onAchievements(callback) {
listeners.add(callback);
callback(cache.slice());
return () => listeners.delete(callback);
}

function escapeHtml(s) {
return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[c])
);
}

function studentName(studentId) {
const s = latestStudents.find((x) => x.id === studentId);
return s ? s.name : studentId;
}

function startListener() {
const q = query(collection(db, "achievements"), orderBy("date", "desc"));
return onSnapshot(
q,
(snap) => {
cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
renderPublic();
renderManage();
notify();
},
(err) => {
console.error("Failed to load achievements:", err);
const container = $("achievementsList");
if (container) container.innerHTML = <p class="empty-body">Couldn't load achievements right now.</p>;
}
);
}

function renderPublic() {
const container = $("achievementsList");
if (!container) return;

if (cache.length === 0) {
container.innerHTML = <div class="empty-state"> <p class="empty-title">The board is empty. For now.</p> <p class="empty-body">Academic, sport, or competition wins get logged here as they happen.</p> </div> ;
return;
}

// Group by student for readability
const byStudent = new Map();
cache.forEach((a) => {
if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []);
byStudent.get(a.studentId).push(a);
});

container.innerHTML = [...byStudent.entries()]
.map(([sid, items]) => <article class="achievement-group"> <h3 class="achievement-student">${escapeHtml(studentName(sid))}</h3> <ul class="achievement-list"> ${items .map( (a) =>
<li class="achievement-item">
<span class="task-tag announcement">${escapeHtml(a.category || "General")}</span>
<div class="achievement-body">
<p class="task-subject">${escapeHtml(a.title)}</p>
${a.description ? <p class="task-detail">${escapeHtml(a.description)}</p> : ""}
${a.date ? <p class="achievement-date">${escapeHtml(a.date)}</p> : ""}
</div>
</li>
) .join("")} </ul> </article> )
.join("");
}

function populateStudentSelect() {
const select = $("achievementForm") && $("achievementForm").studentId;
if (!select) return;
const current = select.value;
select.innerHTML = "";
[...latestStudents]
.sort((a, b) => a.name.localeCompare(b.name))
.forEach((s) => {
const opt = document.createElement("option");
opt.value = s.id;
opt.textContent = ${s.rollNumber}. ${s.name};
select.appendChild(opt);
});
if (current) select.value = current;
}

function renderManage() {
const list = $("achievementManageList");
if (!list) return;

if (!isCurrentMonitor) {
list.innerHTML = <p class="task-empty">Only monitors can manage achievements.</p>;
return;
}
if (cache.length === 0) {
list.innerHTML = <p class="task-empty">No achievements yet.</p>;
return;
}

list.innerHTML = "";
cache.forEach((a) => {
const row = document.createElement("div");
row.className = "manage-row";
row.innerHTML = <div class="manage-row-body"> <p class="task-subject">${escapeHtml(a.title)}</p> <p class="task-detail">${escapeHtml(studentName(a.studentId))} · ${escapeHtml(a.category || "General")}${a.date ? " · " + escapeHtml(a.date) : ""}</p> </div> <div class="task-monitor-actions"> <button class="task-icon-btn" data-action="edit" data-id="${a.id}">✎</button> <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${a.id}">✕</button> </div> ;
list.appendChild(row);
});

list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
btn.addEventListener("click", () => openForm(cache.find((x) => x.id === btn.dataset.id)));
});
list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
btn.addEventListener("click", () => handleDelete(btn.dataset.id));
});
}

function openForm(a) {
const form = $("achievementForm");
if (!form) return;
populateStudentSelect();
editingId = a ? a.id : null;
form.studentId.value = (a && a.studentId) || form.studentId.options[0]?.value || "";
form.title.value = (a && a.title) || "";
form.description.value = (a && a.description) || "";
form.category.value = (a && a.category) || "General";
form.date.value = (a && a.date) || new Date().toISOString().slice(0, 10);
setFormError(null);
form.hidden = false;
form.querySelector('button[type="submit"]').textContent = a ? "Save changes" : "Add achievement";
playOpen();
form.title.focus();
}

function closeForm({ silent = false } = {}) {
const form = $("achievementForm");
if (!form) return;
form.reset();
form.hidden = true;
editingId = null;
setFormError(null);
if (!silent) playClose();
}

function setFormError(message) {
const el = $("achievementFormError");
if (!el) return;
el.hidden = !message;
el.textContent = message || "";
}

async function handleSubmit(e) {
e.preventDefault();
const form = e.target;
const payload = {
studentId: form.studentId.value,
title: form.title.value.trim(),
description: form.description.value.trim(),
category: form.category.value,
date: form.date.value || "",
};
if (!payload.studentId || !payload.title) return;

setFormError(null);
const submitBtn = form.querySelector('button[type="submit"]');
const orig = submitBtn.textContent;
submitBtn.disabled = true;
submitBtn.textContent = "Saving…";

try {
if (editingId) {
await updateDoc(doc(db, "achievements", editingId), payload);
await logAction("updated", {
resourceType: "achievement",
resourceId: editingId,
summary: Updated achievement for ${studentName(payload.studentId)}: ${payload.title},
});
} else {
const ref = await addDoc(collection(db, "achievements"), {
...payload,
awardedAt: serverTimestamp(),
});
await logAction("created", {
resourceType: "achievement",
resourceId: ref.id,
summary: Awarded ${payload.title} to ${studentName(payload.studentId)},
});
}
playSuccess();
closeForm({ silent: true });
} catch (err) {
console.error("Save failed:", err);
playError();
setFormError("Couldn't save that — check your monitor access and try again.");
} finally {
submitBtn.disabled = false;
submitBtn.textContent = orig;
}
}

async function handleDelete(id) {
if (!confirm("Delete this achievement?")) return;
try {
await deleteDoc(doc(db, "achievements", id));
await logAction("deleted", { resourceType: "achievement", resourceId: id, summary: "Deleted achievement" });
playDelete();
} catch (err) {
console.error("Delete failed:", err);
playError();
alert("Couldn't delete that — check your monitor access.");
}
}

export function initAchievements() {
const needsData = !!$("achievementsList") || !!$("achievementManageList");
if (!needsData) return;

startListener();

onStudents((list) => {
latestStudents = list;
renderPublic();
renderManage();
// If the form is open, refresh its select without losing the choice
const form = $("achievementForm");
if (form && !form.hidden) populateStudentSelect();
});
loadStudents().catch(() => {});
latestStudents = getStudentsSync();

subscribeAuth(({ monitor }) => {
isCurrentMonitor = monitor;
const addBtn = $("addAchievementBtn");
if (addBtn) addBtn.hidden = !monitor;
renderManage();
});

const addBtn = $("addAchievementBtn");
if (addBtn) addBtn.addEventListener("click", () => openForm(null));

const form = $("achievementForm");
if (form) {
form.addEventListener("submit", handleSubmit);
const cancelBtn = form.querySelector('[data-action="cancel"]');
if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
}
}
