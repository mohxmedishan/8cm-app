// ============================================
// 8CM — Monitor panel shell
// ============================================
import { subscribeAuth } from "./auth.js";
import { subscribeAuditLog, formatAuditEntry } from "./audit.js";
import { playClick } from "./sound.js";

const $ = (id) => document.getElementById(id);
let auditUnsub = null;
let auditStarted = false;

const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

function initTabs() {
  const tabs = $("manageTabs");
  if (!tabs) return;
  const panels = document.querySelectorAll(".manage-panel");
  tabs.querySelectorAll(".manage-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.querySelectorAll(".manage-tab").forEach((t) => t.classList.toggle("active", t === tab));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
      playClick();
      if (target === "audit" && !auditStarted) {
        auditStarted = true;
        startAudit();
      }
    })
  );
}

function startAudit() {
  const list = $("auditLogList");
  if (!list) return;
  list.innerHTML = `<p class="task-empty">Loading…</p>`;
  if (auditUnsub) auditUnsub();
  auditUnsub = subscribeAuditLog((entries) => {
    if (entries === null) {
      list.innerHTML = `<p class="task-empty">Couldn't load the audit log.</p>`;
      return;
    }
    if (!entries.length) {
      list.innerHTML = `<p class="task-empty">No monitor activity recorded yet.</p>`;
      return;
    }
    list.innerHTML = "";
    entries.forEach((entry) => {
      const f = formatAuditEntry(entry);
      const row = document.createElement("div");
      row.className = "audit-row";
      row.innerHTML = `<span class="audit-when">${escapeHtml(f.when)}</span><div class="audit-body"><p class="audit-what">${escapeHtml(f.what)}</p><p class="audit-who">${escapeHtml(f.who)}</p></div>`;
      list.appendChild(row);
    });
  });
}

function renderGate({ user, monitor }) {
  const gate = $("manageLocked");
  const content = $("manageContent");
  if (!gate || !content) return;

  if (!user) {
    gate.hidden = false;
    content.hidden = true;
    gate.innerHTML = `<p>Sign in to access the monitor panel.</p>`;
    return;
  }
  if (!monitor) {
    gate.hidden = false;
    content.hidden = true;
    // This is a UI-only read, driven by the same computeIsMonitor()
    // check that Firestore's own rules enforce for every write (see
    // isMonitor() in firestore.rules) — so if this gate is wrong,
    // writes will be wrong too, and vice versa. If someone lands here
    // who believes they should be a monitor, the account shown below
    // needs one of: its email in MONITOR_EMAILS (auth.js) AND the
    // matching isMonitorEmail() list in firestore.rules, a doc at
    // monitors/{their uid}, or monitor: true on users/{their uid} —
    // and that change needs to exist in the *live* Firestore project,
    // not just this repo.
    gate.innerHTML = `<p>This page is for monitors only. You're signed in as ${escapeHtml(user.email || "an account")} (uid: ${escapeHtml(user.uid)}), which isn't currently recognized as a monitor.</p>`;
    return;
  }
  gate.hidden = true;
  content.hidden = false;
}

export function initManagePage() {
  if (!$("manageTabs")) return;
  initTabs();
  subscribeAuth(renderGate);
}
