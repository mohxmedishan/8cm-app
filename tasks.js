// ============================================
// 8CM — "What's for today" task hub
// ------------------------------------------------
// Tasks live in Firestore (collection: tasks) so they update for
// everyone in real time. Add/edit/delete controls only render for
// monitors client-side — the real enforcement is firestore.rules,
// which reject the write server-side regardless of what the UI shows.
//
// Each task can optionally carry a single external `link` (a Google
// Form, a Drive folder, a worksheet URL, whatever the resource
// actually lives at) instead of a file attachment — simpler, no
// Storage dependency, and the resource stays wherever its owner
// actually manages it.
// ============================================
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playExternal } from "./sound.js";

const $ = (id) => document.getElementById(id);

let isCurrentMonitor = false;
let tasksCache = [];
let editingId = null;

function taskTypeLabel(type) {
  return type === "homework" ? "Homework" : "Announcement";
}

// Accepts a URL with or without a scheme ("forms.google.com/…" as
// much as "https://forms.google.com/…") and normalizes it so the
// rendered link always actually navigates somewhere instead of being
// treated as a relative path on this site.
function normalizeLink(raw) {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function linkMarkup(task) {
  if (!task.link) return "";
  let hostname = task.link;
  try {
    hostname = new URL(task.link).hostname.replace(/^www\./, "");
  } catch {
    // Keep the raw string as a fallback label if URL parsing fails.
  }
  return `
    <a class="task-link-chip" href="${task.link}" target="_blank" rel="noopener" data-action="open-link">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>${hostname}</span>
    </a>
  `;
}

function renderTasks() {
  const list = $("taskList");
  if (!list) return;
  list.innerHTML = "";

  if (tasksCache.length === 0) {
    list.innerHTML = `<p class="task-empty">Nothing logged for today.</p>`;
    return;
  }

  tasksCache.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task-row";
    row.innerHTML = `
      <span class="task-tag ${task.type}">${taskTypeLabel(task.type)}</span>
      <div class="task-body">
        <p class="task-subject">${task.subject}</p>
        <p class="task-detail">${task.detail}</p>
        ${linkMarkup(task)}
      </div>
      <span class="task-due">${task.due}</span>
      <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
        <button class="task-icon-btn" data-action="edit" data-id="${task.id}" aria-label="Edit task">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${task.id}" aria-label="Delete task">✕</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => handleDelete(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const task = tasksCache.find((t) => t.id === btn.dataset.id);
      if (task) openForm(task); // openForm() itself plays the "open" sound
    });
  });
  list.querySelectorAll('[data-action="open-link"]').forEach((a) => {
    a.addEventListener("click", () => playExternal());
  });
}

function startTasksListener() {
  const q = query(collection(db, "tasks"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      tasksCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTasks();
    },
    (err) => {
      console.error("Failed to load tasks:", err);
      const list = $("taskList");
      if (list) list.innerHTML = `<p class="task-empty">Couldn't load tasks right now.</p>`;
    }
  );
}

function applyMonitorVisibility() {
  document.querySelectorAll(".monitor-only").forEach((el) => {
    el.hidden = !isCurrentMonitor;
  });
}

function openForm(task) {
  const form = $("taskForm");
  if (!form) return;
  editingId = task ? task.id : null;
  form.subject.value = (task && task.subject) || "";
  form.type.value = (task && task.type) || "homework";
  form.detail.value = (task && task.detail) || "";
  form.due.value = (task && task.due) || "";
  form.link.value = (task && task.link) || "";
  setTaskFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = task ? "Save changes" : "Add task";
  playOpen();
  form.querySelector('input[name="subject"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("taskForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setTaskFormError(null);
  if (!silent) playClose();
}

function setTaskFormError(message) {
  const el = $("taskFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function handleDelete(id) {
  if (!confirm("Delete this task?")) return;
  try {
    await deleteDoc(doc(db, "tasks", id));
    playDelete();
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert("Couldn't delete that task — check your monitor access and try again.");
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    subject: form.subject.value.trim(),
    type: form.type.value,
    detail: form.detail.value.trim(),
    due: form.due.value.trim(),
    link: normalizeLink(form.link.value || ""),
  };
  if (!payload.subject || !payload.detail || !payload.due) return;

  setTaskFormError(null);
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, "tasks", editingId), payload);
    } else {
      await addDoc(collection(db, "tasks"), { ...payload, createdAt: serverTimestamp() });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setTaskFormError("Couldn't save that task — check your monitor access and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

export function initTasks() {
  // Tasks are public (firestore.rules allows read: if true), so the
  // listener starts immediately — no need to wait on auth state or
  // gate the list behind a sign-in wall. Monitor-only controls (add /
  // edit / delete) still react to auth state separately below.
  startTasksListener();

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    applyMonitorVisibility();
    renderTasks(); // re-render so edit/delete controls appear/disappear with monitor state
  });

  const addBtn = $("addTaskBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));

  const form = $("taskForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }

  const todayDateEl = document.getElementById("todayDate");
  if (todayDateEl) {
    todayDateEl.textContent =
      new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
      " — homework, tasks, and announcements, kept current.";
  }
}
