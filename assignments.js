// ============================================
// 8CM — Homework / assignment system
// ------------------------------------------------
// Two collections: `assignments` (the shared homework item — subject,
// title, due date, priority; monitor-managed) and `assignmentStatus`
// (one doc per student per assignment — just "did THIS student mark
// it done" — so a student's write can never touch the shared item or
// anyone else's row; see firestore.rules).
//
// Other modules (timetable-live.js, the dashboard code in script.js)
// need this same data without opening their own onSnapshot listener
// each — that would mean 2-3x the reads for the same ~dozen documents
// on every page load, which matters on the free plan. So this module
// owns the one live listener and republishes through onAssignments().
// ============================================
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { allSubjects } from "./timetable-data.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playToggleOn, playToggleOff } from "./sound.js";
import { setLinkStack, readLinkStack, linkChipsHtml } from "./item-links.js";
import { createArranger } from "./arrange.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

// ------------------------------------------------
// Shared cache + pub/sub — see module comment above
// ------------------------------------------------
let assignmentsCache = [];
let statusByAssignmentId = new Map(); // this student's own completion status only
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(assignmentsCache, statusByAssignmentId));
}

// Subscribe to live homework data from anywhere in the app. Returns
// an unsubscribe function. Fires immediately with whatever's cached
// (possibly empty, until the first snapshot arrives).
export function onAssignments(callback) {
  listeners.add(callback);
  callback(assignmentsCache, statusByAssignmentId);
  return () => listeners.delete(callback);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(dateStr, base = todayStr()) {
  // Plain YYYY-MM-DD strings, parsed as local dates at midnight so
  // "3 days from now" means calendar days, not 72 exact hours.
  const [y1, m1, d1] = base.split("-").map(Number);
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function isCompletedByMe(assignmentId) {
  return statusByAssignmentId.get(assignmentId) === "completed";
}

export function dueBucket(assignment) {
  if (isCompletedByMe(assignment.id)) return "completed";
  const diff = daysBetween(assignment.dueDate);
  if (diff < 0) return "overdue";
  if (diff <= 3) return "due-soon";
  return "pending";
}

// For the timetable: open (not-completed-by-me) homework for one
// exact subject string (must match the timetable's subject label,
// e.g. "Math", "Eng", "Chem" — see timetable-data.js's allSubjects()).
export function getHomeworkForSubject(subject) {
  return assignmentsCache
    .filter((a) => a.subject === subject && !isCompletedByMe(a.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// For the dashboard: the next N items due soon or overdue, not yet
// completed by this student, soonest first.
export function getUpcomingForMe(limit = 3) {
  return assignmentsCache
    .filter((a) => !isCompletedByMe(a.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

// ------------------------------------------------
// Live data
// ------------------------------------------------
function normalizePriority(p) {
  return (p === "high" || p === "important") ? "important" : "normal";
}

function priorityLabel(p) {
  return normalizePriority(p) === "important" ? "Important" : "Normal";
}

function sortHomework(items) {
  return items.sort((a, b) => {
    const pa = normalizePriority(a.priority);
    const pb = normalizePriority(b.priority);
    if (pa !== pb) return pa === "important" ? -1 : 1;
    const aHas = typeof a.order === "number";
    const bHas = typeof b.order === "number";
    if (aHas !== bHas) return aHas ? 1 : -1;
    if (aHas && bHas && a.order !== b.order) return a.order - b.order;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

function startAssignmentsListener() {
  const q = query(collection(db, "assignments"), orderBy("dueDate", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      assignmentsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      sortHomework(assignmentsCache);
      renderList();
      notify();
    },
    (err) => {
      console.error("Failed to load assignments:", err);
      const list = $("homeworkList");
      if (list) list.innerHTML = `<p class="task-empty">Couldn't load homework right now.</p>`;
    }
  );
}

let statusUnsub = null;
function startStatusListener(uid) {
  if (statusUnsub) {
    statusUnsub();
    statusUnsub = null;
  }
  if (!uid) {
    statusByAssignmentId = new Map();
    renderList();
    notify();
    return;
  }
  const q = query(collection(db, "assignmentStatus"), where("uid", "==", uid));
  statusUnsub = onSnapshot(
    q,
    (snap) => {
      const map = new Map();
      snap.forEach((d) => {
        const data = d.data();
        map.set(data.assignmentId, data.status);
      });
      statusByAssignmentId = map;
      renderList();
      notify();
    },
    (err) => console.error("Failed to load homework status:", err)
  );
}

// ------------------------------------------------
// Monitor CRUD
// ------------------------------------------------
let isCurrentMonitor = false;
let editingId = null;
let activeFilter = "all";

function statusDocId(uid, assignmentId) {
  return `${uid}_${assignmentId}`;
}

async function toggleComplete(uid, assignment) {
  const nowCompleted = isCompletedByMe(assignment.id);
  try {
    await setDoc(doc(db, "assignmentStatus", statusDocId(uid, assignment.id)), {
      uid,
      assignmentId: assignment.id,
      status: nowCompleted ? "pending" : "completed",
      updatedAt: serverTimestamp(),
    });
    nowCompleted ? playToggleOff() : playToggleOn();
  } catch (err) {
    console.error("Failed to update homework status:", err);
    playError();
  }
}

async function handleDelete(id) {
  if (!confirm("Delete this homework item?")) return;
  const item = assignmentsCache.find((a) => a.id === id);
  try {
    await deleteDoc(doc(db, "assignments", id));
    playDelete();
    await logAction("deleted", {
      resourceType: "assignment",
      resourceId: id,
      summary: `Deleted homework: ${item ? item.title : id}`,
    });
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

function populateSubjectOptions() {
  const select = document.querySelector('#homeworkForm select[name="subject"]');
  if (!select || select.dataset.populated) return;
  select.innerHTML = allSubjects()
    .map((s) => `<option value="${s}">${s}</option>`)
    .join("");
  select.dataset.populated = "true";
}

function openForm(assignment) {
  const form = $("homeworkForm");
  if (!form) return;
  populateSubjectOptions();
  editingId = assignment ? assignment.id : null;
  form.subject.value = (assignment && assignment.subject) || form.subject.options[0]?.value || "";
  form.title.value = (assignment && assignment.title) || "";
  form.description.value = (assignment && assignment.description) || "";
  form.dueDate.value = (assignment && assignment.dueDate) || todayStr();
  form.priority.value = normalizePriority((assignment && assignment.priority) || "normal");
  const linkStack = $("homeworkLinksStack");
  setLinkStack(linkStack, assignment);
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = assignment ? "Save changes" : "Add homework";
  playOpen();
  form.querySelector('select[name="subject"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("homeworkForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setFormError(null);
  const linkStack = $("homeworkLinksStack");
  if (linkStack) linkStack.innerHTML = "";
  if (!silent) playClose();
}

function setFormError(message) {
  const el = $("homeworkFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const links = readLinkStack($("homeworkLinksStack"));
  const payload = {
    subject: form.subject.value.trim(),
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    dueDate: form.dueDate.value,
    priority: form.priority.value,
    links,
    // Legacy single-link field, kept only so a page still on an old
    // cached script.js reads *something* sane; new code always reads
    // `links`.
    link: links[0] ? links[0].url : "",
  };
  if (!payload.subject || !payload.title || !payload.dueDate) return;

  setFormError(null);
  const submitBtn = form.querySelector('button[type="submit"]');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, "assignments", editingId), payload);
      await logAction("updated", {
        resourceType: "assignment",
        resourceId: editingId,
        summary: `Updated homework: ${payload.title}`,
      });
    } else {
      const ref = await addDoc(collection(db, "assignments"), {
        ...payload,
        assignedDate: todayStr(),
        createdAt: serverTimestamp(),
      });
      await logAction("created", {
        resourceType: "assignment",
        resourceId: ref.id,
        summary: `Added homework: ${payload.title}`,
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

// ------------------------------------------------
// Rendering
// ------------------------------------------------
function priorityLabel(p) {
  return p === "high" ? "High priority" : p === "low" ? "Low priority" : "Medium priority";
}

function dueLabel(assignment) {
  const diff = daysBetween(assignment.dueDate);
  if (diff < 0) return `Overdue · ${Math.abs(diff)}d`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 3) return `Due in ${diff}d`;
  return assignment.dueDate;
}

function matchesFilter(assignment) {
  const bucket = dueBucket(assignment);
  if (activeFilter === "all") return true;
  if (activeFilter === "completed") return bucket === "completed";
  if (activeFilter === "pending") return bucket !== "completed";
  if (activeFilter === "due-soon") return bucket === "due-soon";
  if (activeFilter === "overdue") return bucket === "overdue";
  return true;
}

function buildHomeworkRow(a) {
  const bucket = dueBucket(a);
  const row = document.createElement("div");
  row.className = "task-row hw-row";
  row.dataset.id = a.id;
  row.innerHTML = `
    <span class="task-tag homework hw-priority-${escapeHtml(normalizePriority(a.priority))}">${escapeHtml(a.subject)}</span>
    <div class="task-body">
      <p class="task-subject">${escapeHtml(a.title)}</p>
      <p class="task-detail">${escapeHtml(a.description || "")}</p>
      <span class="hw-meta-pill">${priorityLabel(a.priority)}</span>
      ${linkChipsHtml(a)}
    </div>
    <span class="task-due hw-due-${bucket}">${dueLabel(a)}</span>
    <div class="hw-actions">
      <button class="hw-complete-btn ${bucket === "completed" ? "is-done" : ""}" data-action="toggle" data-id="${escapeHtml(a.id)}" ${currentUid ? "" : "disabled"} title="${currentUid ? "" : "Sign in to track your own homework"}">
        ${bucket === "completed" ? "✓ Done" : "Mark done"}
      </button>
      <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
        <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(a.id)}" aria-label="Edit homework">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(a.id)}" aria-label="Delete homework">✕</button>
      </div>
    </div>
  `;
  return row;
}

function wireHomeworkRow(row) {
  row.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const assignment = assignmentsCache.find((a) => a.id === btn.dataset.id);
      if (assignment) toggleComplete(currentUid, assignment);
    });
  });
  row.querySelectorAll('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener("click", () => handleDelete(btn.dataset.id))
  );
  row.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const assignment = assignmentsCache.find((a) => a.id === btn.dataset.id);
      if (assignment) openForm(assignment);
    });
  });
}

function renderList() {
  const list = $("homeworkList");
  if (!list) return;

  const wasArranging = !!(arranger && arranger.isActive());
  const preservedOrder = wasArranging
    ? Array.from(list.querySelectorAll(":scope > [data-id]")).map((r) => r.dataset.id)
    : null;

  const visible = assignmentsCache.filter(matchesFilter);

  if (visible.length === 0) {
    list.innerHTML = `<p class="task-empty">Nothing here${activeFilter === "all" ? " yet." : " for this filter."}</p>`;
    updateArrangeBtn();
    return;
  }

  list.innerHTML = "";

  let finalOrder;
  if (wasArranging) {
    const preserved = new Set(preservedOrder);
    const newItems = visible.filter((a) => !preserved.has(a.id));
    const carried = preservedOrder
      .map((id) => visible.find((a) => a.id === id))
      .filter(Boolean);
    finalOrder = [...newItems, ...carried];
  } else {
    finalOrder = visible;
  }

  finalOrder.forEach((a) => {
    const row = buildHomeworkRow(a);
    wireHomeworkRow(row);
    list.appendChild(row);
  });

  if (wasArranging) arranger.reattach();
  updateArrangeBtn();
}

function applyMonitorVisibility() {
  document.querySelectorAll("#homeworkList .monitor-only, #homeworkPanel .monitor-only").forEach((el) => {
    el.hidden = !isCurrentMonitor;
  });
}

let currentUid = null;

function renderListLoading() {
  const list = $("homeworkList");
  if (!list) return;
  list.innerHTML = `
    <div class="task-loading">
      <span class="task-loading-dot"></span>
      <span class="task-loading-dot"></span>
      <span class="task-loading-dot"></span>
      <span class="task-loading-label">Loading homework…</span>
    </div>`;
}

let arranger = null;

function updateArrangeBtn() {
  const btn = $("arrangeHomeworkBtn");
  if (!btn) return;
  const enough = assignmentsCache.length > 1;
  btn.hidden = !isCurrentMonitor || !enough;
  if (!enough && arranger && arranger.isActive()) arranger.forceExit();
}

async function saveHomeworkOrder(orderedIds) {
  const items = orderedIds.map((id) => assignmentsCache.find((a) => a.id === id)).filter(Boolean);
  if (!items.length) return;

  let demoteFrom = items.length;
  for (let i = 0; i < items.length; i++) {
    if (normalizePriority(items[i].priority) === "normal") { demoteFrom = i; break; }
  }

  const batch = writeBatch(db);
  let wrote = 0;
  items.forEach((item, i) => {
    const priority = i >= demoteFrom ? "normal" : "important";
    const patch = {};
    if (item.order !== i) patch.order = i;
    if (normalizePriority(item.priority) !== priority) patch.priority = priority;
    if (Object.keys(patch).length === 0) return;
    batch.update(doc(db, "assignments", item.id), patch);
    wrote++;
  });
  if (wrote === 0) return;
  await batch.commit();
  await logAction("reordered", {
    resourceType: "assignment",
    summary: `Reordered homework (${items.length} items)`,
  }).catch(() => {});
}

function initArranger() {
  if (!$("arrangeHomeworkBtn")) return;
  arranger = createArranger({
    listId: "homeworkList",
    pencilBtnId: "arrangeHomeworkBtn",
    statusId: "homeworkOrderStatus",
    onSave: saveHomeworkOrder,
    onEnter: () => {
      activeFilter = "all";
      document.querySelectorAll("#homeworkFilters .pill").forEach((p) => {
        p.classList.toggle("active", p.dataset.filter === "all");
      });
      renderList();
    },
    onExit: () => renderList(),
    disableSelectors: ["#homeworkFilters .pill"],
  });
}

export function initAssignments() {
  const hasHomeworkPanel = !!$("homeworkList");
  const needsLiveData = hasHomeworkPanel || !!document.querySelector(".tt-grid");
  if (!needsLiveData) return; // page needs neither the panel nor timetable homework badges

  if (hasHomeworkPanel) renderListLoading();

  startAssignmentsListener();

  subscribeAuth(({ user, monitor }) => {
    currentUid = user ? user.uid : null;
    isCurrentMonitor = monitor;
    startStatusListener(currentUid);
    applyMonitorVisibility();
    renderList(); // no-op if #homeworkList isn't on this page
    updateArrangeBtn();
  });

  if (!hasHomeworkPanel) return; // timetable page only needs the data, not the panel below

  const addBtn = $("addHomeworkBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));
  initArranger();
  updateArrangeBtn();

  const form = $("homeworkForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }

  document.querySelectorAll('#homeworkFilters [data-filter]').forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll("#homeworkFilters .pill").forEach((p) => p.classList.toggle("active", p === btn));
      renderList();
    });
  });
}
