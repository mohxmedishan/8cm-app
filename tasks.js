// ============================================
// 8CM — "What's for today" task hub
// ------------------------------------------------
// Tasks live in Firestore (collection: tasks) so they update for
// everyone in real time. Add/edit/delete controls only render for
// admins client-side — the real enforcement is firestore.rules,
// which reject the write server-side regardless of what the UI shows.
//
// Attachment uploads use uploadFileWithProgress (file-utils.js)
// instead of a bare uploadBytes() call, uploaded in parallel with a
// progress bar per file — the fix for the old "stuck on Uploading…"
// bug, where a stalled transfer had no timeout and just hung forever
// with no feedback.
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
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { formatBytes, sanitizeFilename, fileIconSvg, uploadFileWithProgress } from "./file-utils.js";
import { createDropzone } from "./dropzone.js";
import { confirmDelete } from "./confirm-modal.js";

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
let removedExistingPaths = []; // existing attachments staged for removal — actually deleted from Storage on save
let attachmentsDropzone = null;

function taskTypeLabel(type) {
  return type === "homework" ? "Homework" : "Announcement";
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
          <a href="${a.url}" target="_blank" rel="noopener">${fileIconSvg(a.name, a.type)} ${a.name}<span class="task-attachment-size">${formatBytes(a.size)}</span></a>
          <button
            type="button"
            class="task-attachment-remove admin-only icon-btn-danger"
            data-action="remove-attachment"
            data-task-id="${task.id}"
            data-path="${a.path}"
            data-name="${a.name}"
            aria-label="Delete attachment ${a.name}"
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
        <button class="task-icon-btn icon-btn-danger" data-action="delete" data-id="${task.id}" aria-label="Delete task">✕</button>
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
    btn.addEventListener("click", () =>
      handleRemoveAttachment(btn.dataset.taskId, btn.dataset.path, btn.dataset.name)
    );
  });
}

async function handleRemoveAttachment(taskId, path, name) {
  const ok = await confirmDelete({
    title: "Delete this attachment?",
    message: name
      ? `"${name}" will be permanently removed from this task. This action cannot be undone.`
      : "This attachment will be permanently removed from this task. This action cannot be undone.",
  });
  if (!ok) return;

  const task = tasksCache.find((t) => t.id === taskId);
  if (!task) return;
  const remaining = (task.attachments || []).filter((a) => a.path !== path);
  try {
    await updateDoc(doc(db, "tasks", taskId), { attachments: remaining });
    // The Firestore write is what makes it disappear from the live
    // list via onSnapshot — Storage cleanup below is bookkeeping.
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
      renderTasks(); // live for everyone — no page refresh needed
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

function refreshAttachmentCap() {
  attachmentsDropzone?.setMaxFiles(Math.max(0, MAX_ATTACHMENTS - existingAttachments.length));
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
        <a href="${a.url}" target="_blank" rel="noopener">${fileIconSvg(a.name, a.type)} ${a.name}</a>
        <button type="button" class="task-attachment-remove" data-path="${a.path}" aria-label="Remove attachment ${a.name}">✕</button>
      </span>
    `
    )
    .join("");
  el.querySelectorAll(".task-attachment-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Staged, not permanent yet — cancelling the form leaves the
      // attachment untouched. The actual Storage file is only
      // deleted once the removal is saved (see handleSubmit), so a
      // removal here never orphans a file if the admin backs out.
      const removed = existingAttachments.find((a) => a.path === btn.dataset.path);
      existingAttachments = existingAttachments.filter((a) => a.path !== btn.dataset.path);
      if (removed) removedExistingPaths.push(removed.path);
      renderExistingAttachmentsPreview();
      refreshAttachmentCap();
    });
  });
}

function openForm(task) {
  const form = $("taskForm");
  if (!form) return;
  editingId = task ? task.id : null;
  existingAttachments = (task && task.attachments) || [];
  removedExistingPaths = [];
  form.subject.value = (task && task.subject) || "";
  form.type.value = (task && task.type) || "homework";
  form.detail.value = (task && task.detail) || "";
  form.due.value = (task && task.due) || "";
  attachmentsDropzone?.reset();
  setTaskFormError(null);
  setUploadProgress([]);
  renderExistingAttachmentsPreview();
  refreshAttachmentCap();
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = task ? "Save changes" : "Add task";
}

function closeForm() {
  const form = $("taskForm");
  if (!form) return;
  form.reset();
  attachmentsDropzone?.reset();
  setUploadProgress([]);
  form.hidden = true;
  editingId = null;
  existingAttachments = [];
  removedExistingPaths = [];
  setTaskFormError(null);
  renderExistingAttachmentsPreview();
}

function setTaskFormError(message) {
  const el = $("taskFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function setUploadProgress(rows) {
  const wrap = $("taskFormUploadProgress");
  if (!wrap) return;
  if (!rows || rows.length === 0) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = rows
    .map(
      (r, i) => `
      <div class="upload-progress-row" data-index="${i}">
        <span class="upload-progress-name">${fileIconSvg(r.name, r.type)} ${r.name}</span>
        <div class="upload-progress"><div class="upload-progress-bar" id="taskUploadBar-${i}" style="width:${r.pct}%"></div></div>
        <span class="upload-progress-pct" id="taskUploadPct-${i}">${r.pct}%</span>
      </div>
    `
    )
    .join("");
}

function updateProgressRow(rows, index, pct) {
  rows[index].pct = pct;
  const bar = $(`taskUploadBar-${index}`);
  const pctEl = $(`taskUploadPct-${index}`);
  if (bar) bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
}

async function handleDelete(id) {
  const task = tasksCache.find((t) => t.id === id);
  const ok = await confirmDelete({
    title: "Delete this task?",
    message: task
      ? `"${task.subject}" will be permanently removed for everyone. This action cannot be undone.`
      : "This task will be permanently removed for everyone. This action cannot be undone.",
  });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "tasks", id));
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that task — check your admin access and try again.");
  }
}

async function uploadAttachment(taskId, file, onProgress) {
  const path = `task-attachments/${taskId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const fileRef = ref(storage, path);
  const url = await uploadFileWithProgress(fileRef, file, { onProgress });
  return { name: file.name, url, path, size: file.size, type: file.type };
}

function validateAttachment(file) {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return `"${file.name}" isn't an allowed file type.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" is too large — 10MB max per file.`;
  return null;
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

  const newFiles = attachmentsDropzone?.getFiles() || [];
  const totalCount = existingAttachments.length + newFiles.length;
  if (totalCount > MAX_ATTACHMENTS) {
    setTaskFormError(`Too many files — ${MAX_ATTACHMENTS} attachments max per task (${existingAttachments.length} already attached).`);
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = newFiles.length ? "Uploading…" : "Saving…";

  const progressRows = newFiles.map((f) => ({ name: f.name, type: f.type, pct: 0 }));
  setUploadProgress(progressRows);

  try {
    let taskId = editingId;
    if (!taskId) {
      const docRef = await addDoc(collection(db, "tasks"), {
        ...payload,
        attachments: [],
        createdAt: serverTimestamp(),
      });
      taskId = docRef.id;
      // Latch onto the newly-created doc immediately: if an upload or
      // the follow-up updateDoc below fails, a retry must edit this
      // same task, not addDoc() a second one.
      editingId = taskId;
    }

    // Uploaded in parallel, each with its own progress row. One
    // file failing (a stall, a rejected type server-side, etc.)
    // doesn't lose the others — whatever succeeded still gets saved,
    // and the failure is reported by name so nothing disappears
    // silently.
    const results = await Promise.allSettled(
      newFiles.map((file, i) => uploadAttachment(taskId, file, (pct) => updateProgressRow(progressRows, i, pct)))
    );
    const uploaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results
      .map((r, i) => (r.status === "rejected" ? newFiles[i].name : null))
      .filter(Boolean);

    const attachments = [...existingAttachments, ...uploaded];
    await updateDoc(doc(db, "tasks", taskId), { ...payload, attachments });

    // Clean up Storage files for attachments the admin removed
    // during this edit — staged removals only take effect once the
    // save actually succeeds.
    await Promise.allSettled(
      removedExistingPaths.map((path) =>
        deleteObject(ref(storage, path)).catch((err) => console.error("Failed to delete removed attachment:", err))
      )
    );

    if (failed.length) {
      setTaskFormError(`Saved, but ${failed.length === 1 ? "this file" : "these files"} failed to upload: ${failed.join(", ")}.`);
      // Leave the form open so the admin can retry just the failed
      // file(s) — further submits from here are edits to this same
      // task, so relabel the button accordingly.
      existingAttachments = attachments;
      removedExistingPaths = [];
      attachmentsDropzone?.reset();
      renderExistingAttachmentsPreview();
      refreshAttachmentCap();
    } else {
      closeForm();
    }
  } catch (err) {
    console.error("Save failed:", err);
    setTaskFormError(err?.message || "Couldn't save that task — check your admin access and try again.");
  } finally {
    // Always runs, so the button can never get stuck reading
    // "Uploading…"/"Saving…" no matter how the save ends. If a task
    // got created/latched onto above (editingId set) but the form
    // stayed open — e.g. a partial upload failure — relabel for the
    // edit that a retry now is, instead of the original "Add task".
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? "Save changes" : originalLabel;
    setUploadProgress([]);
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

  attachmentsDropzone = createDropzone({
    zone: $("taskAttachmentsZone"),
    input: $("taskAttachmentsInput"),
    list: $("taskAttachmentsPreview"),
    multiple: true,
    maxFiles: MAX_ATTACHMENTS,
    validate: validateAttachment,
    onInvalid: (file, error) => setTaskFormError(error),
    onChange: () => setTaskFormError(null),
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
