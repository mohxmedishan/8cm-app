// ============================================
// 8CM — Gallery (external image URLs, no Storage)
// ============================================
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);

export const SEED_GALLERY = [
  { url: "assets/gallery/5cm-motion-gate.jpg", title: "5CM Field Trip · Motion Gate", album: "Trips" },
  { url: "assets/gallery/6cm-warner-bros.jpg", title: "6CM Field Trip · Warner Bros", album: "Trips" },
  { url: "assets/gallery/7cm-assembly-1.jpg", title: "7CM Assembly", album: "Assemblies" },
  { url: "assets/gallery/7cm-assembly-2.jpg", title: "7CM Assembly · II", album: "Assemblies" },
  { url: "assets/gallery/7cm-english-1.jpg", title: "7CM English", album: "Classes" },
  { url: "assets/gallery/7cm-english-2.jpg", title: "7CM English · II", album: "Classes" },
  { url: "assets/gallery/7cm-field-trip-garvit.jpg", title: "7CM Field Trip", album: "Trips" },
];

let cache = null;
let isCurrentMonitor = false;
let editingId = null;
const listeners = new Set();

const escapeAttr = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

function visible() {
  return cache && cache.length ? cache : SEED_GALLERY.map((s, i) => ({ id: `seed-${i}`, ...s, isSeed: true }));
}

export function onGallery(cb) {
  listeners.add(cb);
  cb(visible());
  return () => listeners.delete(cb);
}
function notify() { listeners.forEach((cb) => cb(visible())); }

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
      if (cache === null) cache = [];
      renderPublicGrid();
      renderManageList();
      notify();
    }
  );
}

function renderPublicGrid() {
  const grid = $("galleryGrid");
  if (!grid) return;
  grid.innerHTML = visible()
    .map(
      (g) =>
        `<figure class="gallery-photo" tabindex="0" role="button" aria-label="View larger photo"><img src="${escapeAttr(g.url)}" alt="${escapeAttr(g.title)}" loading="lazy"><figcaption>${escapeAttr(g.title)}</figcaption></figure>`
    )
    .join("");
}

function renderManageList() {
  const list = $("galleryManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage the gallery.</p>`;
    return;
  }
  const items = visible();
  if (!items.length) {
    list.innerHTML = `<p class="task-empty">No photos yet.</p>`;
    return;
  }
  list.innerHTML = "";
  items.forEach((g) => {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `<div class="manage-thumb"><img src="${escapeAttr(g.url)}" alt=""></div><div class="manage-row-body"><p class="task-subject">${escapeAttr(g.title)}</p><p class="task-detail">${escapeAttr(g.album || "—")}${g.date ? " · " + escapeAttr(g.date) : ""}</p></div><div class="task-monitor-actions">${!g.isSeed ? `<button class="task-icon-btn" data-action="edit" data-id="${escapeAttr(g.id)}">✎</button><button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeAttr(g.id)}">✕</button>` : ""}</div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-action="edit"]').forEach((b) =>
    b.addEventListener("click", () => openForm((cache || []).find((x) => x.id === b.dataset.id)))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((b) =>
    b.addEventListener("click", () => handleDelete(b.dataset.id))
  );
}

function openForm(item) {
  const f = $("galleryForm");
  if (!f) return;
  editingId = item?.id || null;
  f.url.value = item?.url || "";
  f.title.value = item?.title || "";
  f.album.value = item?.album || "";
  f.date.value = item?.date || "";
  setFormError(null);
  f.hidden = false;
  f.querySelector('button[type="submit"]').textContent = item ? "Save changes" : "Add photo";
  playOpen();
  f.url.focus();
}
function closeForm({ silent = false } = {}) {
  const f = $("galleryForm");
  if (!f) return;
  f.reset();
  f.hidden = true;
  editingId = null;
  setFormError(null);
  if (!silent) playClose();
}
function setFormError(m) {
  const e = $("galleryFormError");
  if (!e) return;
  e.hidden = !m;
  e.textContent = m || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const payload = {
    url: f.url.value.trim(),
    title: f.title.value.trim(),
    album: f.album.value.trim(),
    date: f.date.value || "",
  };
  if (!payload.url || !payload.title) return;
  setFormError(null);
  const b = f.querySelector('button[type="submit"]');
  const old = b.textContent;
  b.disabled = true;
  b.textContent = "Saving…";
  try {
    if (editingId) {
      await updateDoc(doc(db, "gallery", editingId), payload);
      await logAction("updated", { resourceType: "gallery", resourceId: editingId, summary: `Updated gallery photo: ${payload.title}` });
    } else {
      const ref = await addDoc(collection(db, "gallery"), { ...payload, addedAt: serverTimestamp() });
      await logAction("created", { resourceType: "gallery", resourceId: ref.id, summary: `Added gallery photo: ${payload.title}` });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setFormError("Couldn't save that — check your monitor access and try again.");
  } finally {
    b.disabled = false;
    b.textContent = old;
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

export function initGallery() {
  const needs = !!$("galleryGrid") || !!$("galleryManageList");
  if (!needs) return;
  startListener();
  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    const b = $("addGalleryBtn");
    if (b) b.hidden = !monitor;
    renderManageList();
  });
  const add = $("addGalleryBtn");
  if (add) add.addEventListener("click", () => openForm(null));
  const f = $("galleryForm");
  if (f) {
    f.addEventListener("submit", handleSubmit);
    const c = f.querySelector('[data-action="cancel"]');
    if (c) c.addEventListener("click", () => closeForm());
  }
}
