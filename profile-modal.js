// ============================================
// 8CM — View profile modal (V12)
// ------------------------------------------------
// One modal handles own and read-only student profiles.
// Own profile: Change avatar, Switch student, Sign out.
// ============================================
import { subscribeAuth, signOutUser } from "./auth.js";
import { onStudents } from "./students.js";
import { onAchievements } from "./achievements.js";
import { AVATARS, avatarUrl, avatarMarkup, setAvatarForUid, onAvatars, getAvatarForUid, loadAvatars, getCurrentUid } from "./avatars.js";
import { playOpen, playClose, playSuccess, playError, playClick } from "./sound.js";

const $ = (id) => document.getElementById(id);
let currentAuth = { user: null, profile: null, monitor: false };
let achievements = [];
let liveStudents = [];
let editingProfileStudentId = null;
let claimUids = new Map();
let monitorUids = new Set();

const houseLabel = (h) => h ? h.charAt(0).toUpperCase() + h.slice(1) : "";
const transportLabel = (t) => (t === "OT" ? "Own transport" : `Bus ${t || "—"}`);
const rollLabel = (n) => String(n ?? "").padStart(2, "0");
const escapeHtml = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

export function openProfile(studentId) {
  const overlay = $("profileOverlay");
  const body = $("profileBody");
  if (!overlay || !body) return;

  const student = liveStudents.find((s) => s.id === studentId);
  if (!student) return;

  editingProfileStudentId = studentId;
  body.innerHTML = renderProfileBody(student);
  wireProfileBody(student);
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

export function closeProfile() {
  const overlay = $("profileOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => { overlay.hidden = true; }, 200);
}

function renderProfileBody(student) {
  const isMe = currentAuth.profile?.claimedStudentId === student.id;
  const claimedUid = window.__cmClaimUids?.get(student.id) || claimUids.get(student.id) || null;
  const avatarUid = isMe ? getCurrentUid() : claimedUid;
  const avatarId = avatarUid ? getAvatarForUid(avatarUid) : null;
  const myAchievements = achievements.filter((a) => a.studentId === student.id);

  const pills = [
    student.guest ? `<span class="profile-stat-pill guest-pill">Guest</span>` : "",
    `<span class="profile-stat-pill house-${escapeHtml(student.house)}"><span class="house-dot ${escapeHtml(student.house)}"></span>${escapeHtml(houseLabel(student.house))}</span>`,
    student.language ? `<span class="profile-stat-pill">${escapeHtml(student.language)}</span>` : "",
    `<span class="profile-stat-pill">${escapeHtml(transportLabel(student.transport))}</span>`,
    student.islamic ? `<span class="profile-stat-pill">${student.islamic === "islamic" ? "Islamic Ed" : "Value Ed"}</span>` : "",
    student.creative ? `<span class="profile-stat-pill">${escapeHtml(student.creative.charAt(0).toUpperCase() + student.creative.slice(1))}</span>` : "",
  ].filter(Boolean).join("");

  const sharedMonitorSet = window.__cmMonitorUids || monitorUids;
  const isMonitorStudent =
    (isMe && currentAuth.monitor) ||
    (!!claimedUid && sharedMonitorSet.has(claimedUid));
  const badge = isMonitorStudent ? `<span class="monitor-badge">Monitor</span>` : "";

  const avatarEl = avatarMarkup(avatarId, student.name, 88, "cm-avatar-lg");
  const avatarButton = isMe
    ? `<button type="button" class="avatar-edit" id="avatarEditBtn" aria-label="Change avatar">${avatarEl}<span class="avatar-edit-overlay">Change</span></button>`
    : avatarEl;

  return `
    <div class="profile-header">
      <div class="profile-avatar-large">${avatarButton}</div>
      <span class="roll-badge">${rollLabel(student.rollNumber)}</span>
      <h3 class="profile-title">${escapeHtml(student.name)} ${badge}</h3>
      <div class="profile-pills">${pills}</div>
    </div>

    <h4 class="profile-section-title">Achievements</h4>
    ${myAchievements.length
      ? myAchievements.map((a) => `
          <div class="profile-achievement">
            <span class="task-tag announcement">${escapeHtml(a.category || "General")}</span>
            <p class="profile-ach-title">${escapeHtml(a.title)}</p>
            ${a.description ? `<p class="profile-ach-desc">${escapeHtml(a.description)}</p>` : ""}
            ${a.date ? `<p class="profile-ach-date">${escapeHtml(a.date)}</p>` : ""}
          </div>`).join("")
      : `<p class="tt-ann-empty">No achievements logged yet.</p>`}

    ${isMe ? `
      <div class="profile-actions-row">
        ${currentAuth.monitor ? `<a href="manage.html" class="btn btn-ghost btn-small">Monitor panel</a>` : ""}
        <button class="btn btn-ghost btn-small" id="profileSwitchBtn" type="button">Switch student</button>
        <button class="btn btn-ghost btn-small" id="profileSignOutBtn" type="button">Sign out</button>
      </div>` : ""}
  `;
}

function wireProfileBody(student) {
  const isMe = currentAuth.profile?.claimedStudentId === student.id;

  const editBtn = $("avatarEditBtn");
  if (editBtn) editBtn.addEventListener("click", () => openPicker(student));

  const switchBtn = $("profileSwitchBtn");
  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      playClick();
      closeProfile();
      import("./auth-ui.js").then((m) => {
        if (m.openSwitchStudentModal) m.openSwitchStudentModal(student.id);
      }).catch((err) => console.error("Failed to open switch-student modal:", err));
    });
  }

  const signOutBtn = $("profileSignOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      playClose();
      closeProfile();
      signOutUser();
    });
  }
}

function openPicker(student) {
  const overlay = $("avatarPickerOverlay");
  const grid = $("avatarPickerGrid");
  if (!overlay || !grid) return;

  const current = getAvatarForUid(getCurrentUid());
  const cells = AVATARS.map((a) => {
    const active = current === a.id;
    return `<button type="button" class="avatar-choice ${active ? "active" : ""}" data-id="${escapeHtml(a.id)}" title="${escapeHtml(a.label)}" aria-label="${escapeHtml(a.label)}">
      <span class="cm-avatar" style="width:48px;height:48px"><img src="${avatarUrl(a.id)}" alt=""></span>
    </button>`;
  }).join("");

  grid.innerHTML = `
    <button type="button" class="avatar-choice avatar-choice-none ${!current ? "active" : ""}" data-id="" title="No avatar" aria-label="No avatar">
      <span class="cm-avatar cm-avatar-initials" style="width:48px;height:48px;font-size:19px">—</span>
    </button>
    ${cells}
  `;

  grid.querySelectorAll(".avatar-choice").forEach((btn) => {
    btn.addEventListener("click", async () => {
      grid.querySelectorAll(".avatar-choice").forEach((b) => b.disabled = true);
      try {
        await setAvatarForUid(btn.dataset.id || null);
        playSuccess();
        closePicker();
        if (editingProfileStudentId) openProfile(editingProfileStudentId);
        window.dispatchEvent(new CustomEvent("cm:avatar-changed"));
      } catch (err) {
        console.error("Failed to set avatar:", err);
        playError();
      } finally {
        grid.querySelectorAll(".avatar-choice").forEach((b) => b.disabled = false);
      }
    });
  });

  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

export function closePicker() {
  const overlay = $("avatarPickerOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => { overlay.hidden = true; }, 200);
}

async function loadProfileBadgeData() {
  try {
    if (window.__cmClaimUids && window.__cmMonitorUids) {
      claimUids = window.__cmClaimUids;
      monitorUids = window.__cmMonitorUids;
      return;
    }
    const { db } = await import("./firebase-config.js");
    const { collection, getDocs, doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const [claimsSnap, monitorsSnap] = await Promise.all([
      getDocs(collection(db, "claims")),
      getDoc(doc(db, "settings", "monitors")),
    ]);
    claimUids = new Map();
    claimsSnap.forEach((d) => {
      const data = d.data();
      if (data && data.uid) claimUids.set(d.id, data.uid);
    });
    monitorUids = monitorsSnap.exists()
      ? new Set(Object.keys(monitorsSnap.data().uids || {}))
      : new Set();
    window.__cmClaimUids = claimUids;
    window.__cmMonitorUids = monitorUids;
  } catch (err) {
    console.error("Failed to load profile badge data:", err);
  }
}

export function initProfileModal() {
  loadProfileBadgeData();

  const overlay = $("profileOverlay");
  const closeBtn = $("profileClose");
  if (overlay && closeBtn) {
    closeBtn.addEventListener("click", closeProfile);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeProfile(); });
  }

  const picker = $("avatarPickerOverlay");
  const pickerClose = $("avatarPickerClose");
  if (picker && pickerClose) {
    pickerClose.addEventListener("click", closePicker);
    picker.addEventListener("click", (e) => { if (e.target === picker) closePicker(); });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (picker && !picker.hidden) { closePicker(); return; }
    if (overlay && !overlay.hidden) closeProfile();
  });

  onStudents((list) => { liveStudents = list; window.__cmStudents = list; });
  onAchievements((list) => {
    achievements = list;
    if (overlay && !overlay.hidden && editingProfileStudentId) {
      const s = liveStudents.find((x) => x.id === editingProfileStudentId);
      if (s) {
        $("profileBody").innerHTML = renderProfileBody(s);
        wireProfileBody(s);
      }
    }
  });

  onAvatars(() => {
    if (overlay && !overlay.hidden && editingProfileStudentId) {
      const s = liveStudents.find((x) => x.id === editingProfileStudentId);
      if (s) {
        $("profileBody").innerHTML = renderProfileBody(s);
        wireProfileBody(s);
      }
    }
  });

  subscribeAuth((state) => {
    currentAuth = state;
    if (state.user) {
      loadAvatars().catch(() => {});
      if (!claimUids.size) loadProfileBadgeData();
    }
    if (overlay && !overlay.hidden && editingProfileStudentId) {
      const s = liveStudents.find((x) => x.id === editingProfileStudentId);
      if (s) {
        $("profileBody").innerHTML = renderProfileBody(s);
        wireProfileBody(s);
      }
    }
  });

  window.addEventListener("cm:monitor-cache-ready", () => {
    if (overlay && !overlay.hidden && editingProfileStudentId) {
      const s = liveStudents.find((x) => x.id === editingProfileStudentId);
      if (s) {
        $("profileBody").innerHTML = renderProfileBody(s);
        wireProfileBody(s);
      }
    }
  });
}
