// ============================================
// 8CM — Events
// ------------------------------------------------
// Deliberately lightweight: title, date, time, location, description,
// category. No RSVPs, no ticketing, no attendance — see spec section
// 13/33. Monitor-managed, public-read.
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
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete } from "./sound.js";
import { setLinkStack, readLinkStack, linkChipsHtml } from "./item-links.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

let cache = [];
const listeners = new Set();
function notify() {
  listeners.forEach((cb) => cb(upcomingEvents()));
}

export function onEvents(callback) {
  listeners.add(callback);
  callback(upcomingEvents());
  return () => listeners.delete(callback);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function upcomingEvents() {
  const today = todayStr();
  return cache.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
}

export function nextEvent() {
  return upcomingEvents()[0] || null;
}

export function daysUntil(dateStr) {
  const [y1, m1, d1] = todayStr().split("-").map(Number);
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

let isCurrentMonitor = false;
let editingId = null;

function startListener() {
  const q = query(collection(db, "events"), orderBy("date", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
      notify();
    },
    (err) => {
      console.error("Failed to load events:", err);
      const list = $("eventList");
      if (list) list.innerHTML = `<p class="empty-body">Couldn't load events right now.</p>`;
    }
  );
}

async function handleDelete(id) {
  if (!confirm("Delete this event?")) return;
  const ev = cache.find((x) => x.id === id);
  try {
    await deleteDoc(doc(db, "events", id));
    playDelete();
    await logAction("deleted", {
      resourceType: "event",
      resourceId: id,
      summary: `Deleted event: ${ev ? ev.title : id}`,
    });
  } catch (err) {
    console.error("Delete failed:", err);
    playError();
    alert("Couldn't delete that — check your monitor access and try again.");
  }
}

function openForm(ev) {
  const form = $("eventForm");
  if (!form) return;
  editingId = ev ? ev.id : null;
  form.title.value = (ev && ev.title) || "";
  form.date.value = (ev && ev.date) || todayStr();
  form.time.value = (ev && ev.time) || "";
  form.location.value = (ev && ev.location) || "";
  form.category.value = (ev && ev.category) || "General";
  form.description.value = (ev && ev.description) || "";
  setLinkStack($("eventLinksStack"), ev);
  setFormError(null);
  form.hidden = false;
  form.querySelector('button[type="submit"]').textContent = ev ? "Save changes" : "Add event";
  playOpen();
  form.querySelector('input[name="title"]').focus();
}

function closeForm({ silent = false } = {}) {
  const form = $("eventForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  editingId = null;
  setFormError(null);
  const linkStack = $("eventLinksStack");
  if (linkStack) linkStack.innerHTML = "";
  if (!silent) playClose();
}

function setFormError(message) {
  const el = $("eventFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    title: form.title.value.trim(),
    date: form.date.value,
    time: form.time.value.trim(),
    location: form.location.value.trim(),
    category: form.category.value,
    description: form.description.value.trim(),
    links: readLinkStack($("eventLinksStack")),
  };
  if (!payload.title || !payload.date) return;

  setFormError(null);
  const submitBtn = form.querySelector('button[type="submit"]');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  try {
    if (editingId) {
      await updateDoc(doc(db, "events", editingId), payload);
      await logAction("updated", {
        resourceType: "event",
        resourceId: editingId,
        summary: `Updated event: ${payload.title}`,
      });
    } else {
      const ref = await addDoc(collection(db, "events"), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      await logAction("created", {
        resourceType: "event",
        resourceId: ref.id,
        summary: `Added event: ${payload.title}`,
      });
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

function countdownLabel(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  return "";
}

function render() {
  const list = $("eventList");
  const empty = $("eventsEmptyState");
  const banner = $("nextEventBanner");
  if (!list) return;

  const upcoming = upcomingEvents();

  if (banner) {
    const next = upcoming[0];
    if (next) {
      banner.hidden = false;
      banner.innerHTML = `
        <span class="next-event-countdown">${countdownLabel(next.date)}</span>
        <span class="next-event-title">${escapeHtml(next.title)}</span>
        <span class="next-event-meta">${escapeHtml(next.date)}${next.time ? " · " + escapeHtml(next.time) : ""}${next.location ? " · " + escapeHtml(next.location) : ""}</span>
      `;
    } else {
      banner.hidden = true;
    }
  }

  if (upcoming.length === 0) {
    list.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  list.innerHTML = "";
  upcoming.forEach((ev) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.innerHTML = `
      <div class="event-card-date">
        <span class="event-countdown">${countdownLabel(ev.date)}</span>
        <span class="event-date-full">${ev.date}</span>
      </div>
      <div class="event-card-body">
        <span class="task-tag announcement">${escapeHtml(ev.category || "General")}</span>
        <h3>${escapeHtml(ev.title)}</h3>
        <p class="event-meta">${[ev.time, ev.location].filter(Boolean).map(escapeHtml).join(" · ")}</p>
        ${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ""}
        ${linkChipsHtml(ev)}
      </div>
      <div class="task-monitor-actions monitor-only" ${isCurrentMonitor ? "" : "hidden"}>
        <button class="task-icon-btn" data-action="edit" data-id="${escapeHtml(ev.id)}" aria-label="Edit event">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeHtml(ev.id)}" aria-label="Delete event">✕</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener("click", () => handleDelete(btn.dataset.id)));
  list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const ev = cache.find((x) => x.id === btn.dataset.id);
      if (ev) openForm(ev);
    });
  });
}

function applyMonitorVisibility() {
  document.querySelectorAll(
    "#eventList .monitor-only, .events-page .monitor-only, .manage-panel[data-panel='events'] .monitor-only"
  ).forEach((el) => {
    el.hidden = !isCurrentMonitor;
  });
}

export function initEvents() {
  const hasEventsPanel = !!$("eventList");
  const needsLiveData = hasEventsPanel || !!$("myDayCard");
  if (!needsLiveData) return;

  const evList = $("eventList");
  if (evList) {
    evList.innerHTML = `
      <div class="task-loading">
        <span class="task-loading-dot"></span>
        <span class="task-loading-dot"></span>
        <span class="task-loading-dot"></span>
        <span class="task-loading-label">Loading events…</span>
      </div>`;
  }

  startListener();

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    applyMonitorVisibility();
    render(); // no-op if #eventList isn't on this page
  });

  if (!hasEventsPanel) return; // dashboard-only page: data only, no panel to wire

  const addBtn = $("addEventBtn");
  if (addBtn) addBtn.addEventListener("click", () => openForm(null));

  const form = $("eventForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeForm());
  }
}
