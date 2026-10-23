// ============================================
// 8CM — Archive materials
// ------------------------------------------------
// Monitor-managed cards shown in archives.html#archive-materials.
// Defaults remain visible until Firestore overrides them.
// A monitor can edit, reorder, add, or delete every visible card.
// ============================================
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";
import { readLinks, linkChipsHtml } from "./item-links.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

export const SEED_ARCHIVE_MATERIALS = [
  { id: "seed-setup", seedKey: "seed-setup", kicker: "Classroom setup", title: "What changed, what stayed.",
    description: "Grades 5 through 7 ran on LED screens up front. Grade 8 switched back to a projector and whiteboard.", order: 0 },
  { id: "seed-seating", seedKey: "seed-seating", kicker: "Seating", title: "Thirty desks, paired up.",
    description: "Three pairs to a row, thirty seats total. The pairing format has stuck across years.", order: 1 },
  { id: "seed-prefect", seedKey: "seed-prefect", kicker: "Prefect history", title: "More than one name on the seat.",
    description: "The prefect role has changed hands more than once across 8CM's run.", order: 2 },
];

let cache = null;
let isCurrentMonitor = false;
let editingItem = null;
const listeners = new Set();

function visible() {
  const docs = cache || [];
  const bySeed = new Map(docs.filter((x) => x.seedKey).map((x) => [x.seedKey, x]));
  const seeded = SEED_ARCHIVE_MATERIALS
    .map((seed) => {
      const override = bySeed.get(seed.seedKey);
      if (override?.deleted) return null;
      return { ...seed, ...(override || {}), isSeed: true, id: seed.id };
    })
    .filter(Boolean);
  const custom = docs.filter((x) => !x.seedKey && !x.deleted).map((x) => ({ ...x, isSeed: false }));
  return [...seeded, ...custom].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function onArchiveMaterials(cb) {
  listeners.add(cb);
  cb(visible());
  return () => listeners.delete(cb);
}
function notify() { listeners.forEach((cb) => cb(visible())); }

function startListener() {
  const q = query(collection(db, "archiveMaterials"), orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPublicGrid();
    renderManageList();
    notify();
  }, (err) => {
    console.error("Failed to load archive materials:", err);
    if (cache === null) cache = [];
    renderPublicGrid();
    renderManageList();
    notify();
  });
}

function renderPublicGrid() {
  const grid = $("archiveMaterialsGrid");
  if (!grid) return;
  const items = visible();
  grid.innerHTML = items.length
    ? items.map((m) => `
      <article class="archive-card${m.isSeed ? " is-seed" : ""}">
        ${m.kicker ? `<p class="archive-kicker">${escapeHtml(m.kicker)}</p>` : ""}
        <h3>${escapeHtml(m.title)}</h3>
        ${m.description ? `<p>${escapeHtml(m.description)}</p>` : ""}
        ${linkChipsHtml(m)}
      </article>`).join("")
    : `<p class="empty-body">No archive materials yet.</p>`;
}

function renderManageList() {
  const list = $("archiveMaterialManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage archive materials.</p>`;
    return;
  }
  const items = visible();
  if (!items.length) {
    list.innerHTML = `<p class="task-empty">No archive materials yet.</p>`;
    return;
  }
  list.innerHTML = "";
  items.forEach((m) => {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `
      <div class="manage-row-body">
        <p class="task-subject">${escapeHtml(m.title)}${m.isSeed ? '<span class="inactive-tag">default</span>' : ""}</p>
        <p class="task-detail">${escapeHtml(m.kicker || "—")} · order ${Number(m.order ?? 0)}</p>
      </div>
      <div class="task-monitor-actions">
        <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(m.id)}" aria-label="Edit">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(m.id)}" aria-label="Delete">✕</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-action="edit"]').forEach((b) =>
    b.addEventListener("click", () => openForm(visible().find((x) => x.id === b.dataset.id)))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((b) =>
    b.addEventListener("click", () => handleDelete(visible().find((x) => x.id === b.dataset.id)))
  );
}

function openForm(item = null) {
  const f = $("archiveMaterialForm");
  if (!f) return;
  editingItem = item;
  f.kicker.value = item?.kicker || "";
  f.title.value = item?.title || "";
  f.description.value = item?.description || "";
  f.link.value = readLinks(item)[0]?.url || "";
  f.linkLabel.value = readLinks(item)[0]?.label || "";
  f.order.value = item?.order ?? visible().length;
  setFormError(null);
  f.hidden = false;
  f.querySelector('button[type="submit"]').textContent = item ? "Save changes" : "Add material";
  playOpen();
  f.title.focus();
}

function closeForm({ silent = false } = {}) {
  const f = $("archiveMaterialForm");
  if (!f) return;
  f.reset();
  f.hidden = true;
  editingItem = null;
  setFormError(null);
  if (!silent) playClose();
}

function setFormError(message) {
  const e = $("archiveMaterialFormError");
  if (!e) return;
  e.hidden = !message;
  e.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const linkUrl = f.link.value.trim();
  const linkLabel = f.linkLabel.value.trim();
  const title = f.title.value.trim();
  if (!title) {
    setFormError("A title is required.");
    return;
  }

  const payload = {
    kicker: f.kicker.value.trim(),
    title,
    description: f.description.value.trim(),
    links: linkUrl ? [{ label: linkLabel || "Open", url: linkUrl }] : [],
    order: Math.max(0, parseInt(f.order.value, 10) || 0),
    updatedAt: serverTimestamp(),
  };

  const btn = f.querySelector('button[type="submit"]');
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  setFormError(null);

  try {
    if (editingItem?.isSeed) {
      const ref = doc(db, "archiveMaterials", `seed-${editingItem.seedKey}`);
      await setDoc(ref, { ...payload, seedKey: editingItem.seedKey, deleted: false }, { merge: true });
      await logAction("updated", { resourceType: "archiveMaterial", resourceId: ref.id, summary: `Updated archive material: ${title}` });
    } else if (editingItem?.id) {
      await updateDoc(doc(db, "archiveMaterials", editingItem.id), payload);
      await logAction("updated", { resourceType: "archiveMaterial", resourceId: editingItem.id, summary: `Updated archive material: ${title}` });
    } else {
      const ref = await addDoc(collection(db, "archiveMaterials"), { ...payload, createdAt: serverTimestamp() });
      await logAction("created", { resourceType: "archiveMaterial", resourceId: ref.id, summary: `Added archive material: ${title}` });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Archive material save failed:", err);
    playError();
    setFormError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

async function handleDelete(item) {
  if (!item) return;
  if (!confirm(`Delete "${item.title}" from the archive?`)) return;
  try {
    if (item.isSeed) {
      const ref = doc(db, "archiveMaterials", `seed-${item.seedKey}`);
      await setDoc(ref, { seedKey: item.seedKey, deleted: true, order: item.order ?? 0, updatedAt: serverTimestamp() }, { merge: true });
      await logAction("deleted", { resourceType: "archiveMaterial", resourceId: ref.id, summary: `Deleted archive material: ${item.title}` });
    } else {
      await deleteDoc(doc(db, "archiveMaterials", item.id));
      await logAction("deleted", { resourceType: "archiveMaterial", resourceId: item.id, summary: `Deleted archive material: ${item.title}` });
    }
    playDelete();
  } catch (err) {
    console.error("Archive material delete failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

export function initArchiveMaterials() {
  const needs = !!$("archiveMaterialsGrid") || !!$("archiveMaterialManageList");
  if (!needs) return;
  startListener();
  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    const b = $("addArchiveMaterialBtn");
    if (b) b.hidden = !monitor;
    renderManageList();
  });
  const add = $("addArchiveMaterialBtn");
  if (add) add.addEventListener("click", () => openForm());
  const f = $("archiveMaterialForm");
  if (f) {
    f.addEventListener("submit", handleSubmit);
    const c = f.querySelector('[data-action="cancel"]');
    if (c) c.addEventListener("click", () => closeForm());
  }
}
