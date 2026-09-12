// ============================================
// 8CM — "What's for today" task hub
// ------------------------------------------------
// Tasks live in Firestore (collection: tasks) so they update for
// everyone in real time. Add/edit/delete controls only render for
// admins client-side — the real enforcement is firestore.rules,
// which reject the write server-side regardless of what the UI shows.
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

const $ = (id) => document.getElementById(id);

let isCurrentAdmin = false;
let tasksCache = [];
let editingId = null;

function taskTypeLabel(type) {
  return type === "homework" ? "Homework" : "Announcement";
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
      </div>
      <span class="task-due">${task.due}</span>
      <div class="task-admin-actions admin-only" ${isCurrentAdmin ? "" : "hidden"}>
        <button class="task-icon-btn" data-action="edit" data-id="${task.id}" aria-label="Edit task">✎</button>
        <button class="task-icon-btn" data-action="delete" data-id="${task.id}" aria-label="Delete task">✕</button>
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
      if (task) openForm(task);
    });
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

function applyAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.hidden = !isCurrentAdmin;
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
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = task ? "Save changes" : "Add task";
}

function closeForm() {
  const form = $("taskForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
}

async function handleDelete(id) {
  if (!confirm("Delete this task?")) return;
  try {
    await deleteDoc(doc(db, "tasks", id));
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that task — check your admin access and try again.");
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
  };
  if (!payload.subject || !payload.detail || !payload.due) return;

  try {
    if (editingId) {
      await updateDoc(doc(db, "tasks", editingId), payload);
    } else {
      await addDoc(collection(db, "tasks"), { ...payload, createdAt: serverTimestamp() });
    }
    closeForm();
  } catch (err) {
    console.error("Save failed:", err);
    alert("Couldn't save that task — check your admin access and try again.");
  }
}

export function initTasks() {
  // firestore.rules requires request.auth != null to read /tasks, but
  // this used to call startTasksListener() unconditionally at load —
  // before Firebase Auth had finished restoring the persisted session.
  // The very first query would run with no auth token attached yet,
  // Firestore would reject it as "Missing or insufficient permissions,"
  // and onSnapshot's error callback never fires again to retry. Gating
  // the listener on the auth-state subscription instead means it only
  // ever starts once we actually know whether someone's signed in.
  let unsubscribeTasks = null;
  let listening = false;

  subscribeAuth(({ user, admin }) => {
    isCurrentAdmin = admin;
    applyAdminVisibility();

    if (user) {
      if (!listening) {
        listening = true;
        unsubscribeTasks = startTasksListener();
      }
    } else {
      if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
        listening = false;
      }
      tasksCache = [];
      const list = $("taskList");
      if (list) list.innerHTML = `<p class="task-empty">Sign in to see today's tasks.</p>`;
    }
  });

  const addBtn = $("addTaskBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));

  const form = $("taskForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", closeForm);
  }

  document.getElementById("todayDate").textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    " — homework, tasks, and announcements, kept current.";
}
