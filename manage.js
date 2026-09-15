// ============================================
// 8CM — Student management (monitor-only UI)
// ------------------------------------------------
// Lets monitors add / edit / deactivate students. Client-side UI only
// — Firestore rules are the actual authority (students/{id} write is
// monitor-only). Deactivating a student keeps their doc and any claim
// intact (so their identity can't be poached) but drops them from the
// public directory.
// ============================================
import {
doc,
setDoc,
deleteDoc,
getDoc,
collection,
query,
where,
getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { loadStudents, onStudents, invalidateStudentsCache } from "./students.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);

let isCurrentMonitor = false;
let editingId = null;
let currentList = [];
let claimsByStudent = new Map(); // studentId -> uid (loaded lazily)
let claimsLoaded = false;

function slug(name) {
return name
.toLowerCase()
.replace(/[^a-z0-9]+/g, "-")
.replace(/(^-|-$)/g, "");
}

function newStudentId() {
// Timestamp-based; no collision risk in practice for a single class.
return student-${Date.now().toString(36)};
}

function transportLabel(t) {
if (!t) return "—";
return t === "OT" ? "Own transport" : Bus ${t};
}

async function loadClaimsForList(list) {
// One query, not one per row. Reads the whole claims collection —
// ~30 docs max in this class. Deliberately lazy so the manage panel
// doesn't pay for it unless the student tab is actually opened.
try {
const snap = await getDocs(collection(db, "claims"));
const map = new Map();
snap.forEach((d) => {
const data = d.data();
if (data && data.uid) map.set(d.id, data.uid);
});
claimsByStudent = map;
claimsLoaded = true;
} catch (err) {
console.error("Failed to load claims:", err);
claimsByStudent = new Map();
claimsLoaded = true;
}
}

function render() {
const list = $("studentManageList");
if (!list) return;

if (!isCurrentMonitor) {
list.innerHTML = <p class="task-empty">Only monitors can manage students.</p>;
return;
}
if (currentList.length === 0) {
list.innerHTML = <p class="task-empty">No students loaded yet.</p>;
return;
}

list.innerHTML = "";
currentList.forEach((s) => {
const claimed = claimsByStudent.has(s.id);
const inactive = s.active === false;
const row = document.createElement("div");
row.className = manage-row${inactive ? " is-inactive" : ""};
row.innerHTML = <span class="roll-badge">${String(s.rollNumber || "?").padStart(2, "0")}</span> <div class="manage-row-body"> <p class="task-subject"> ${s.name} ${inactive ?<span class="inactive-tag">inactive</span>: ""} ${claimed ?<span class="claimed-tag" title="Identity claimed by an account">claimed</span>: ""} </p> <p class="task-detail"> <span class="house-dot ${s.house}"></span> ${s.house} · ${s.language || "—"} · ${transportLabel(s.transport)} </p> </div> <div class="task-monitor-actions"> ${claimed ?<button class="task-icon-btn" data-action="release" data-id="${s.id}" title="Release this student's claim">⌫</button>: ""} <button class="task-icon-btn" data-action="edit" data-id="${s.id}" aria-label="Edit student">✎</button> <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${s.id}" aria-label="Deactivate student">✕</button> </div> ;
list.appendChild(row);
});

list.querySelectorAll('[data-action="edit"]').forEach((btn) =>
btn.addEventListener("click", () => openForm(currentList.find((x) => x.id === btn.dataset.id)))
);
list.querySelectorAll('[data-action="delete"]').forEach((btn) =>
btn.addEventListener("click", () => handleDeactivate(btn.dataset.id))
);
list.querySelectorAll('[data-action="release"]').forEach((btn) =>
btn.addEventListener("click", () => handleReleaseClaim(btn.dataset.id))
);
}

function openForm(student) {
const form = $("studentForm");
if (!form) return;
editingId = student ? student.id : null;
form.name.value = (student && student.name) || "";
form.house.value = (student && student.house) || "autumn";
form.language.value = (student && student.language) || "";
form.transport.value = (student && student.transport) || "";
form.rollNumber.value = (student && student.rollNumber) ||
(currentList.reduce((m, s) => Math.max(m, s.rollNumber || 0), 0) + 1);
form.active.checked = student ? student.active !== false : true;
setFormError(null);
form.hidden = false;
form.querySelector('button[type="submit"]').textContent = student ? "Save changes" : "Add student";
playOpen();
form.name.focus();
}

function closeForm({ silent = false } = {}) {
const form = $("studentForm");
if (!form) return;
form.reset();
form.hidden = true;
editingId = null;
setFormError(null);
if (!silent) playClose();
}

function setFormError(message) {
const el = $("studentFormError");
if (!el) return;
el.hidden = !message;
el.textContent = message || "";
}

async function handleSubmit(e) {
e.preventDefault();
const form = e.target;
const payload = {
name: form.name.value.trim(),
house: form.house.value,
language: form.language.value || null,
transport: form.transport.value.trim(),
rollNumber: parseInt(form.rollNumber.value, 10) || 0,
active: form.active.checked,
};
if (!payload.name || !payload.rollNumber) return;

setFormError(null);
const submitBtn = form.querySelector('button[type="submit"]');
const orig = submitBtn.textContent;
submitBtn.disabled = true;
submitBtn.textContent = "Saving…";

try {
if (editingId) {
// merge:true so this still works for a student doc that was never
// migrated to Firestore (upserts the same id).
await setDoc(doc(db, "students", editingId), { id: editingId, ...payload }, { merge: true });
await logAction("updated", {
resourceType: "student",
resourceId: editingId,
summary: Updated student: ${payload.name},
});
} else {
const id = newStudentId();
await setDoc(doc(db, "students", id), { id, ...payload });
await logAction("created", {
resourceType: "student",
resourceId: id,
summary: Added student: ${payload.name},
});
}
playSuccess();
closeForm({ silent: true });
await invalidateStudentsCache();
claimsLoaded = false; // force re-read on next render
} catch (err) {
console.error("Save failed:", err);
playError();
setFormError("Couldn't save that — check your monitor access and try again.");
} finally {
submitBtn.disabled = false;
submitBtn.textContent = orig;
}
}

async function handleDeactivate(id) {
const student = currentList.find((s) => s.id === id);
if (!student) return;
if (!confirm(Deactivate ${student.name}? They'll disappear from the directory. Their claim (if any) stays.)) return;
try {
await setDoc(doc(db, "students", id), { active: false }, { merge: true });
await logAction("deactivated", {
resourceType: "student",
resourceId: id,
summary: Deactivated student: ${student.name},
});
playDelete();
await invalidateStudentsCache();
} catch (err) {
console.error("Deactivate failed:", err);
playError();
alert("Couldn't deactivate that — check your monitor access.");
}
}

async function handleReleaseClaim(studentId) {
const student = currentList.find((s) => s.id === studentId);
if (!student) return;
if (!confirm(Release the identity claim on ${student.name}? The account that claimed this student will lose their link.)) return;
try {
await deleteDoc(doc(db, "claims", studentId));
await logAction("released-claim", {
resourceType: "claim",
resourceId: studentId,
summary: Released identity claim on ${student.name},
});
playDelete();
claimsByStudent.delete(studentId);
render();
} catch (err) {
console.error("Release claim failed:", err);
playError();
alert("Couldn't release that claim — check your monitor access.");
}
}

export function initStudentManagement() {
if (!$("studentManageList")) return;

onStudents((list) => {
currentList = list;
render();
});
loadStudents().catch(() => {});

subscribeAuth(async ({ monitor }) => {
isCurrentMonitor = monitor;
const addBtn = $("addStudentBtn");
if (addBtn) addBtn.hidden = !monitor;

if (monitor && !claimsLoaded) {
  await loadClaimsForList(currentList);
  render();
}
render();

});

const addBtn = $("addStudentBtn");
if (addBtn) addBtn.addEventListener("click", () => openForm(null));

const form = $("studentForm");
if (form) {
form.addEventListener("submit", handleSubmit);
const cancelBtn = form.querySelector('[data-action="cancel"]');
if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
}
}

gallery.js
// ============================================
// 8CM — Gallery (no Firebase Storage required)
// ------------------------------------------------
// Photos are stored as externally-hosted URLs, not uploaded files —
// the class doesn't have Firebase Storage available and doesn't need
// it: monitors can paste a Google Drive / Imgur / wherever link.
//
// The seven original static photos remain as a code-side fallback so
// nothing visually breaks if the gallery collection is empty. A
// monitor can import them into Firestore (one batch write) once, then
// manage everything through the panel like any other entry.
//
// One onSnapshot listener per page that actually renders the gallery;
// pages like timetable.html or stats.html never subscribe.
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
writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playExternal } from "./sound.js";

const $ = (id) => document.getElementById(id);

export const SEED_GALLERY = [
{ url: "assets/gallery/5cm-motion-gate.jpg", title: "5CM Field Trip · Motion Gate", album: "Trips" },
{ url: "assets/gallery/6cm-warner-bros.jpg", title: "6CM Field Trip · Warner Bros", album: "Trips" },
{ url: "assets/gallery/7cm-assembly-1.jpg", title: "7CM Assembly", album: "Assemblies" },
{ url: "assets/gallery/7cm-assembly-2.jpg", title: "7CM Assembly", album: "Assemblies" },
{ url: "assets/gallery/7cm-english-1.jpg", title: "7CM English", album: "Classes" },
{ url: "assets/gallery/7cm-english-2.jpg", title: "7CM English", album: "Classes" },
{ url: "assets/gallery/7cm-field-trip-garvit.jpg", title: "7CM Field Trip · Garvit", album: "Trips" },
];

let cache = null; // null = not yet loaded; [] = loaded-and-empty
let isCurrentMonitor = false;
let editingId = null;

const listeners = new Set();

function visible() {
if (cache && cache.length > 0) return cache;
// Seed fallback — flagged so the manage panel can offer the import.
return SEED_GALLERY.map((s, i) => ({ id: seed-${i}, ...s, isSeed: true }));
}

function notify() {
listeners.forEach((cb) => cb(visible()));
}

export function onGallery(callback) {
listeners.add(callback);
callback(visible());
return () => listeners.delete(callback);
}

function escapeAttr(s) {
return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[c])
);
}

function startListener() {
const q = query(collection(db, "gallery"), orderBy("addedAt", "desc"));
return onSnapshot(
q,
(snap) => {
cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
renderPublicGrid();
renderManageList();
notify();
},
(err) => {
console.error("Failed to load gallery:", err);
if (cache === null) cache = []; // falls back to seed via visible()
renderPublicGrid();
renderManageList();
notify();
}
);
}

function renderPublicGrid() {
const grid = $("galleryGrid");
if (!grid) return;

const items = visible();
grid.innerHTML = items
.map(
(g) => <figure class="gallery-photo" tabindex="0" role="button" aria-label="View larger photo"> <img src="${escapeAttr(g.url)}" alt="${escapeAttr(g.title)}" loading="lazy"> <figcaption>${escapeAttr(g.title)}</figcaption> </figure>
)
.join("");
}

function renderManageList() {
const list = $("galleryManageList");
if (!list) return;

if (!isCurrentMonitor) {
list.innerHTML = <p class="task-empty">Only monitors can manage the gallery.</p>;
return;
}

const items = visible();
if (items.length === 0) {
list.innerHTML = <p class="task-empty">No photos yet.</p>;
return;
}

const hasReal = cache && cache.length > 0;
const showSeedHint = !hasReal && items.some((i) => i.isSeed);
const hintEl = $("gallerySeedHint");
if (hintEl) hintEl.hidden = !showSeedHint;

list.innerHTML = "";
items.forEach((g) => {
const row = document.createElement("div");
row.className = "manage-row";
row.innerHTML = <div class="manage-thumb"><img src="${escapeAttr(g.url)}" alt=""></div> <div class="manage-row-body"> <p class="task-subject">${escapeAttr(g.title)}${g.isSeed ? <span class="inactive-tag">static</span>: ""}</p> <p class="task-detail">${escapeAttr(g.album || "—")}${g.date ? " · " + escapeAttr(g.date) : ""}</p> </div> <div class="task-monitor-actions"> ${!g.isSeed ?<button class="task-icon-btn" data-action="edit" data-id="${g.id}">✎</button>: ""} ${!g.isSeed ?<button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${g.id}">✕</button>: ""} </div> ;
list.appendChild(row);
});

list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
btn.addEventListener("click", () => openForm((cache || []).find((x) => x.id === btn.dataset.id)));
});
list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
btn.addEventListener("click", () => handleDelete(btn.dataset.id));
});

// Bind the seed-import button once per render — idempotent.
const importBtn = $("importSeedGalleryBtn");
if (importBtn && !importBtn.dataset.wired) {
importBtn.dataset.wired = "1";
importBtn.addEventListener("click", handleImportSeed);
}
}

function openForm(item) {
const form = $("galleryForm");
if (!form) return;
editingId = item ? item.id : null;
form.url.value = (item && item.url) || "";
form.title.value = (item && item.title) || "";
form.album.value = (item && item.album) || "";
form.date.value = (item && item.date) || "";
setFormError(null);
form.hidden = false;
form.querySelector('button[type="submit"]').textContent = item ? "Save changes" : "Add photo";
playOpen();
form.url.focus();
}

function closeForm({ silent = false } = {}) {
const form = $("galleryForm");
if (!form) return;
form.reset();
form.hidden = true;
editingId = null;
setFormError(null);
if (!silent) playClose();
}

function setFormError(message) {
const el = $("galleryFormError");
if (!el) return;
el.hidden = !message;
el.textContent = message || "";
}

async function handleSubmit(e) {
e.preventDefault();
const form = e.target;
const payload = {
url: form.url.value.trim(),
title: form.title.value.trim(),
album: form.album.value.trim(),
date: form.date.value || "",
};
if (!payload.url || !payload.title) return;

setFormError(null);
const submitBtn = form.querySelector('button[type="submit"]');
const orig = submitBtn.textContent;
submitBtn.disabled = true;
submitBtn.textContent = "Saving…";

try {
if (editingId) {
await updateDoc(doc(db, "gallery", editingId), payload);
await logAction("updated", {
resourceType: "gallery",
resourceId: editingId,
summary: Updated gallery photo: ${payload.title},
});
} else {
const ref = await addDoc(collection(db, "gallery"), {
...payload,
addedAt: serverTimestamp(),
});
await logAction("created", {
resourceType: "gallery",
resourceId: ref.id,
summary: Added gallery photo: ${payload.title},
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
if (!confirm("Delete this photo?")) return;
try {
await deleteDoc(doc(db, "gallery", id));
await logAction("deleted", { resourceType: "gallery", resourceId: id, summary: "Deleted gallery photo" });
playDelete();
} catch (err) {
console.error("Delete failed:", err);
playError();
alert("Couldn't delete that — check your monitor access.");
}
}

async function handleImportSeed() {
if (!confirm(Import ${SEED_GALLERY.length} existing photos into Firestore so they can be managed here?)) return;
try {
const batch = writeBatch(db);
SEED_GALLERY.forEach((g) => {
const ref = doc(collection(db, "gallery"));
batch.set(ref, { ...g, date: "", addedAt: serverTimestamp() });
});
await batch.commit();
await logAction("migrated", {
resourceType: "gallery",
summary: Imported ${SEED_GALLERY.length} seed photos,
});
playSuccess();
} catch (err) {
console.error("Import failed:", err);
playError();
alert("Couldn't import the existing photos — check your monitor access.");
}
}

export function initGallery() {
const needsData = !!$("galleryGrid") || !!$("galleryManageList");
if (!needsData) return;

startListener();

subscribeAuth(({ monitor }) => {
isCurrentMonitor = monitor;
const addBtn = $("addGalleryBtn");
if (addBtn) addBtn.hidden = !monitor;
renderManageList();
});

const addBtn = $("addGalleryBtn");
if (addBtn) addBtn.addEventListener("click", () => openForm(null));

const form = $("galleryForm");
if (form) {
form.addEventListener("submit", handleSubmit);
const cancelBtn = form.querySelector('[data-action="cancel"]');
if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
}
}

achievements.js
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

manage.js
// ============================================
// 8CM — Monitor panel wiring
// ------------------------------------------------
// The manage page itself is just a shell of tabs + the same panels
// used elsewhere (homework/announcements/events are wired by their
// own modules — see initAssignments/initAnnouncements/initEvents in
// script.js). This module only handles: tab switching, the page-level
// monitor gate, and the audit-log tab.
//
// The monitor gate is UX only. Firestore rules are the actual
// authority — a non-monitor who forced their way into this page would
// get empty/permission-denied reads on every privileged collection.
// ============================================
import { subscribeAuth } from "./auth.js";
import { subscribeAuditLog, formatAuditEntry } from "./audit.js";
import { playClick } from "./sound.js";

const $ = (id) => document.getElementById(id);

let auditUnsub = null;
let auditStarted = false;

function initTabs() {
const tabs = $("manageTabs");
if (!tabs) return;
const panels = document.querySelectorAll(".manage-panel");

tabs.querySelectorAll(".manage-tab").forEach((tab) => {
tab.addEventListener("click", () => {
const target = tab.dataset.tab;
tabs.querySelectorAll(".manage-tab").forEach((t) =>
t.classList.toggle("active", t === tab)
);
panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
playClick();

  // Lazily attach the audit-log listener the first time the tab
  // is actually opened — no reason to hold a monitor-only
  // listener open on every page visit.
  if (target === "audit" && !auditStarted) {
    auditStarted = true;
    startAudit();
  }
});

});
}

function startAudit() {
const list = $("auditLogList");
if (!list) return;
list.innerHTML = <p class="task-empty">Loading…</p>;
if (auditUnsub) auditUnsub();
auditUnsub = subscribeAuditLog((entries) => {
if (entries === null) {
list.innerHTML = <p class="task-empty">Couldn't load the audit log.</p>;
return;
}
if (entries.length === 0) {
list.innerHTML = <p class="task-empty">No monitor activity recorded yet.</p>;
return;
}
list.innerHTML = "";
entries.forEach((entry) => {
const f = formatAuditEntry(entry);
const row = document.createElement("div");
row.className = "audit-row";
row.innerHTML = <span class="audit-when">${f.when}</span> <div class="audit-body"> <p class="audit-what">${f.what}</p> <p class="audit-who">${f.who}</p> </div> ;
list.appendChild(row);
});
});
}

export function initManagePage() {
const root = $("manage");
if (!root) return;

initTabs();

const locked = $("manageLocked");
const content = $("manageContent");

subscribeAuth(({ user, monitor }) => {
if (!locked || !content) return;
if (!user) {
locked.hidden = false;
content.hidden = true;
locked.innerHTML = <p>Sign in to access the monitor panel.</p>;
return;
}
if (!monitor) {
locked.hidden = false;
content.hidden = true;
locked.innerHTML = <p>This page is for monitors only.</p>;
return;
}
locked.hidden = true;
content.hidden = false;
});
}
