// ============================================
// 8CM — "What's for today" task hub
// ------------------------------------------------
// Tasks live in Firestore (collection: tasks) so they update for
// everyone in real time. Add/edit/delete controls only render for
// admins client-side — the real enforcement is firestore.rules,
// which reject the write server-side regardless of what the UI shows.
//
// Attachments are NOT in Firebase Storage — the Spark (free) plan
// doesn't include Storage. Instead each attachment is its own doc in
// a top-level `taskAttachments` collection: {taskId, name, type,
// size, dataUrl, createdAt}, where dataUrl is the file re-encoded as
// base64 (see file-utils.js). The task doc itself only keeps a light
// `attachments: [{id, name, type, size}]` array — no dataUrl — so the
// live task-feed listener (which every visitor runs) never has to
// download megabytes of base64 just to show a list of pill cards.
// The actual bytes are only fetched on demand, when someone clicks
// a pill to download it (see handleDownloadAttachment).
//
// Splitting attachments into their own docs (rather than embedding
// dataUrl directly on the task) is what makes 5 attachments per task
// workable at all: Firestore caps a single document at ~1 MiB, so 5
// embedded files would have to share that one budget. As separate
// docs, each attachment gets its own ~1 MiB ceiling.
// ============================================
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import {
  formatBytes,
  fileIconSvg,
  fileToDataUrl,
  compressImageToDataUrl,
  estimateEncodedBytes,
  MAX_ENCODED_BYTES,
} from "./file-utils.js";
import { createDropzone } from "./dropzone.js";
import { confirmDelete } from "./confirm-modal.js";

const $ = (id) => document.getElementById(id);

const MAX_ATTACHMENTS = 5;
// Non-image files (PDF, Office docs, text) can't be compressed
// client-side, so they're capped small and hard here: 650KB raw
// becomes ~867KB base64, safely under MAX_ENCODED_BYTES (900KB).
const MAX_NONIMAGE_BYTES = 650 * 1024;
// Images get compressed at submit time (see compressImageToDataUrl),
// so this is just a sanity ceiling on the *original* file at
// picking-time — generous enough for an uncompressed phone photo.
const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
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
let existingAttachments = []; // [{id, name, type, size}] already saved on the task being edited
let removedExistingIds = []; // existing attachments staged for removal — actually deleted from Firestore on save
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
          <button type="button" class="task-attachment-download" data-action="download-attachment" data-id="${a.id}" data-name="${a.name}">
            ${fileIconSvg(a.name, a.type)} ${a.name}<span class="task-attachment-size">${formatBytes(a.size)}</span>
          </button>
          <button
            type="button"
            class="task-attachment-remove admin-only icon-btn-danger"
            data-action="remove-attachment"
            data-task-id="${task.id}"
            data-id="${a.id}"
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
  list.querySelectorAll('[data-action="download-attachment"]').forEach((btn) => {
    btn.addEventListener("click", () => handleDownloadAttachment(btn.dataset.id, btn.dataset.name));
  });
  list.querySelectorAll('[data-action="remove-attachment"]').forEach((btn) => {
    btn.addEventListener("click", () =>
      handleRemoveAttachment(btn.dataset.taskId, btn.dataset.id, btn.dataset.name)
    );
  });
}

// Attachment bytes live only on the taskAttachments doc, not on the
// task itself (see the file header note on why) — so "download" is a
// small on-demand fetch, then a normal blob download, rather than a
// plain <a href> straight to a stored URL.
async function handleDownloadAttachment(id, name) {
  try {
    const snap = await getDoc(doc(db, "taskAttachments", id));
    if (!snap.exists()) {
      alert("That attachment is no longer available.");
      return;
    }
    const blob = await (await fetch(snap.data().dataUrl)).blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = name || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    console.error("Failed to download attachment:", err);
    alert("Couldn't download that attachment right now.");
  }
}

async function handleRemoveAttachment(taskId, id, name) {
  const ok = await confirmDelete({
    title: "Delete this attachment?",
    message: name
      ? `"${name}" will be permanently removed from this task. This action cannot be undone.`
      : "This attachment will be permanently removed from this task. This action cannot be undone.",
  });
  if (!ok) return;

  const task = tasksCache.find((t) => t.id === taskId);
  if (!task) return;
  const remaining = (task.attachments || []).filter((a) => a.id !== id);
  try {
    await updateDoc(doc(db, "tasks", taskId), { attachments: remaining });
    // The Firestore write above is what makes it disappear from the
    // live list via onSnapshot — deleting the attachment doc below is
    // bookkeeping (frees the stored bytes), so it doesn't block or
    // reverse that.
    await deleteDoc(doc(db, "taskAttachments", id)).catch((err) => {
      console.error("Failed to delete attachment doc:", err);
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
        <button type="button" class="task-attachment-download" data-action="download-attachment" data-id="${a.id}" data-name="${a.name}">${fileIconSvg(a.name, a.type)} ${a.name}</button>
        <button type="button" class="task-attachment-remove" data-id="${a.id}" aria-label="Remove attachment ${a.name}">✕</button>
      </span>
    `
    )
    .join("");
  el.querySelectorAll('[data-action="download-attachment"]').forEach((btn) => {
    btn.addEventListener("click", () => handleDownloadAttachment(btn.dataset.id, btn.dataset.name));
  });
  el.querySelectorAll(".task-attachment-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Staged, not permanent yet — cancelling the form leaves the
      // attachment untouched. The attachment doc is only deleted once
      // the removal is saved (see handleSubmit), so backing out of
      // the form never orphans anything.
      const removed = existingAttachments.find((a) => a.id === btn.dataset.id);
      existingAttachments = existingAttachments.filter((a) => a.id !== btn.dataset.id);
      if (removed) removedExistingIds.push(removed.id);
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
  removedExistingIds = [];
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
  removedExistingIds = [];
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

// Turns a staged File into a saved taskAttachments doc and returns
// the light metadata the parent task's `attachments` array stores.
// Images are compressed to fit the shared byte budget; everything
// else is just base64-encoded directly (already capped small by
// validateAttachment below, since there's no way to shrink a PDF).
async function processAttachment(taskId, file, onProgress) {
  const isImage = file.type.startsWith("image/");
  onProgress(15);

  const { dataUrl, size } = isImage
    ? await compressImageToDataUrl(file)
    : { dataUrl: await fileToDataUrl(file), size: file.size };

  if (!isImage && estimateEncodedBytes(dataUrl) > MAX_ENCODED_BYTES) {
    throw new Error(`"${file.name}" is too large to store — ${formatBytes(MAX_NONIMAGE_BYTES)} max.`);
  }
  onProgress(60);

  const docRef = await addDoc(collection(db, "taskAttachments"), {
    taskId,
    name: file.name,
    type: file.type,
    size,
    dataUrl,
    createdAt: serverTimestamp(),
  });
  onProgress(100);
  return { id: docRef.id, name: file.name, type: file.type, size };
}

function validateAttachment(file) {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return `"${file.name}" isn't an allowed file type.`;
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      return `"${file.name}" is too large to process — try a smaller image.`;
    }
  } else if (file.size > MAX_NONIMAGE_BYTES) {
    return `"${file.name}" is too large — non-image files are capped at ${formatBytes(MAX_NONIMAGE_BYTES)} since they're stored directly in the database (no Firebase Storage on the free plan).`;
  }
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

    // Processed in parallel, each with its own progress row. One
    // file failing (compression can't hit budget, a rejected type
    // server-side, etc.) doesn't lose the others — whatever succeeded
    // still gets saved, and the failure is reported by name so
    // nothing disappears silently.
    const results = await Promise.allSettled(
      newFiles.map((file, i) => processAttachment(taskId, file, (pct) => updateProgressRow(progressRows, i, pct)))
    );
    const uploaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results
      .map((r, i) => (r.status === "rejected" ? newFiles[i].name : null))
      .filter(Boolean);

    const attachments = [...existingAttachments, ...uploaded];
    await updateDoc(doc(db, "tasks", taskId), { ...payload, attachments });

    // Clean up taskAttachments docs for attachments the admin removed
    // during this edit — staged removals only take effect once the
    // save actually succeeds.
    await Promise.allSettled(
      removedExistingIds.map((id) =>
        deleteDoc(doc(db, "taskAttachments", id)).catch((err) => console.error("Failed to delete removed attachment:", err))
      )
    );

    if (failed.length) {
      setTaskFormError(`Saved, but ${failed.length === 1 ? "this file" : "these files"} failed to upload: ${failed.join(", ")}.`);
      // Leave the form open so the admin can retry just the failed
      // file(s) — further submits from here are edits to this same
      // task, so relabel the button accordingly.
      existingAttachments = attachments;
      removedExistingIds = [];
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
