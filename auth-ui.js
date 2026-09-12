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
  getProfile,
} from "./auth.js";

let mode = "signin";
let latestState = { loading: true, user: null, profile: null, admin: false };
let claimModalOpen = false;

const $ = (id) => document.getElementById(id);

function setBodyModalState(open) {
  document.body.classList.toggle("modal-open", open);
}

function showAuthModal(startMode = "signin") {
  setMode(startMode);
  $("authOverlay").hidden = false;
  setBodyModalState(true);
  requestAnimationFrame(() => $("authForm")?.elements?.email?.focus());
}

function hideAuthModal() {
  $("authOverlay").hidden = true;
  $("authForm").reset();
  setAuthError(null);
  $("authResetNote").hidden = true;
  setBodyModalState(claimModalOpen);
}

function setAuthError(message) {
  const el = $("authError");
  el.hidden = !message;
  el.textContent = message || "";
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const active = tab.dataset.mode === next || (next === "reset" && tab.dataset.mode === "signin");
    tab.classList.toggle("active", active);
  });

  $("authTitle").textContent = next === "signup" ? "Create your account" : next === "reset" ? "Reset your password" : "Welcome back";
  document.querySelector('[data-field="displayName"]').hidden = next !== "signup";
  document.querySelector('[data-field="password"]').hidden = next === "reset";
  $("googleSignInBtn").hidden = next === "reset";
  $("forgotPasswordBtn").hidden = next !== "signin";
  document.querySelector(".auth-divider").hidden = next === "reset";
  $("authResetNote").hidden = true;

  const passwordInput = $("authForm").elements.password;
  passwordInput.required = next !== "reset";
  if (next === "signup") passwordInput.autocomplete = "new-password";
  else if (next === "signin") passwordInput.autocomplete = "current-password";
  else passwordInput.autocomplete = "off";

  $("authSubmitBtn").textContent =
    next === "signup" ? "Create account" :
    next === "reset" ? "Send reset link" :
    "Sign in";

  setAuthError(null);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const displayName = form.elements.displayName.value.trim();

  setAuthError(null);

  try {
    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }

    if (mode === "reset") {
      await resetPassword(email);
      $("authResetNote").hidden = false;
      $("authResetNote").textContent = "Reset link sent. Check your inbox and spam folder.";
      return;
    }

    if (!password) {
      setAuthError("Enter your password.");
      return;
    }

    if (mode === "signup") {
      const cred = await signUpEmail(email, password, displayName);
      const profile = await ensureProfileDoc(cred.user);
      hideAuthModal();
      if (!profile?.claimedStudentId) openClaimModal();
      return;
    }

    await signInEmail(email, password);
    hideAuthModal();
  } catch (error) {
    console.error("Email auth failed:", error);
    setAuthError(getFriendlyAuthError(error));
  }
}

async function handleGoogleSignIn() {
  setAuthError(null);

  try {
    const cred = await signInGoogle();
    const profile = await ensureProfileDoc(cred.user);
    hideAuthModal();

    if (!profile?.claimedStudentId) {
      openClaimModal();
    }
  } catch (error) {
    console.error("Google auth failed:", error);
    setAuthError(getFriendlyAuthError(error));
  }
}

function populateClaimSelect() {
  const select = $("claimSelect");
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
  select.replaceChildren();

  for (const student of sorted) {
    const option = document.createElement("option");
    option.value = student.id;
    option.textContent = student.name;
    select.appendChild(option);
  }
}

async function openClaimModal() {
  if (!latestState.user || claimModalOpen) return;

  claimModalOpen = true;
  populateClaimSelect();
  $("claimError").hidden = true;
  $("claimOverlay").hidden = false;
  setBodyModalState(true);

  try {
    const currentProfile = await getProfile(latestState.user.uid);
    const currentId = currentProfile?.claimedStudentId;
    if (currentId && students.some((student) => student.id === currentId)) {
      $("claimSelect").value = currentId;
      closeClaimModal();
    } else {
      $("claimSelect").focus();
    }
  } catch (error) {
    console.error("Failed to refresh claim state:", error);
    $("claimSelect").focus();
  }
}

function closeClaimModal() {
  claimModalOpen = false;
  $("claimOverlay").hidden = true;
  setBodyModalState(!$("authOverlay").hidden);
}

async function handleClaimConfirm() {
  const student = students.find((entry) => entry.id === $("claimSelect").value);
  if (!student || !latestState.user) return;

  $("claimConfirmBtn").disabled = true;
  $("claimError").hidden = true;

  try {
    await claimStudentIdentity(latestState.user.uid, student);
    closeClaimModal();
  } catch (error) {
    console.error("Identity claim failed:", error);
    $("claimError").hidden = false;

    if (error.code === "identity/already-claimed") {
      $("claimError").textContent = "That student is already linked to another account. Pick your own name, or ask an admin to verify the directory.";
    } else if (error.code === "identity/account-already-claimed") {
      $("claimError").textContent = "This account is already linked to a different student identity.";
    } else {
      $("claimError").textContent = "Couldn't save the profile link right now. Try again.";
    }
  } finally {
    $("claimConfirmBtn").disabled = false;
  }
}

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderAuthSlot() {
  const slot = $("authSlot");
  if (!slot) return;

  if (latestState.loading) {
    slot.innerHTML = `<span class="auth-loading">Checking account…</span>`;
    return;
  }

  if (!latestState.user) {
    slot.innerHTML = `<button class="btn btn-primary btn-small" id="signInTriggerBtn" type="button">Sign in</button>`;
    $("signInTriggerBtn").addEventListener("click", () => showAuthModal("signin"));
    return;
  }

  const { user, profile, admin } = latestState;
  const name = profile?.claimedStudentName || user.displayName || user.email || "Account";
  const needsClaim = !profile?.claimedStudentId;

  slot.innerHTML = `
    <div class="nav-item has-dropdown" id="profileItem">
      <button class="profile-pill" id="profileTrigger" type="button" aria-expanded="false" aria-controls="profileDropdown">
        <span class="profile-avatar">${initials(name)}</span>
        <span class="tri" aria-hidden="true">▾</span>
      </button>
      <div class="dropdown profile-dropdown" id="profileDropdown">
        <p class="profile-name"></p>
        <p class="profile-email"></p>
        ${admin ? `<span class="admin-pill">Admin</span>` : ""}
        ${needsClaim ? `<button class="dropdown-action" id="completeProfileBtn" type="button">Finish profile setup</button>` : ""}
        <div class="dropdown-divider"></div>
        <button class="dropdown-action" id="signOutBtn" type="button">Sign out</button>
      </div>
    </div>
  `;

  $("profileDropdown").querySelector(".profile-name").textContent = name;
  $("profileDropdown").querySelector(".profile-email").textContent = user.email || "";

  const item = $("profileItem");
  const trigger = $("profileTrigger");

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = item.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  $("signOutBtn").addEventListener("click", async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error("Sign-out failed:", error);
    } finally {
      item.classList.remove("open");
    }
  });

  const completeButton = $("completeProfileBtn");
  if (completeButton) {
    completeButton.addEventListener("click", () => {
      item.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      openClaimModal();
    });
  }
}

document.addEventListener("click", (event) => {
  const item = $("profileItem");
  if (item && !item.contains(event.target)) {
    item.classList.remove("open");
    $("profileTrigger")?.setAttribute("aria-expanded", "false");
  }
});

export function initAuthUI() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  $("authClose").addEventListener("click", hideAuthModal);
  $("authForm").addEventListener("submit", handleAuthSubmit);
  $("googleSignInBtn").addEventListener("click", handleGoogleSignIn);
  $("forgotPasswordBtn").addEventListener("click", () => setMode("reset"));

  $("authOverlay").addEventListener("click", (event) => {
    if (event.target === $("authOverlay")) hideAuthModal();
  });

  $("claimClose").addEventListener("click", closeClaimModal);
  $("claimSkipBtn").addEventListener("click", closeClaimModal);
  $("claimConfirmBtn").addEventListener("click", handleClaimConfirm);

  $("claimOverlay").addEventListener("click", (event) => {
    if (event.target === $("claimOverlay")) closeClaimModal();
  });

  subscribeAuth((state) => {
    latestState = state;
    renderAuthSlot();
  });
}
// Ensure the DOM is fully interactive before mounting Firebase auth listener
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      subscribeAuth((state) => {
        latestState = state;
        renderAuthSlot();
      });
    });
  } else {
    subscribeAuth((state) => {
      latestState = state;
      renderAuthSlot();
    });
  }
