import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFirebaseDb } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";

const $ = (id) => document.getElementById(id);
const ADMIN_EMAIL = "mohamedishankunnummal@gmail.com";

let isCurrentAdmin = false;
let currentUser = null;
let tasksCache = [];
let editingId = null;
let stopTasksListener = null;

function taskTypeLabel(type) {
  return type === "homework" ? "Homework" : "Announcement";
}

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text ?? "";
  parent.appendChild(element);
  return element;
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}

function createTaskRow(task) {
  const row = document.createElement("div");
  row.className = "task-row";

  const tag = appendText(row, "span", taskTypeLabel(task.type), `task-tag ${task.type === "homework" ? "homework" : "announcement"}`);

  const body = document.createElement("div");
  body.className = "task-body";
  appendText(body, "p", task.subject, "task-subject");
  appendText(body, "p", task.detail, "task-detail");
  row.appendChild(body);

  appendText(row, "span", task.due, "task-due");

  const actions = document.createElement("div");
  actions.className = "task-admin-actions admin-only";
  actions.hidden = !isCurrentAdmin;

  const editButton = document.createElement("button");
  editButton.className = "task-icon-btn";
  editButton.type = "button";
  editButton.setAttribute("aria-label", `Edit ${task.subject || "task"}`);
  editButton.textContent = "✎";
  editButton.addEventListener("click", () => openForm(task));

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-icon-btn";
  deleteButton.type = "button";
  deleteButton.setAttribute("aria-label", `Delete ${task.subject || "task"}`);
  deleteButton.textContent = "✕";
  deleteButton.addEventListener("click", () => handleDelete(task.id));

  actions.append(editButton, deleteButton);
  row.appendChild(actions);

  return row;
}

function renderTasks() {
  const list = $("taskList");
  if (!list) return;

  list.replaceChildren();

  if (!currentUser) {
    appendText(list, "p", "Sign in to view the live class task list.", "task-empty");
    return;
  }

  if (tasksCache.length === 0) {
    appendText(list, "p", "Nothing logged for today.", "task-empty");
    return;
  }

  for (const task of tasksCache) {
    list.appendChild(createTaskRow(task));
  }
}

async function startTasksListener() {
  if (stopTasksListener || !currentUser) return;

  let db;
  try {
    db = await getFirebaseDb();
  } catch (error) {
    console.error("Firebase tasks initialization failed:", error);
    const list = $("taskList");
    if (list) {
      list.replaceChildren();
      appendText(list, "p", "Live tasks are temporarily unavailable.", "task-empty");
    }
    return;
  }

  const tasksRef = collection(db, "tasks");

  stopTasksListener = onSnapshot(
    tasksRef,
    (snapshot) => {
      tasksCache = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .sort((a, b) => timestampValue(a.createdAt) - timestampValue(b.createdAt));

      renderTasks();
    },
    (error) => {
      console.error("Failed to load tasks:", error);
      tasksCache = [];
      const list = $("taskList");
      if (list) {
        list.replaceChildren();
        appendText(
          list,
          "p",
          error.code === "permission-denied"
            ? "Sign in is required to view the live class task list."
            : "Couldn't load tasks right now. Try refreshing in a moment.",
          "task-empty"
        );
      }
    }
  );
}

function stopTasksListenerNow() {
  if (stopTasksListener) {
    stopTasksListener();
    stopTasksListener = null;
  }
  tasksCache = [];
}

function applyAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !isCurrentAdmin;
  });

  const addButton = $("addTaskBtn");
  if (addButton) addButton.hidden = !isCurrentAdmin;
}

function openForm(task = null) {
  if (!isCurrentAdmin) return;

  const form = $("taskForm");
  if (!form) return;

  editingId = task?.id || null;
  form.elements.subject.value = task?.subject || "";
  form.elements.type.value = task?.type || "homework";
  form.elements.detail.value = task?.detail || "";
  form.elements.due.value = task?.due || "";
  form.hidden = false;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.textContent = editingId ? "Save changes" : "Add task";
  form.elements.subject.focus();
}

function closeForm() {
  const form = $("taskForm");
  if (!form) return;

  form.reset();
  form.hidden = true;
  editingId = null;
}

async function handleDelete(id) {
  if (!isCurrentAdmin || !currentUser) return;
  const db = await getFirebaseDb();
  const task = tasksCache.find((entry) => entry.id === id);
  const label = task?.subject || "this task";

  if (!window.confirm(`Delete "${label}"?`)) return;

  try {
    await deleteDoc(doc(db, "tasks", id));
  } catch (error) {
    console.error("Delete failed:", error);
    window.alert("Couldn't delete that task. Your Firebase permissions may not recognize this account as an admin.");
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!isCurrentAdmin || !currentUser) return;
  const db = await getFirebaseDb();

  const form = event.currentTarget;
  const payload = {
    subject: form.elements.subject.value.trim(),
    type: form.elements.type.value,
    detail: form.elements.detail.value.trim(),
    due: form.elements.due.value.trim(),
  };

  if (!payload.subject || !payload.detail || !payload.due) {
    window.alert("Fill in the subject, details, and due field.");
    return;
  }

  if (!["homework", "announcement"].includes(payload.type)) {
    window.alert("Choose a valid task type.");
    return;
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, "tasks", editingId), payload);
    } else {
      await addDoc(collection(db, "tasks"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }

    closeForm();
  } catch (error) {
    console.error("Save failed:", error);
    window.alert("Couldn't save that task. Your Firebase permissions may not recognize this account as an admin.");
  }
}

export function initTasks() {
  $("addTaskBtn")?.addEventListener("click", () => openForm());
  $("taskForm")?.addEventListener("submit", handleSubmit);
  $("taskForm")?.querySelector('[data-action="cancel"]')?.addEventListener("click", closeForm);

  $("todayDate").textContent =
    `${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — homework, tasks, and announcements, kept current.`;

  subscribeAuth((state) => {
    currentUser = state.user;
    const normalizedEmail = (state.user?.email || "").trim().toLowerCase();
    isCurrentAdmin = Boolean(
      state.admin ||
      normalizedEmail === ADMIN_EMAIL
    );

    applyAdminVisibility();

    if (!currentUser) {
      closeForm();
      stopTasksListenerNow();
      $("todayNote").textContent = "Sign in to see the live class task list.";
    } else {
      $("todayNote").textContent = isCurrentAdmin
        ? "You have admin controls for this class task board."
        : "Live class tasks and announcements.";
      startTasksListener();
    }

    renderTasks();
  });
}
