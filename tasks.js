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
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";

const $ = (id) => document.getElementById(id);

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — mirrors storage.rules
const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

let isCurrentAdmin = false;
let tasksCache = [];
let editingId = null;
let existingAttachments = []; // attachments already saved on the task being edited

function taskTypeLabel(type) {
  return type === "homework" ? "Homework" : "Announcement";
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
}

function attachmentsMarkup(task) {
  const attachments = task.attachments || [];
  if (attachments.length === 0) return "";
  return `
    <div class="task-attachments">
      ${attachments
        .map(
          (a) => `
        <span class="task-attachment-chip">
          <a href="${a.url}" target="_blank" rel="noopener">📎 ${a.name}<span class="task-attachment-size">${formatBytes(a.size)}</span></a>
          <button
            type="button"
            class="task-attachment-remove admin-only"
            data-action="remove-attachment"
            data-task-id="${task.id}"
            data-path="${a.path}"
            aria-label="Remove attachment ${a.name}"
            ${isCurrentAdmin ? "" : "hidden"}
          >✕</button>
        </span>
      `
        )
        .join("")}
    </div>
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
        ${attachmentsMarkup(task)}
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
  list.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
    btn.addEventListener("click", () => handleRemoveAttachment(btn.dataset.taskId, btn.dataset.path));
  });
}

async function handleRemoveAttachment(taskId, path) {
  if (!confirm("Remove this attachment?")) return;
  const task = tasksCache.find((t) => t.id === taskId);
  if (!task) return;
  const remaining = (task.attachments || []).filter((a) => a.path !== path);
  try {
    await updateDoc(doc(db, "tasks", taskId), { attachments: remaining });
    await deleteObject(ref(storage, path)).catch((err) => {
      console.error("Failed to delete attachment file:", err);
    });
  } catch (err) {
    console.error("Failed to remove attachment:", err);
    alert("Couldn't remove that attachment — check your admin access and try again.");
  }
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

function renderExistingAttachmentsPreview() {
  const el = $("taskFormExistingAttachments");
  if (!el) return;
  if (existingAttachments.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = existingAttachments
    .map(
      (a) => `
      <span class="task-attachment-chip">
        <a href="${a.url}" target="_blank" rel="noopener">📎 ${a.name}</a>
        <button type="button" class="task-attachment-remove" data-path="${a.path}" aria-label="Remove attachment ${a.name}">✕</button>
      </span>
    `
    )
    .join("");
  el.querySelectorAll(".task-attachment-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      existingAttachments = existingAttachments.filter((a) => a.path !== btn.dataset.path);
      renderExistingAttachmentsPreview();
    });
  });
}

function openForm(task) {
  const form = $("taskForm");
  if (!form) return;
  editingId = task ? task.id : null;
  existingAttachments = (task && task.attachments) || [];
  form.subject.value = (task && task.subject) || "";
  form.type.value = (task && task.type) || "homework";
  form.detail.value = (task && task.detail) || "";
  form.due.value = (task && task.due) || "";
  form.attachments.value = "";
  setTaskFormError(null);
  renderExistingAttachmentsPreview();
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = task ? "Save changes" : "Add task";
}

function closeForm() {
  const form = $("taskForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  existingAttachments = [];
  setTaskFormError(null);
  renderExistingAttachmentsPreview();
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
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that task — check your admin access and try again.");
  }
}

async function uploadAttachment(taskId, file) {
  const path = `task-attachments/${taskId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { name: file.name, url, path, size: file.size, type: file.type };
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

  setTaskFormError(null);

  const newFiles = Array.from(form.attachments.files || []);
  const totalCount = existingAttachments.length + newFiles.length;
  if (totalCount > MAX_ATTACHMENTS) {
    setTaskFormError(`Too many files — ${MAX_ATTACHMENTS} attachments max per task (${existingAttachments.length} already attached).`);
    return;
  }
  for (const file of newFiles) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      setTaskFormError(`"${file.name}" isn't an allowed file type.`);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setTaskFormError(`"${file.name}" is too large — 10MB max per file.`);
      return;
    }
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = newFiles.length ? "Uploading…" : "Saving…";

  try {
    let taskId = editingId;
    if (!taskId) {
      const docRef = await addDoc(collection(db, "tasks"), {
        ...payload,
        attachments: [],
        createdAt: serverTimestamp(),
      });
      taskId = docRef.id;
    }

    const uploaded = [];
    for (const file of newFiles) {
      uploaded.push(await uploadAttachment(taskId, file));
    }
    const attachments = [...existingAttachments, ...uploaded];

    await updateDoc(doc(db, "tasks", taskId), { ...payload, attachments });
    closeForm();
  } catch (err) {
    console.error("Save failed:", err);
    setTaskFormError("Couldn't save that task — check your admin access and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

export function initTasks() {
  // Tasks are public (firestore.rules allows read: if true), so the
  // listener starts immediately — no need to wait on auth state or
  // gate the list behind a sign-in wall. Admin-only controls (add /
  // edit / delete / attachment removal) still react to auth state
  // separately below.
  startTasksListener();

  subscribeAuth(({ admin }) => {
    isCurrentAdmin = admin;
    applyAdminVisibility();
    renderTasks(); // re-render so attachment remove buttons appear/disappear with admin state
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
