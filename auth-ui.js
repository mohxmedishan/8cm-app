// ============================================
// 8CM — Auth UI
// ------------------------------------------------
// Wires the sign-in/sign-up modal, the identity-claim modal, and the
// profile dropdown in the navbar to the logic in auth.js. Nothing in
// here talks to Firebase directly — it only calls exported functions.
// ============================================
import { students } from "./students.js";
import {
  subscribeAuth,
  signInGoogle,
  signInEmail,
  signUpEmail,
  resetPassword,
  signOutUser,
  getFriendlyAuthError,
  ensureProfileDoc,
  claimStudentIdentity,
} from "./auth.js";

let mode = "signin"; // "signin" | "signup" | "reset"
let latestState = { user: null, profile: null, admin: false };

const $ = (id) => document.getElementById(id);

// ------------------------------------------------
// Sign in / up / reset modal
// ------------------------------------------------
function showAuthModal(startMode) {
  setMode(startMode || "signin");
  $("authOverlay").hidden = false;
}

function hideAuthModal() {
  $("authOverlay").hidden = true;
  $("authForm").reset();
  setAuthError(null);
  $("authResetNote").hidden = true;
}

function setAuthError(message) {
  const el = $("authError");
  el.hidden = !message;
  el.textContent = message || "";
}

function setMode(next) {
  mode = next;

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const matches = tab.dataset.mode === next || (next === "reset" && tab.dataset.mode === "signin");
    tab.classList.toggle("active", matches);
  });

  document.querySelector('[data-field="displayName"]').hidden = next !== "signup";
  document.querySelector('[data-field="password"]').hidden = next === "reset";
  $("googleSignInBtn").hidden = next === "reset";
  document.querySelector(".auth-divider").hidden = next === "reset";
  $("forgotPasswordBtn").hidden = next === "signup";
  $("authResetNote").hidden = true;

  $("authSubmitBtn").textContent =
    next === "signup" ? "Create account" : next === "reset" ? "Send reset link" : "Sign in";

  setAuthError(null);
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim();
  const password = f.password.value;
  const displayName = f.displayName.value.trim();

  setAuthError(null);

  try {
    if (mode === "signup") {
      const cred = await signUpEmail(email, password, displayName);
      await ensureProfileDoc(cred.user);
      hideAuthModal();
      openClaimModal();
    } else if (mode === "reset") {
      await resetPassword(email);
      $("authResetNote").hidden = false;
      $("authResetNote").textContent = "Reset link sent — check your inbox.";
    } else {
      await signInEmail(email, password);
      hideAuthModal();
    }
  } catch (err) {
    console.error(err);
    setAuthError(getFriendlyAuthError(err));
  }
}

async function handleGoogleSignIn() {
  setAuthError(null);
  try {
    const cred = await signInGoogle();
    await ensureProfileDoc(cred.user);
    hideAuthModal();
    if (!latestState.profile || !latestState.profile.claimedStudentId) {
      openClaimModal();
    }
  } catch (err) {
    console.error(err);
    setAuthError(getFriendlyAuthError(err));
  }
}

// ------------------------------------------------
// Identity claim modal
// ------------------------------------------------
function populateClaimSelect() {
  const select = $("claimSelect");
  select.innerHTML = "";
  [...students]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });
}

function openClaimModal() {
  populateClaimSelect();
  $("claimError").hidden = true;
  $("claimOverlay").hidden = false;
}

function closeClaimModal() {
  $("claimOverlay").hidden = true;
}

async function handleClaimConfirm() {
  const studentId = $("claimSelect").value;
  const student = students.find((s) => s.id === studentId);
  if (!student || !latestState.user) return;

  try {
    await claimStudentIdentity(latestState.user.uid, student);
    closeClaimModal();
  } catch (err) {
    $("claimError").hidden = false;
    $("claimError").textContent =
      err.code === "identity/already-claimed"
        ? "That student is already linked to another account. Pick your own name, or check with an admin if that's wrong."
        : "Couldn't save that right now. Try again.";
  }
}

// ------------------------------------------------
// Profile pill (reactive — rebuilt whenever auth state changes)
// ------------------------------------------------
function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function renderAuthSlot() {
  const slot = $("authSlot");
  if (!slot) return;
  const { user, profile, admin } = latestState;

  if (!user) {
    slot.innerHTML = `<button class="btn btn-primary btn-small" id="signInTriggerBtn">Sign in</button>`;
    $("signInTriggerBtn").addEventListener("click", () => showAuthModal("signin"));
    return;
  }

  const name = (profile && profile.claimedStudentName) || user.displayName || user.email || "Account";
  const needsClaim = !profile || !profile.claimedStudentId;

  slot.innerHTML = `
    <div class="nav-item has-dropdown" id="profileItem">
      <button class="profile-pill" id="profileTrigger" aria-expanded="false">
        <span class="profile-avatar">${initials(name)}</span>
        <span class="tri">▾</span>
      </button>
      <div class="dropdown profile-dropdown" id="profileDropdown">
        <p class="profile-name">${name}</p>
        <p class="profile-email">${user.email || ""}</p>
        ${admin ? `<span class="admin-pill">Admin</span>` : ""}
        ${needsClaim ? `<button class="dropdown-action" id="completeProfileBtn">Finish setting up profile</button>` : ""}
        <button class="dropdown-action" id="signOutBtn">Sign out</button>
      </div>
    </div>
  `;

  const item = $("profileItem");
  const trigger = $("profileTrigger");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = item.classList.toggle("open");
    trigger.setAttribute("aria-expanded", open);
  });

  $("signOutBtn").addEventListener("click", () => {
    signOutUser();
    item.classList.remove("open");
  });

  const completeBtn = $("completeProfileBtn");
  if (completeBtn) {
    completeBtn.addEventListener("click", () => {
      item.classList.remove("open");
      openClaimModal();
    });
  }
}

document.addEventListener("click", (e) => {
  const item = $("profileItem");
  if (item && !item.contains(e.target)) item.classList.remove("open");
});

// ------------------------------------------------
// Init
// ------------------------------------------------
export function initAuthUI() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  $("authClose").addEventListener("click", hideAuthModal);
  $("authForm").addEventListener("submit", handleAuthSubmit);
  $("googleSignInBtn").addEventListener("click", handleGoogleSignIn);
  $("forgotPasswordBtn").addEventListener("click", () => setMode("reset"));
  $("authOverlay").addEventListener("click", (e) => {
    if (e.target === $("authOverlay")) hideAuthModal();
  });

  $("claimSkipBtn").addEventListener("click", closeClaimModal);
  $("claimConfirmBtn").addEventListener("click", handleClaimConfirm);
  $("claimOverlay").addEventListener("click", (e) => {
    if (e.target === $("claimOverlay")) closeClaimModal();
  });

  subscribeAuth((state) => {
    latestState = state;
    renderAuthSlot();
  });
}
