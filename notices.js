// ============================================
// 8CM — Notices / Announcements
// ------------------------------------------------
// Monitor-managed, public-read (same openness as the rest of CM's
// content). Expired announcements are filtered out client-side here
// rather than deleted, so a monitor can always look back at what was
// said — "expired" just means it stops showing in the active feed.
// ============================================
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
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
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const COLLECTION = "notices";

let cache = [];
const listeners = new Set();
function notify() {
  listeners.forEach((cb) => cb(activeNotices()));
}

export function onNotices(callback) {
  listeners.add(callback);
  callback(activeNotices());
  return () => listeners.delete(callback);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function activeNotices() {
  return [...cache].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const pa = a.priority === "important" ? 0 : 1;
    const pb = b.priority === "important" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const aHas = typeof a.order === "number";
    const bHas = typeof b.order === "number";
    if (aHas !== bHas) return aHas ? 1 : -1;
    if (aHas && bHas && a.order !== b.order) return a.order - b.order;
    return (b.createdAtMs || 0) - (a.createdAtMs || 0);
  });
}

export function pinnedNotice() {
  return activeNotices().find((a) => a.pinned) || activeNotices()[0] || null;
}

let isCurrentMonitor = false;
const expandedIds = new Set();
let editingId = null;

function renderListLoading() {
  const list = $("noticeList");
  if (!list) return;
  list.innerHTML = `
    <div class="task-loading">
      <span class="task-loading-dot"></span>
      <span class="task-loading-dot"></span>
      <span class="task-loading-dot"></span>
      <span class="task-loading-label">Loading announcements…</span>
    </div>`;
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
      console.error("Failed to load announcements:", err);
      const list = $("noticeList");
      if (list) list.innerHTML = `<p class="task-empty">Couldn't load announcements right now.</p>`;
    }
  );
}

async function handleDelete(id) {
  if (!confirm("Delete this notice?")) return;
  const a = cache.find((x) => x.id === id);
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    playDelete();
    await logAction("deleted", {
      resourceType: "notice",
      resourceId: id,
      summary: `Deleted notice: ${a ? a.title : id}`,
    });
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

async function togglePin(a) {
  try {
    await updateDoc(doc(db, COLLECTION, a.id), { pinned: !a.pinned });
  } catch (err) {
    console.error("Pin toggle failed:", err);
    playError();
  }
}

function openForm(a) {
  const form = $("noticeForm");
  if (!form) return;
  editingId = a ? a.id : null;
  form.title.value = (a && a.title) || "";
  form.content.value = (a && a.content) || "";
  form.category.value = (a && a.category) || "General";
  form.priority.value = (a && a.priority) || "normal";
  form.eventDate.value = (a && a.eventDate) || "";
  form.pinned.checked = !!(a && a.pinned);
  setLinkStack($("noticeLinksStack"), a);
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = a ? "Save changes" : "Post announcement";
  playOpen();
  form.querySelector('input[name="title"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("noticeForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setFormError(null);
  const linkStack = $("noticeLinksStack");
  if (linkStack) linkStack.innerHTML = "";
  if (!silent) playClose();
}

function setFormError(message) {
  const el = $("noticeFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    title: form.title.value.trim(),
    content: form.content.value.trim(),
    category: form.category.value,
    priority: form.priority.value,
    eventDate: form.eventDate.value || null,
    pinned: form.pinned.checked,
    links: readLinkStack($("noticeLinksStack")),
  };
  if (!payload.title || !payload.content) return;

  setFormError(null);
  const submitBtn = form.querySelector('button[type="submit"]');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, COLLECTION, editingId), payload);
      await logAction("updated", {
        resourceType: "notice",
        resourceId: editingId,
        summary: `Updated notice: ${payload.title}`,
      });
    } else {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      await logAction("created", {
        resourceType: "notice",
        resourceId: ref.id,
        summary: `Posted notice: ${payload.title}`,
      });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setFormError(describeWriteError(err, "save"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

function buildNoticeRow(a) {
  const expanded = expandedIds.has(a.id);
  const row = document.createElement("div");
  row.className = [
    "announcement-row",
    a.priority === "important" ? "is-important" : "",
    expanded ? "is-expanded" : "",
  ].filter(Boolean).join(" ");
  row.dataset.id = a.id;
  row.dataset.block = a.pinned ? "pinned" : "regular";

  row.innerHTML = `
    <div class="announcement-head">
      ${a.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : ""}
      <span class="task-tag announcement">${escapeHtml(a.category || "General")}</span>
      <p class="task-subject">${escapeHtml(a.title)}</p>
      <span class="announcement-caret" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </div>
    <div class="announcement-detail">
      <p class="task-detail">${escapeHtml(a.content)}</p>
      ${linkChipsHtml(a)}
    </div>
    <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
      <button class="task-icon-btn task-icon-btn-text" data-action="pin" data-id="${escapeHtml(a.id)}" aria-label="Toggle pin">${a.pinned ? "Unpin" : "Pin"}</button>
      <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(a.id)}" aria-label="Edit announcement">✎</button>
      <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(a.id)}" aria-label="Delete announcement">✕</button>
    </div>
  `;

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
  const list = $("noticeList");
  if (!list) return;

  const wasArranging = !!(arranger && arranger.isActive());
  const preservedOrder = wasArranging
    ? Array.from(list.querySelectorAll(":scope > [data-id]")).map((r) => r.dataset.id)
    : null;
  const visible = activeNotices();

  if (visible.length === 0) {
    list.innerHTML = `<p class="task-empty">No announcements right now.</p>`;
    updateArrangeBtn();
    return;
  }

  list.innerHTML = "";
  let finalOrder;
  if (wasArranging) {
    const preserved = new Set(preservedOrder);
    const newPinned = visible.filter((a) => a.pinned && !preserved.has(a.id));
    const newRegular = visible.filter((a) => !a.pinned && !preserved.has(a.id));
    const carriedPinned = preservedOrder
      .map((id) => visible.find((a) => a.id === id))
      .filter((a) => a && a.pinned);
    const carriedRegular = preservedOrder
      .map((id) => visible.find((a) => a.id === id))
      .filter((a) => a && !a.pinned);
    finalOrder = [...newPinned, ...carriedPinned, ...newRegular, ...carriedRegular];
  } else {
    finalOrder = visible;
  }

  finalOrder.forEach((a) => list.appendChild(buildNoticeRow(a)));

  list.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => handleDelete(btn.dataset.id))
  );
  list.querySelectorAll('[data-action="pin"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = cache.find((x) => x.id === btn.dataset.id);
      if (a) togglePin(a);
    });
  });
  list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = cache.find((x) => x.id === btn.dataset.id);
      if (a) openForm(a);
    });
  });

  if (wasArranging) arranger.reattach();
  updateArrangeBtn();
}

let arranger = null;

function updateArrangeBtn() {
  const btn = $("arrangeNoticeBtn");
  if (!btn) return;
  const enough = cache.length > 1;
  btn.hidden = !isCurrentMonitor || !enough;
  if (!enough && arranger && arranger.isActive()) arranger.forceExit();
}

async function saveNoticesOrder(orderedIds) {
  const items = orderedIds.map((id) => cache.find((a) => a.id === id)).filter(Boolean);
  if (!items.length) return;

  let demoteFrom = items.length;
  for (let i = 0; i < items.length; i++) {
    if (!items[i].pinned && items[i].priority !== "important") { demoteFrom = i; break; }
  }

  const batch = writeBatch(db);
  let wrote = 0;
  items.forEach((item, i) => {
    const patch = {};
    if (item.order !== i) patch.order = i;
    if (!item.pinned) {
      const target = i >= demoteFrom ? "normal" : "important";
      const currentP = item.priority === "important" ? "important" : "normal";
      if (currentP !== target) patch.priority = target;
    }
    if (Object.keys(patch).length === 0) return;
    batch.update(doc(db, COLLECTION, item.id), patch);
    wrote++;
  });
  if (wrote === 0) return;
  await batch.commit();
  await logAction("reordered", {
    resourceType: "notice",
    summary: `Reordered announcements (${items.length} items)`,
  }).catch(() => {});
}

function initArranger() {
  if (!$("arrangeNoticeBtn")) return;
  arranger = createArranger({
    listId: "noticeList",
    pencilBtnId: "arrangeNoticeBtn",
    statusId: "noticeOrderStatus",
    onSave: saveNoticesOrder,
    onEnter: () => render(),
    onExit: () => render(),
  });
}

function applyMonitorVisibility() {
  document.querySelectorAll("#noticeList .monitor-only, #noticePanel .monitor-only").forEach((el) => {
    el.hidden = !isCurrentMonitor;
  });
}

export function initNotices() {
  const hasPanel = !!$("noticeList");
  const hasTimetableList = !!$("timetableAnnouncementList");
  if (!hasPanel && !hasTimetableList) return;

  if (hasPanel) renderListLoading();

  startListener();

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    applyMonitorVisibility();
    render();
    updateArrangeBtn();
  });

  if (!hasPanel) return; // timetable page only needs the data, not the panel below

  initArranger();
  updateArrangeBtn();

  const addBtn = $("addNoticeBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));

  const form = $("noticeForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }
}

export const activeAnnouncements = activeNotices;
export const pinnedAnnouncement = pinnedNotice;
export const onAnnouncements = onNotices;
