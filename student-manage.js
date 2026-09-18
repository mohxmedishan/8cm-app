// ============================================
// 8CM — Student management (monitor-only UI)
// ============================================
import {
  doc, setDoc, deleteDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { loadStudents, onStudents, invalidateStudentsCache } from "./students.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);
let isCurrentMonitor = false;
let editingId = null;
let currentList = [];
let claimsByStudent = new Map();
let claimsLoaded = false;

function newStudentId() {
  return `student-${Date.now().toString(36)}`;
}
function transportLabel(t) {
  if (!t) return "—";
  return t === "OT" ? "Own transport" : `Bus ${t}`;
}
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function loadClaimsForList() {
  try {
    const snap = await getDocs(collection(db, "claims"));
    const map = new Map();
    snap.forEach((d) => {
      const data = d.data();
      if (data && data.uid) map.set(d.id, data.uid);
    });
    claimsByStudent = map;
  } catch (err) {
    console.error("Failed to load claims:", err);
    claimsByStudent = new Map();
  } finally {
    claimsLoaded = true;
  }
}

function render() {
  const list = $("studentManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage students.</p>`;
    return;
  }
  if (currentList.length === 0) {
    list.innerHTML = `<p class="task-empty">No students loaded yet.</p>`;
    return;
  }
  list.innerHTML = "";
  currentList.forEach((s) => {
    const claimed = claimsByStudent.has(s.id);
    const inactive = s.active === false;
    const row = document.createElement("div");
    row.className = `manage-row${inactive ? " is-inactive" : ""}`;
    row.innerHTML = `
      <span class="roll-badge">${escapeHtml(String(s.rollNumber || "?").padStart(2, "0"))}</span>
      <div class="manage-row-body">
        <p class="task-subject">${escapeHtml(s.name)} ${inactive ? '<span class="inactive-tag">inactive</span>' : ''} ${claimed ? '<span class="claimed-tag" title="Identity claimed by an account">claimed</span>' : ''}</p>
        <p class="task-detail">
          <span class="house-dot ${escapeHtml(s.house)}"></span> ${escapeHtml(s.house)}
          · ${escapeHtml(s.language || "—")}
          · ${escapeHtml(transportLabel(s.transport))}
          ${s.islamic ? ` · ${s.islamic === "islamic" ? "Islamic Ed" : "Value Ed"}` : ""}
          ${s.creative ? ` · ${s.creative.charAt(0).toUpperCase() + s.creative.slice(1)}` : ""}
        </p>
      </div>
      <div class="task-monitor-actions">
        ${claimed ? `<button class="task-icon-btn" data-action="release" data-id="${escapeHtml(s.id)}" title="Release this student's claim">⌫</button>` : ''}
        <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(s.id)}" aria-label="Edit student">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(s.id)}" aria-label="Deactivate student">✕</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.addEventListener("click", () => openForm(currentList.find((x) => x.id === btn.dataset.id))));
  list.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener("click", () => handleDeactivate(btn.dataset.id)));
  list.querySelectorAll('[data-action="release"]').forEach((btn) => btn.addEventListener("click", () => handleReleaseClaim(btn.dataset.id)));
}

function openForm(student) {
  const form = $("studentForm");
  if (!form) return;
  editingId = student ? student.id : null;
  form.name.value = student?.name || "";
  form.house.value = student?.house || "autumn";
  form.language.value = student?.language || "";
  form.islamic.value = student?.islamic || "";
  form.creative.value = student?.creative || "";
  form.transport.value = student?.transport || "";
  form.rollNumber.value = student?.rollNumber || (currentList.reduce((m, s) => Math.max(m, s.rollNumber || 0), 0) + 1);
  form.active.checked = student ? student.active !== false : true;
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = student ? "Save changes" : "Add student";
  playOpen();
  form.name.focus();
}
function closeForm({ silent = false } = {}) {
  const form = $("studentForm");
  if (!form) return;
  form.reset(); form.hidden = true; editingId = null; setFormError(null);
  if (!silent) playClose();
}
function setFormError(message) {
  const el = $("studentFormError");
  if (!el) return;
  el.hidden = !message; el.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value.trim(), house: form.house.value,
    language: form.language.value || null,
    islamic: form.islamic.value || null,
    creative: form.creative.value || null,
    transport: form.transport.value.trim(),
    rollNumber: parseInt(form.rollNumber.value, 10) || 0, active: form.active.checked,
  };
  if (!payload.name || !payload.rollNumber) return;
  setFormError(null);
  const btn = form.querySelector('button[type="submit"]'); const original = btn.textContent;
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (editingId) {
      await setDoc(doc(db, "students", editingId), { id: editingId, ...payload }, { merge: true });
      await logAction("updated", { resourceType: "student", resourceId: editingId, summary: `Updated student: ${payload.name}` });
    } else {
      const id = newStudentId();
      await setDoc(doc(db, "students", id), { id, ...payload });
      await logAction("created", { resourceType: "student", resourceId: id, summary: `Added student: ${payload.name}` });
    }
    playSuccess(); closeForm({ silent: true }); await invalidateStudentsCache(); claimsLoaded = false;
  } catch (err) {
    console.error("Save failed:", err); playError(); setFormError("Couldn't save that — check your monitor access and try again.");
  } finally { btn.disabled = false; btn.textContent = original; }
}
async function handleDeactivate(id) {
  const student = currentList.find((s) => s.id === id); if (!student) return;
  if (!confirm(`Deactivate ${student.name}? They'll disappear from the directory. Their claim (if any) stays.`)) return;
  try {
    await setDoc(doc(db, "students", id), { active: false }, { merge: true });
    await logAction("deactivated", { resourceType: "student", resourceId: id, summary: `Deactivated student: ${student.name}` });
    playDelete(); await invalidateStudentsCache();
  } catch (err) { console.error("Deactivate failed:", err); playError(); alert("Couldn't deactivate that — check your monitor access."); }
}
async function handleReleaseClaim(studentId) {
  const student = currentList.find((s) => s.id === studentId); if (!student) return;
  if (!confirm(`Release the identity claim on ${student.name}? The account that claimed this student will lose their link.`)) return;
  try {
    await deleteDoc(doc(db, "claims", studentId));
    await logAction("released-claim", { resourceType: "claim", resourceId: studentId, summary: `Released identity claim on ${student.name}` });
    playDelete(); claimsByStudent.delete(studentId); render();
  } catch (err) { console.error("Release claim failed:", err); playError(); alert("Couldn't release that claim — check your monitor access."); }
}

export function initStudentManagement() {
  if (!$("studentManageList")) return;
  onStudents((list) => { currentList = list; render(); });
  loadStudents().catch(() => {});
  subscribeAuth(async ({ monitor }) => {
    isCurrentMonitor = monitor;
    const addBtn = $("addStudentBtn"); if (addBtn) addBtn.hidden = !monitor;
    if (monitor && !claimsLoaded) await loadClaimsForList();
    render();
  });
  const addBtn = $("addStudentBtn"); if (addBtn) addBtn.addEventListener("click", () => openForm(null));
  const form = $("studentForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]'); if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }
}
