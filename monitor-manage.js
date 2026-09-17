// ============================================
// 8CM — Monitor management (monitor-only UI)
// ============================================
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth, MONITOR_EMAILS } from "./auth.js";
import { logAction } from "./audit.js";
import { playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);

const GMAIL_RE = /^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i;

const escapeHtml = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

let isCurrentMonitor = false;
let invitesCache = null;
let unsub = null;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function setFormError(message) {
  const el = $("monitorFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = normalizeEmail(form.email.value);

  if (!GMAIL_RE.test(email)) {
    playError();
    setFormError("Only Gmail addresses can be added as monitors (name@gmail.com).");
    return;
  }

  if (invitesCache && invitesCache.some((i) => i.id === email)) {
    playError();
    setFormError("That address is already an invited monitor.");
    return;
  }

  setFormError(null);
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Adding…";

  try {
    await setDoc(doc(db, "monitorInvites", email), {
      email,
      addedAt: serverTimestamp(),
    });
    await logAction("created", {
      resourceType: "monitor",
      resourceId: email,
      summary: `Added monitor: ${email}`,
    });
    playSuccess();
    form.reset();
  } catch (err) {
    console.error("Add monitor failed:", err);
    playError();
    setFormError("Couldn't add that monitor — check your access and try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function handleRemove(email) {
  if (!confirm(`Remove ${email} as a monitor? They'll lose monitor access on their next request.`)) return;
  try {
    await deleteDoc(doc(db, "monitorInvites", email));
    await logAction("deleted", {
      resourceType: "monitor",
      resourceId: email,
      summary: `Removed monitor: ${email}`,
    });
    playDelete();
  } catch (err) {
    console.error("Remove monitor failed:", err);
    playError();
    alert("Couldn't remove that monitor — check your access and try again.");
  }
}

function render() {
  const list = $("monitorList");
  if (!list) return;

  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage monitors.</p>`;
    return;
  }

  const allowlist = MONITOR_EMAILS.map((e) => normalizeEmail(e));
  const invites = (invitesCache || []).filter(
    (inv) => !allowlist.includes(normalizeEmail(inv.email || inv.id))
  );

  const rows = [];

  allowlist.forEach((email) => {
    rows.push(`
      <div class="manage-row">
        <div class="manage-row-body">
          <p class="task-subject">${escapeHtml(email)} <span class="inactive-tag">built-in</span></p>
          <p class="task-detail">Hardcoded in firestore.rules — cannot be removed here.</p>
        </div>
      </div>
    `);
  });

  invites.forEach((inv) => {
    rows.push(`
      <div class="manage-row">
        <div class="manage-row-body">
          <p class="task-subject">${escapeHtml(inv.email || inv.id)}</p>
          <p class="task-detail">Invited monitor · active after sign-in with this address</p>
        </div>
        <div class="task-monitor-actions">
          <button class="task-icon-btn task-icon-btn-danger" data-action="remove" data-email="${escapeHtml(inv.id)}" aria-label="Remove monitor">✕</button>
        </div>
      </div>
    `);
  });

  list.innerHTML = rows.length
    ? rows.join("")
    : `<p class="task-empty">No additional monitors yet.</p>`;

  list.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener("click", () => handleRemove(btn.dataset.email));
  });
}

function startListener() {
  if (unsub) return;

  unsub = onSnapshot(
    collection(db, "monitorInvites"),
    (snap) => {
      invitesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error("Failed to load monitor invites:", err);
      invitesCache = [];
      render();
    }
  );
}

export function initMonitorManagement() {
  const list = $("monitorList");
  const form = $("monitorForm");
  if (!list && !form) return;

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    if (monitor) startListener();
    render();
  });

  if (form) form.addEventListener("submit", handleSubmit);
}
