// ============================================
// 8CM — Monitor management (monitor-only, add-by-Gmail)
// ------------------------------------------------
// Reads and writes monitorInvites/{email} via auth.js. The list view
// merges three sources so it shows WHO each monitor actually is:
//   · MONITOR_EMAILS (bootstrap, from source)
//   · monitorInvites/{email} (added in this panel)
//   · settings/monitors.uids → users/{uid} (people who've signed in
//     at least once — this is where we get their student name + avatar)
//
// "Signed in" for an invited email is worked out from users/ itself
// (monitors can read every profile), not only from the settings/monitors
// marker. That marker is written by the invitee's own browser on their
// next page load and is easy to miss, which used to leave someone who
// had already signed in stuck on "Not yet signed in" with no Monitor
// badge. Any invitee found this way is also written back into the
// marker here, so their badge shows up for everyone.
// ============================================
import {
  subscribeAuth, inviteMonitor, revokeMonitorInvite, listMonitorInvites,
  MONITOR_EMAILS,
} from "./auth.js";
import { logAction } from "./audit.js";
import { playSuccess, playError, playDelete } from "./sound.js";
import { avatarMarkup, getAvatarForUid, loadAvatars } from "./avatars.js";

const $ = (id) => document.getElementById(id);
let isCurrentMonitor = false;
let currentUser = null;
let monitorItems = null; // null = not loaded yet, [] = loaded empty

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

// ------------------------------------------------
// Build the merged list
// ------------------------------------------------
async function buildMonitorList() {
  const items = [];
  const byEmail = new Map();

  const add = (item) => {
    const email = (item.email || "").toLowerCase();
    if (email && byEmail.has(email)) {
      const merged = Object.assign(byEmail.get(email), item);
      return merged;
    }
    const merged = { ...item, email };
    items.push(merged);
    if (email) byEmail.set(email, merged);
    return merged;
  };

  // 1. Built-in bootstrap emails (from auth.js source)
  MONITOR_EMAILS.forEach((email) => add({ email, builtIn: true }));

  // 2. Email invites (people who may not have signed in yet)
  let invitesLoaded = true;
  try {
    const invites = await listMonitorInvites();
    invites.forEach((i) =>
      add({ email: i.email, invitedByEmail: i.invitedByEmail, inviteId: i.id })
    );
  } catch (err) {
    console.error("[8CM] Failed to load monitor invites:", err);
    invitesLoaded = false;
  }

  // 3. Signed-in monitors (from settings/monitors.uids → users/{uid})
  //    This is what gives us each monitor's student name and — via the
  //    avatar module — their pfp.
  try {
    const { db } = await import("./firebase-config.js");
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const snap = await getDoc(doc(db, "settings", "monitors"));
    if (snap.exists()) {
      const uids = Object.keys(snap.data().uids || {});
      for (const uid of uids) {
        try {
          const userSnap = await getDoc(doc(db, "users", uid));
          const data = userSnap.exists() ? userSnap.data() : {};
          add({
            uid,
            email: data.email || "",
            studentName: data.claimedStudentName || null,
          });
        } catch (err) {
          console.error("[8CM] Failed to load monitor user doc", uid, err);
        }
      }
    }
  } catch (err) {
    console.error("[8CM] Failed to load monitor uid list:", err);
  }

  // 4. Invited emails still showing no uid: look for a matching profile
  //    directly. Covers people who signed in but never got their uid
  //    recorded in settings/monitors above.
  const foundUids = [];
  const pending = items.filter((m) => !m.uid && !m.builtIn && m.email);
  if (pending.length) {
    try {
      const { db } = await import("./firebase-config.js");
      const { collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const usersSnap = await getDocs(collection(db, "users"));
      const byEmail2 = new Map();
      usersSnap.forEach((d) => {
        const data = d.data() || {};
        const email = String(data.email || "").trim().toLowerCase();
        if (email) byEmail2.set(email, { uid: d.id, data });
      });
      pending.forEach((m) => {
        const hit = byEmail2.get(m.email);
        if (!hit) return;
        m.uid = hit.uid;
        m.studentName = m.studentName || hit.data.claimedStudentName || null;
        foundUids.push(hit.uid);
      });
    } catch (err) {
      console.error("[8CM] Failed to look up invited monitors' profiles:", err);
    }
  }

  return { items, invitesLoaded, foundUids };
}

// Writes any uids found by buildMonitorList's profile lookup into
// settings/monitors.uids (the marker the Monitor badge and every other
// page read). Best-effort: the list itself is already correct without it.
async function recordMonitorUids(uids) {
  if (!uids.length) return;
  try {
    const { db } = await import("./firebase-config.js");
    const { doc, setDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const marker = {};
    uids.forEach((uid) => { marker[uid] = true; });
    await setDoc(doc(db, "settings", "monitors"), { uids: marker }, { merge: true });
  } catch (err) {
    console.error("[8CM] Couldn't record monitor uids:", err);
  }
}

async function refresh() {
  await loadAvatars().catch(() => {});
  const { items, invitesLoaded, foundUids } = await buildMonitorList();
  monitorItems = items;
  render(invitesLoaded);
  recordMonitorUids(foundUids);
}

// ------------------------------------------------
// Render
// ------------------------------------------------
function render(invitesLoaded = true) {
  const list = $("monitorManageList");
  if (!list) return;

  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage monitors.</p>`;
    return;
  }
  if (monitorItems === null) {
    list.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading monitors…</span></div>`;
    return;
  }
  if (monitorItems.length === 0) {
    list.innerHTML = `<p class="task-empty">No monitors found.</p>`;
    return;
  }

  const warn = !invitesLoaded
    ? `<p class="task-empty" style="border-bottom:1px solid var(--border-soft)">Couldn't read invites — check that <code>firestore.rules</code> has been deployed. Signed-in monitors are still listed below.</p>`
    : "";

  list.innerHTML = warn + monitorItems
    .map((m) => {
      const avatarId = m.uid ? getAvatarForUid(m.uid) : null;
      const avatarHtml = avatarMarkup(
        avatarId,
        m.studentName || m.email || "?",
        44
      );

      const primary = m.studentName || m.email || "(unknown)";
      const secondaryParts = [];
      if (m.studentName && m.email) secondaryParts.push(m.email);
      if (m.builtIn) secondaryParts.push("Built-in");
      if (m.invitedByEmail) secondaryParts.push(`Added by ${m.invitedByEmail}`);
      if (!m.builtIn) secondaryParts.push(m.uid ? "Signed in" : "Not yet signed in");

      return `
        <div class="manage-row monitor-row">
          <div class="manage-thumb manage-thumb-avatar">${avatarHtml}</div>
          <div class="manage-row-body">
            <p class="task-subject">${escapeHtml(primary)}${
              m.builtIn ? ' <span class="inactive-tag">built-in</span>' : ""
            }</p>
            <p class="task-detail">${escapeHtml(secondaryParts.join(" · "))}</p>
          </div>
          <div class="task-monitor-actions">
            ${
              !m.builtIn && m.inviteId
                ? `<button class="task-icon-btn task-icon-btn-danger" data-action="revoke" data-email="${escapeHtml(
                    m.email
                  )}" aria-label="Revoke monitor access">✕</button>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");

  list.querySelectorAll('[data-action="revoke"]').forEach((btn) => {
    btn.addEventListener("click", () => handleRevoke(btn.dataset.email));
  });
}

// ------------------------------------------------
// Add / revoke
// ------------------------------------------------
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
    }).catch(() => {});
    playSuccess();
    form.reset();
    await refresh();
  } catch (err) {
    console.error("[8CM] Add monitor failed:", err);
    playError();
    const code = err && err.code;
    if (code === "monitor-invite/invalid-email") {
      setFormError(err.message);
    } else if (code === "permission-denied") {
      setFormError(
        "Firestore rejected the write. Either firestore.rules hasn't been deployed to this project yet, or this account isn't recognized as a monitor server-side (rules check the email allowlist + monitors/{uid} + users/{uid}.monitor + monitorInvites/{email} — not the client-side check). Redeploy the rules and try again."
      );
    } else {
      setFormError(
        `Couldn't add that monitor (${code || "unknown error"}). Try again.`
      );
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
}

async function handleRevoke(email) {
  if (!confirm(`Remove ${email} as a monitor? They'll lose access immediately.`)) return;
  try {
    await revokeMonitorInvite(email);
    // If they had already signed in, also drop their Monitor badge marker.
    const revoked = (monitorItems || []).find((m) => m.email === email);
    if (revoked && revoked.uid && !revoked.builtIn) {
      try {
        const { db } = await import("./firebase-config.js");
        const { doc, updateDoc, deleteField } = await import(
          "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
        );
        await updateDoc(doc(db, "settings", "monitors"), { [`uids.${revoked.uid}`]: deleteField() });
      } catch (err) {
        console.error("[8CM] Couldn't clear monitor badge marker:", err);
      }
    }
    await logAction("deleted", {
      resourceType: "monitor",
      resourceId: email,
      summary: `Removed ${email} as a monitor`,
    }).catch(() => {});
    playDelete();
    await refresh();
  } catch (err) {
    console.error("[8CM] Revoke monitor failed:", err);
    playError();
    alert(
      err && err.code === "permission-denied"
        ? "Firestore rejected the delete — check that firestore.rules is deployed."
        : "Couldn't remove that monitor. Try again."
    );
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
