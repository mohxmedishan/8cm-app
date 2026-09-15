// ============================================
// 8CM — Announcements
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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);

let cache = [];
const listeners = new Set();
function notify() {
  listeners.forEach((cb) => cb(activeAnnouncements()));
}

export function onAnnouncements(callback) {
  listeners.add(callback);
  callback(activeAnnouncements());
  return () => listeners.delete(callback);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function activeAnnouncements() {
  const today = todayStr();
  return cache
    .filter((a) => !a.expiresOn || a.expiresOn >= today)
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
}

export function pinnedAnnouncement() {
  return activeAnnouncements().find((a) => a.pinned) || activeAnnouncements()[0] || null;
}

let isCurrentMonitor = false;
let editingId = null;

function startListener() {
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
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
      const list = $("announcementList");
      if (list) list.innerHTML = `<p class="task-empty">Couldn't load announcements right now.</p>`;
    }
  );
}

async function handleDelete(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    await deleteDoc(doc(db, "announcements", id));
    playDelete();
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert("Couldn't delete that — check your monitor access and try again.");
  }
}

async function togglePin(a) {
  try {
    await updateDoc(doc(db, "announcements", a.id), { pinned: !a.pinned });
  } catch (err) {
    console.error("Pin toggle failed:", err);
    playError();
  }
}

function openForm(a) {
  const form = $("announcementForm");
  if (!form) return;
  editingId = a ? a.id : null;
  form.title.value = (a && a.title) || "";
  form.content.value = (a && a.content) || "";
  form.category.value = (a && a.category) || "General";
  form.priority.value = (a && a.priority) || "normal";
  form.expiresOn.value = (a && a.expiresOn) || "";
  form.pinned.checked = !!(a && a.pinned);
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = a ? "Save changes" : "Post announcement";
  playOpen();
  form.querySelector('input[name="title"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("announcementForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setFormError(null);
  if (!silent) playClose();
}

function setFormError(message) {
  const el = $("announcementFormError");
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
    expiresOn: form.expiresOn.value || null,
    pinned: form.pinned.checked,
  };
  if (!payload.title || !payload.content) return;

  setFormError(null);
  const submitBtn = form.querySelector('button[type="submit"]');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, "announcements", editingId), payload);
    } else {
      await addDoc(collection(db, "announcements"), { ...payload, createdAt: serverTimestamp() });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setFormError("Couldn't save that — check your monitor access and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

function render() {
  const list = $("announcementList");
  if (!list) return;

  const visible = activeAnnouncements();
  if (visible.length === 0) {
    list.innerHTML = `<p class="task-empty">No announcements right now.</p>`;
    return;
  }

  list.innerHTML = "";
  visible.forEach((a) => {
    const row = document.createElement("div");
    row.className = `announcement-row ${a.priority === "important" ? "is-important" : ""}`;
    row.innerHTML = `
      <div class="announcement-head">
        ${a.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : ""}
        <span class="task-tag announcement">${a.category || "General"}</span>
        <p class="task-subject">${a.title}</p>
      </div>
      <p class="task-detail">${a.content}</p>
      <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
        <button class="task-icon-btn" data-action="pin" data-id="${a.id}" aria-label="Toggle pin">${a.pinned ? "Unpin" : "Pin"}</button>
        <button class="task-icon-btn" data-action="edit" data-id="${a.id}" aria-label="Edit announcement">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${a.id}" aria-label="Delete announcement">✕</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.id)));
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
}

function applyMonitorVisibility() {
  document.querySelectorAll("#announcementList .monitor-only, #announcementPanel .monitor-only").forEach((el) => {
    el.hidden = !isCurrentMonitor;
  });
}

export function initAnnouncements() {
  if (!$("announcementList")) return;

  startListener();

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    applyMonitorVisibility();
    render();
  });

  const addBtn = $("addAnnouncementBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));

  const form = $("announcementForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }
}
