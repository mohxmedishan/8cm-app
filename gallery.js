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
