// ============================================
// 8CM — Teacher management (monitor-only)
// ------------------------------------------------
// Firestore: teachers/{id} = { honorific, name, subject, notes, active }
// Public read. Monitor-only write.
// ============================================
import {
  doc, setDoc, deleteDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { loadTeachers, onTeachers, invalidateTeachersCache } from "./teachers-data.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);
let isCurrentMonitor = false;
let editingId = null;
let currentList = [];

function newTeacherId() {
  return `teacher-${Date.now().toString(36)}`;
}

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function render() {
  const list = $("teacherManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage teachers.</p>`;
    return;
  }
  if (!currentList.length) {
    list.innerHTML = `<p class="task-empty">No teachers loaded yet.</p>`;
    return;
  }

  list.innerHTML = "";
  currentList.forEach((t) => {
    const inactive = t.active === false;
    const row = document.createElement("div");
    row.className = `manage-row${inactive ? " is-inactive" : ""}`;
    row.innerHTML = `
      <div class="manage-row-body">
        <p class="task-subject">${escapeHtml(t.honorific || "")} ${escapeHtml(t.name || "")} ${inactive ? '<span class="inactive-tag">inactive</span>' : ''}</p>
        <p class="task-detail">${escapeHtml(t.subject || "—")}${t.notes ? " · " + escapeHtml(t.notes) : ""}</p>
      </div>
      <div class="task-monitor-actions">
        <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(t.id)}" aria-label="Edit teacher">✎</button>
        ${inactive
          ? `<button class="task-icon-btn" data-action="reactivate" data-id="${escapeHtml(t.id)}" title="Reactivate">↺</button>`
          : `<button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(t.id)}" aria-label="Remove teacher">✕</button>`}
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('[data-action="edit"]').forEach((b) =>
    b.addEventListener("click", () => openForm(currentList.find((x) => x.id === b.dataset.id)))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((b) =>
    b.addEventListener("click", () => handleDeactivate(b.dataset.id))
  );
  list.querySelectorAll('[data-action="reactivate"]').forEach((b) =>
    b.addEventListener("click", () => handleReactivate(b.dataset.id))
  );
}

function openForm(teacher) {
  const f = $("teacherForm");
  if (!f) return;
  editingId = teacher ? teacher.id : null;
  f.honorific.value = teacher?.honorific || "Mr.";
  f.name.value = teacher?.name || "";
  f.subject.value = teacher?.subject || "";
  f.notes.value = teacher?.notes || "";
  f.active.checked = teacher ? teacher.active !== false : true;
  setFormError(null);
  f.hidden = false;
  f.querySelector('button[type="submit"]').textContent = teacher ? "Save changes" : "Add teacher";
  playOpen();
  f.name.focus();
}

function closeForm({ silent = false } = {}) {
  const f = $("teacherForm");
  if (!f) return;
  f.reset();
  f.hidden = true;
  editingId = null;
  setFormError(null);
  if (!silent) playClose();
}

function setFormError(m) {
  const el = $("teacherFormError");
  if (!el) return;
  el.hidden = !m;
  el.textContent = m || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const payload = {
    honorific: f.honorific.value,
    name: f.name.value.trim(),
    subject: f.subject.value.trim(),
    notes: f.notes.value.trim(),
    active: f.active.checked,
  };
  if (!payload.honorific || !payload.name) return;

  setFormError(null);
  const btn = f.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    if (editingId) {
      await setDoc(doc(db, "teachers", editingId), { id: editingId, ...payload }, { merge: true });
      await logAction("updated", { resourceType: "teacher", resourceId: editingId, summary: `Updated teacher: ${payload.honorific} ${payload.name}` });
    } else {
      const id = newTeacherId();
      await setDoc(doc(db, "teachers", id), { id, ...payload });
      await logAction("created", { resourceType: "teacher", resourceId: id, summary: `Added teacher: ${payload.honorific} ${payload.name}` });
    }
    playSuccess();
    closeForm({ silent: true });
    await invalidateTeachersCache();
  } catch (err) {
    console.error("Save failed:", err);
    playError();
    setFormError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function handleDeactivate(id) {
  const t = currentList.find((x) => x.id === id);
  if (!t) return;
  const fullName = `${t.honorific || ""} ${t.name || ""}`.trim();
  const typed = prompt(
    `Remove ${fullName} from the teachers directory?\n\nThey'll disappear from the teachers list, but you can reactivate them from this same panel any time. Their data stays in Firestore.\n\nType their full name exactly to confirm:`
  );
  if (typed === null) return;
  if (typed.trim() !== fullName) {
    alert("Name didn't match. Nothing was changed.");
    return;
  }
  try {
    await setDoc(doc(db, "teachers", id), { active: false }, { merge: true });
    await logAction("deactivated", { resourceType: "teacher", resourceId: id, summary: `Deactivated teacher: ${fullName}` });
    playDelete();
    await invalidateTeachersCache();
  } catch (err) {
    console.error("Deactivate failed:", err);
    playError();
    alert(describeWriteError(err, "remove"));
  }
}

async function handleReactivate(id) {
  const t = currentList.find((x) => x.id === id);
  if (!t) return;
  try {
    await setDoc(doc(db, "teachers", id), { active: true }, { merge: true });
    await logAction("reactivated", { resourceType: "teacher", resourceId: id, summary: `Reactivated teacher: ${t.honorific} ${t.name}` });
    playSuccess();
    await invalidateTeachersCache();
  } catch (err) {
    console.error("Reactivate failed:", err);
    playError();
    alert(describeWriteError(err, "reactivate"));
  }
}

export function initTeacherManagement() {
  if (!$("teacherManageList")) return;
  onTeachers((list) => { currentList = list; render(); });
  loadTeachers().catch(() => {});

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    const addBtn = $("addTeacherBtn");
    if (addBtn) addBtn.hidden = !monitor;
    render();
  });

  const add = $("addTeacherBtn");
  if (add) add.addEventListener("click", () => openForm(null));

  const f = $("teacherForm");
  if (f) {
    f.addEventListener("submit", handleSubmit);
    const cancel = f.querySelector('[data-action="cancel"]');
    if (cancel) cancel.addEventListener("click", () => closeForm());
  }
}