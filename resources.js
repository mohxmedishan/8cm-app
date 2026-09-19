// ============================================
// 8CM — Resources
// ------------------------------------------------
// Public-read, monitor-managed. Fields: title, content, pinned, links.
//
// NOTE ON THE FIRESTORE COLLECTION: this reads/writes the collection
// literally named `announcements`. That name is a legacy of when this
// section was called Announcements. It is NOT renamed here because
// renaming a Firestore collection orphans every document already in
// it — every resource you've already saved lives at announcements/{id}
// and stays there. Renaming is a UI + code concern only.
//
// Category, priority, and eventDate are no longer part of Resources —
// they moved to the new Announcements section (see notices.js).
// ============================================
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";
import { setLinkStack, readLinkStack, linkChipsHtml } from "./item-links.js";
import { createArranger } from "./arrange.js";

const $ = (id) => document.getElementById(id);
let arranger = null;
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const COLLECTION = "announcements"; // legacy name — see header

let cache = [];
const listeners = new Set();
const expandedIds = new Set();
let isCurrentMonitor = false;
let editingId = null;

function notify() { listeners.forEach((cb) => cb(activeResources())); }

export function onResources(cb) {
  listeners.add(cb);
  cb(activeResources());
  return () => listeners.delete(cb);
}

export function activeResources() {
  return [...cache].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const aHas = typeof a.order === "number";
    const bHas = typeof b.order === "number";
    if (aHas !== bHas) return aHas ? 1 : -1;
    if (aHas && bHas && a.order !== b.order) return a.order - b.order;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
}

export function pinnedResource() {
  const list = activeResources();
  return list.find((r) => r.pinned) || list[0] || null;
}

function renderListLoading() {
  const list = $("resourceList");
  if (!list) return;
  list.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading resources…</span></div>`;
}

function startListener() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      cache = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0 };
      });
      render();
      notify();
    },
    (err) => {
      console.error("Failed to load resources:", err);
      const list = $("resourceList");
      if (list) list.innerHTML = `<p class="task-empty">Couldn't load resources right now.</p>`;
    }
  );
}

async function handleDelete(id) {
  if (!confirm("Delete this resource?")) return;
  const r = cache.find((x) => x.id === id);
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    playDelete();
    await logAction("deleted", { resourceType: "resource", resourceId: id, summary: `Deleted resource: ${r ? r.title : id}` });
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

async function togglePin(r) {
  try { await updateDoc(doc(db, COLLECTION, r.id), { pinned: !r.pinned }); }
  catch (err) { console.error("Pin toggle failed:", err); playError(); }
}

function openForm(r) {
  const form = $("resourceForm");
  if (!form) return;
  editingId = r ? r.id : null;
  form.title.value = (r && r.title) || "";
  form.content.value = (r && r.content) || "";
  form.pinned.checked = !!(r && r.pinned);
  setLinkStack($("resourceLinksStack"), r);
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = r ? "Save changes" : "Add resource";
  playOpen();
  form.querySelector('input[name="title"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("resourceForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setFormError(null);
  const s = $("resourceLinksStack");
  if (s) s.innerHTML = "";
  if (!silent) playClose();
}

function setFormError(m) {
  const el = $("resourceFormError");
  if (!el) return;
  el.hidden = !m;
  el.textContent = m || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    title: form.title.value.trim(),
    content: form.content.value.trim(),
    pinned: form.pinned.checked,
    links: readLinkStack($("resourceLinksStack")),
  };
  if (!payload.title || !payload.content) return;

  setFormError(null);
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, COLLECTION, editingId), payload);
      await logAction("updated", { resourceType: "resource", resourceId: editingId, summary: `Updated resource: ${payload.title}` });
    } else {
      const ref = await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp() });
      await logAction("created", { resourceType: "resource", resourceId: ref.id, summary: `Added resource: ${payload.title}` });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setFormError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function buildResourceRow(r) {
  const expanded = expandedIds.has(r.id);
  const row = document.createElement("div");
  row.className = ["announcement-row", "resource-row", expanded ? "is-expanded" : ""].filter(Boolean).join(" ");
  row.dataset.id = r.id;
  row.dataset.block = r.pinned ? "pinned" : "regular";
  row.innerHTML = `
    <div class="announcement-head">
      ${r.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : ""}
      <p class="task-subject">${escapeHtml(r.title)}</p>
      <span class="announcement-caret" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </div>
    <div class="announcement-detail">
      <p class="task-detail">${escapeHtml(r.content)}</p>
      ${linkChipsHtml(r)}
    </div>
    <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
      <button class="task-icon-btn task-icon-btn-text" data-action="pin" data-id="${escapeHtml(r.id)}" aria-label="Toggle pin">${r.pinned ? "Unpin" : "Pin"}</button>
      <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(r.id)}" aria-label="Edit resource">✎</button>
      <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(r.id)}" aria-label="Delete resource">✕</button>
    </div>`;
  row.addEventListener("click", (e) => {
    if (row.parentElement.classList.contains("arrange-mode")) return;
    if (e.target.closest(".task-monitor-actions")) return;
    if (e.target.closest("a")) return;
    const id = row.dataset.id;
    if (expandedIds.has(id)) expandedIds.delete(id); else expandedIds.add(id);
    row.classList.toggle("is-expanded");
  });
  return row;
}

function render() {
  const list = $("resourceList");
  if (!list) return;

  const wasArranging = !!(arranger && arranger.isActive());
  const preservedOrder = wasArranging
    ? Array.from(list.querySelectorAll(":scope > [data-id]")).map((r) => r.dataset.id)
    : null;
  const visible = activeResources();

  if (visible.length === 0) {
    list.innerHTML = `<p class="task-empty">No resources yet.</p>`;
    updateArrangeBtn();
    return;
  }

  list.innerHTML = "";
  let finalOrder;
  if (wasArranging) {
    const preserved = new Set(preservedOrder);
    const newPinned = visible.filter((r) => r.pinned && !preserved.has(r.id));
    const newRegular = visible.filter((r) => !r.pinned && !preserved.has(r.id));
    const carriedPinned = preservedOrder
      .map((id) => visible.find((r) => r.id === id))
      .filter((r) => r && r.pinned);
    const carriedRegular = preservedOrder
      .map((id) => visible.find((r) => r.id === id))
      .filter((r) => r && !r.pinned);
    finalOrder = [...newPinned, ...carriedPinned, ...newRegular, ...carriedRegular];
  } else {
    finalOrder = visible;
  }

  finalOrder.forEach((r) => list.appendChild(buildResourceRow(r)));

  list.querySelectorAll('[data-action="delete"]').forEach((b) => b.addEventListener("click", () => handleDelete(b.dataset.id)));
  list.querySelectorAll('[data-action="pin"]').forEach((b) => b.addEventListener("click", () => { const r = cache.find((x) => x.id === b.dataset.id); if (r) togglePin(r); }));
  list.querySelectorAll('[data-action="edit"]').forEach((b) => b.addEventListener("click", () => { const r = cache.find((x) => x.id === b.dataset.id); if (r) openForm(r); }));

  if (wasArranging) arranger.reattach();
  updateArrangeBtn();
}


function updateArrangeBtn() {
  const btn = $("arrangeResourceBtn");
  if (!btn) return;
  const enough = cache.length > 1;
  btn.hidden = !isCurrentMonitor || !enough;
  if (!enough && arranger && arranger.isActive()) arranger.forceExit();
}

async function saveResourcesOrder(orderedIds) {
  const items = orderedIds.map((id) => cache.find((r) => r.id === id)).filter(Boolean);
  if (!items.length) return;
  const batch = writeBatch(db);
  let wrote = 0;
  items.forEach((item, i) => {
    if (item.order === i) return;
    batch.update(doc(db, COLLECTION, item.id), { order: i });
    wrote++;
  });
  if (wrote === 0) return;
  await batch.commit();
  await logAction("reordered", {
    resourceType: "resource",
    summary: `Reordered resources (${items.length} items)`,
  }).catch(() => {});
}

function initArranger() {
  if (!$("arrangeResourceBtn")) return;
  arranger = createArranger({
    listId: "resourceList",
    pencilBtnId: "arrangeResourceBtn",
    statusId: "resourceOrderStatus",
    onSave: saveResourcesOrder,
    onEnter: () => render(),
    onExit: () => render(),
  });
}

function applyMonitorVisibility() {
  document.querySelectorAll("#resourceList .monitor-only, #resourcePanel .monitor-only").forEach((el) => { el.hidden = !isCurrentMonitor; });
}

export function initResources() {
  if (!$("resourceList")) return;
  renderListLoading();
  startListener();
  subscribeAuth(({ monitor }) => { isCurrentMonitor = monitor; applyMonitorVisibility(); render(); updateArrangeBtn(); });
  initArranger();
  updateArrangeBtn();
  const addBtn = $("addResourceBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));
  const form = $("resourceForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const c = form.querySelector('[data-action="cancel"]');
    if (c) c.addEventListener("click", () => closeForm());
  }
}
