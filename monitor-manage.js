// ============================================
// 8CM — Monitor management (monitor-only, add-by-Gmail)
// ------------------------------------------------
// Firestore: monitorInvites/{email} — see auth.js (inviteMonitor,
// revokeMonitorInvite, listMonitorInvites) for the read/write logic,
// and firestore.rules for the actual server-side enforcement, which
// is the real authority here, not this file.
// ============================================
import { subscribeAuth, inviteMonitor, revokeMonitorInvite, listMonitorInvites, MONITOR_EMAILS } from "./auth.js";
import { logAction } from "./audit.js";
import { playSuccess, playError, playDelete } from "./sound.js";

const $ = (id) => document.getElementById(id);
let isCurrentMonitor = false;
let currentUser = null;
let invites = [];

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function setFormError(message) {
  const el = $("monitorFormError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

async function refresh() {
  invites = await listMonitorInvites().catch((err) => {
    console.error("Failed to load monitor invites:", err);
    return null;
  });
  render();
}

function render() {
  const list = $("monitorManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage monitors.</p>`;
    return;
  }
  if (invites === null) {
    list.innerHTML = `<p class="task-empty">Couldn't load the monitor list right now.</p>`;
    return;
  }

  const builtInRows = MONITOR_EMAILS.map(
    (email) => `
      <div class="manage-row">
        <div class="manage-row-body">
          <p class="task-subject">${escapeHtml(email)} <span class="inactive-tag">built-in</span></p>
          <p class="task-detail">Always a monitor — set in the project's source, not removable here.</p>
        </div>
      </div>`
  ).join("");

  const inviteRows = invites.length
    ? invites
        .map(
          (i) => `
      <div class="manage-row">
        <div class="manage-row-body">
          <p class="task-subject">${escapeHtml(i.email)}</p>
          <p class="task-detail">${i.invitedByEmail ? `Added by ${escapeHtml(i.invitedByEmail)}` : "Added by a monitor"}</p>
        </div>
        <div class="task-monitor-actions">
          <button class="task-icon-btn task-icon-btn-danger" data-action="revoke" data-email="${escapeHtml(i.email)}" aria-label="Revoke monitor access">✕</button>
        </div>
      </div>`
        )
        .join("")
    : `<p class="task-empty">No additional monitors added yet.</p>`;

  list.innerHTML = builtInRows + inviteRows;

  list.querySelectorAll('[data-action="revoke"]').forEach((btn) => {
    btn.addEventListener("click", () => handleRevoke(btn.dataset.email));
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const rawEmail = form.email.value;
  setFormError(null);

  const submitBtn = form.querySelector('button[type="submit"]');
  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Adding…";

  try {
    const email = await inviteMonitor(rawEmail, currentUser);
    await logAction("created", {
      resourceType: "monitor",
      resourceId: email,
      summary: `Added ${email} as a monitor`,
    });
    playSuccess();
    form.reset();
    await refresh();
  } catch (err) {
    console.error("Add monitor failed:", err);
    playError();
    setFormError(
      err && err.code === "monitor-invite/invalid-email"
        ? err.message
        : "Couldn't add that monitor — check the address and your monitor access, then try again."
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

async function handleRevoke(email) {
  if (!confirm(`Remove ${email} as a monitor? They'll lose monitor access immediately.`)) return;
  try {
    await revokeMonitorInvite(email);
    await logAction("deleted", {
      resourceType: "monitor",
      resourceId: email,
      summary: `Removed ${email} as a monitor`,
    });
    playDelete();
    await refresh();
  } catch (err) {
    console.error("Revoke monitor failed:", err);
    playError();
    alert("Couldn't remove that monitor — check your monitor access and try again.");
  }
}

export function initMonitorManagement() {
  if (!$("monitorManageList")) return;

  subscribeAuth(({ user, monitor }) => {
    currentUser = user;
    isCurrentMonitor = monitor;
    if (monitor) refresh();
    else render();
  });

  const form = $("monitorForm");
  if (form) form.addEventListener("submit", handleSubmit);
}
