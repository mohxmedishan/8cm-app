// ============================================
// 8CM — Auth UI
// ------------------------------------------------
// Wires the sign-in/sign-up modal, the identity-claim modal, and the
// profile dropdown in the navbar to the logic in auth.js. Nothing in
// here talks to Firebase directly — it only calls exported functions.
// ============================================
import { getStudentsSync, onStudents, loadStudents, rollText } from "./students.js";
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
  switchStudentIdentity,
  isFirebaseConfigured,
} from "./auth.js";
import { playOpen, playClose, playSuccess, playError, playClick } from "./sound.js";
import { syncThemeFromProfile } from "./theme.js";
import { avatarMarkup, onAvatars, getAvatarForUid } from "./avatars.js";

let mode = "signin"; // "signin" | "signup" | "reset"
let latestState = { user: null, profile: null, monitor: false };
// "initial" = mandatory first-time pick, no way out but signing out.
// "switch" = the optional, cancelable "Switch student" action from
// the profile dropdown on an account that's already claimed.
let claimMode = "initial";

const $ = (id) => document.getElementById(id);
const escapeHtml = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);


const AUTH_CACHE_KEY = "8cm:lastAuth";
function readCachedAuth() {
  try { const r = localStorage.getItem(AUTH_CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function writeCachedAuth(state) {
  try {
    if (!state) localStorage.removeItem(AUTH_CACHE_KEY);
    else localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state));
  } catch {}
}

// ------------------------------------------------
// Sign in / up / reset modal
// ------------------------------------------------
function showAuthModal(startMode) {
  setMode(startMode || "signin");
  $("authOverlay").hidden = false;
  playOpen();
}

function hideAuthModal() {
  $("authOverlay").hidden = true;
  playClose();
  $("authForm").reset();
  setAuthError(null);
  $("authResetNote").hidden = true;
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    const input = document.querySelector(`input[name="${btn.dataset.target}"]`);
    if (input) input.type = "password";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Show password");
    btn.querySelector(".eye-open").hidden = false;
    btn.querySelector(".eye-closed").hidden = true;
  });
}

function setAuthError(message, retryFn) {
  const el = $("authError");
  el.innerHTML = "";
  el.hidden = !message;
  if (!message) return;

  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);

  if (retryFn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "auth-error-retry";
    btn.textContent = "Try again";
    btn.addEventListener("click", () => {
      setAuthError(null);
      retryFn();
    });
    el.appendChild(btn);
  }
}

function setMode(next) {
  mode = next;

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const matches = tab.dataset.mode === next || (next === "reset" && tab.dataset.mode === "signin");
    tab.classList.toggle("active", matches);
  });

  document.querySelector('[data-field="password"]').hidden = next === "reset";
  document.querySelector('[data-field="confirmPassword"]').hidden = next !== "signup";
  $("googleSignInBtn").hidden = next === "reset";
  document.querySelector(".auth-divider").hidden = next === "reset";
  $("forgotPasswordBtn").hidden = next === "signup";
  $("authResetNote").hidden = true;

  $("authSubmitBtn").querySelector(".btn-label").textContent =
    next === "signup" ? "Create account" : next === "reset" ? "Send reset link" : "Sign in";

  setAuthError(null);
}

// ------------------------------------------------
// Immersive loading overlay (blur backdrop + status)
// ------------------------------------------------
function showLoading(status) {
  $("loadingOverlay").classList.remove("hiding");
  $("loadingStatus").textContent = status || "Working…";
  $("loadingOverlay").hidden = false;
}

function setLoadingStatus(status) {
  $("loadingStatus").textContent = status;
}

function hideLoading() {
  const el = $("loadingOverlay");
  if (el.hidden) return;
  // Fade out rather than snapping to [hidden] instantly, so a fast
  // Firebase response never reads as an abrupt, jarring close.
  el.classList.add("hiding");
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove("hiding");
  }, 180);
}

// ------------------------------------------------
// Wait for the global auth subscription (below) to actually reflect
// the just-signed-in user — including its Firestore profile fetch —
// before any modal/loading state is dismissed. Signing in resolves
// the moment Firebase Auth confirms the credential, but our own
// onAuthStateChanged → getProfile chain runs a beat *after* that, so
// closing the modal on promise-resolution alone could show a stale
// "Sign in" button for a frame, or make a Google-returning-user
// wrongly look like they still need to claim a name. This polls
// `latestState` (kept current by subscribeAuth below) until it lines
// up with the uid we just authenticated, with a defensive timeout so
// a dropped listener can never hang the UI forever.
function waitForAuthUser(uid, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (latestState.user && latestState.user.uid === uid) {
      resolve(latestState);
      return;
    }
    const interval = setInterval(() => {
      if (latestState.user && latestState.user.uid === uid) {
        finish();
      }
    }, 50);
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearInterval(interval);
      clearTimeout(timer);
      resolve(latestState);
    }
  });
}

// ------------------------------------------------
// Password visibility toggles
// ------------------------------------------------
function wirePasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      playClick();
      const input = document.querySelector(`input[name="${btn.dataset.target}"]`);
      if (!input) return;
      const nowVisible = input.type === "password"; // about to become visible
      input.type = nowVisible ? "text" : "password";
      btn.setAttribute("aria-pressed", String(nowVisible));
      btn.setAttribute("aria-label", nowVisible ? "Hide password" : "Show password");
      btn.querySelector(".eye-open").hidden = nowVisible;
      btn.querySelector(".eye-closed").hidden = !nowVisible;
    });
  });
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const email = f.email.value.trim();
  const password = f.password.value;
  const confirmPassword = f.confirmPassword.value;

  setAuthError(null);

  if (mode === "signup" && password !== confirmPassword) {
    playError();
    setAuthError("Those passwords don't match — check and try again.");
    return;
  }

  if (mode === "signup") {
    await runSignUp(email, password);
  } else if (mode === "reset") {
    await runReset(email);
  } else {
    await runSignIn(email, password);
  }
}

// ------------------------------------------------
// Each Firebase call gets its own try/catch so a failure at any one
// stage (the auth call itself vs. the Firestore sync afterward) gets
// its own accurate message and its own retry, instead of one
// catch-all that can't tell the two apart.
// ------------------------------------------------
async function runSignIn(email, password) {
  showLoading("Signing in…");
  let cred;
  try {
    cred = await signInEmail(email, password);
  } catch (err) {
    hideLoading();
    console.error(err);
    playError();
    setAuthError(getFriendlyAuthError(err), () => runSignIn(email, password));
    return;
  }
  await finishAfterAuth(cred.user);
}

async function runSignUp(email, password) {
  showLoading("Creating your account…");
  let cred;
  try {
    cred = await signUpEmail(email, password);
  } catch (err) {
    hideLoading();
    console.error(err);
    playError();
    setAuthError(getFriendlyAuthError(err), () => runSignUp(email, password));
    return;
  }
  await finishAfterAuth(cred.user);
}

async function runReset(email) {
  showLoading("Sending reset link…");
  try {
    await resetPassword(email);
    hideLoading();
    playSuccess();
    $("authResetNote").hidden = false;
    $("authResetNote").textContent = "Reset link sent — check your inbox.";
  } catch (err) {
    hideLoading();
    console.error(err);
    playError();
    setAuthError(getFriendlyAuthError(err), () => runReset(email));
  }
}

async function handleGoogleSignIn() {
  setAuthError(null);
  showLoading("Connecting to Google…");
  let cred;
  try {
    cred = await signInGoogle();
  } catch (err) {
    hideLoading();
    console.error(err);
    playError();
    setAuthError(getFriendlyAuthError(err), handleGoogleSignIn);
    return;
  }
  await finishAfterAuth(cred.user);
}

// Runs after Firebase Auth itself has already succeeded: syncs the
// Firestore profile doc, then waits for that to actually propagate
// through the app's own auth-state subscription before dismissing the
// loading state and the sign-in modal — this is the fix for the
// popup/modal closing before Firebase state had fully settled.
//
// It deliberately does NOT decide whether the identity-claim modal
// should open: subscribeAuth's callback below does that, uniformly,
// for every sign-in path (email, sign-up, Google, and a restored
// session on page load) instead of each call site guessing.
async function finishAfterAuth(user) {
  try {
    setLoadingStatus("Setting up your profile…");
    await ensureProfileDoc(user);
    await waitForAuthUser(user.uid);
    hideLoading();
    playSuccess();
    hideAuthModal();
  } catch (err) {
    hideLoading();
    console.error(err);
    playError();
    setAuthError(
      "Signed in, but we couldn't finish syncing your profile. Try again.",
      () => finishAfterAuth(user)
    );
  }
}

// ------------------------------------------------
// Identity claim modal
// ------------------------------------------------
function populateClaimSelect() {
  const select = $("claimSelect");
  if (!select) return;

  const fill = (list) => {
    select.innerHTML = "";
    [...list]
      .filter((s) => s.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.guest ? rollText(s) : s.rollNumber}. ${s.name}${s.guest ? " (guest)" : ""}`;
        select.appendChild(opt);
      });
  };

  fill(getStudentsSync());
  // Then upgrade silently when Firestore resolves.
  loadStudents().then(fill).catch(() => {});
}

function openClaimModal(nextMode = "initial", preselectId = null) {
  claimMode = nextMode;
  const isSwitch = nextMode === "switch";

  populateClaimSelect();
  if (preselectId) $("claimSelect").value = preselectId;
  $("claimError").hidden = true;

  $("claimModalTitle").textContent = isSwitch ? "Switch student" : "Which one are you?";
  $("claimModalSub").textContent = isSwitch
    ? "Pick a different name from the directory. This updates who your account is linked to."
    : "Pick your name from the directory to finish setting up your account. This links your account to that student.";
  $("claimWrongAccountBtn").hidden = isSwitch;
  $("claimCancelBtn").hidden = !isSwitch;
  $("claimClose").hidden = !isSwitch;

  $("claimOverlay").hidden = false;
  playOpen();
}

function closeClaimModal() {
  $("claimOverlay").hidden = true;
  playClose();
}

async function handleClaimConfirm() {
  const studentId = $("claimSelect").value;
  const student = getStudentsSync().find((s) => s.id === studentId);
  if (!student || !latestState.user) return;

  const btn = $("claimConfirmBtn");
  btn.disabled = true;
  $("claimError").hidden = true;

  try {
    if (claimMode === "switch") {
      await switchStudentIdentity(latestState.user.uid, student, latestState.profile);
    } else {
      await claimStudentIdentity(latestState.user.uid, student, latestState.profile);
    }
    // claimStudentIdentity/switchStudentIdentity now broadcast the new
    // claimedStudentId to every subscribeAuth listener (this module's
    // own included) the instant the claim commits, so latestState is
    // already up to date here — no manual patch needed, and every
    // other open module (profile-modal.js, dashboard.js, etc.) picks
    // it up too instead of only this one.
    renderAuthSlot();
    playSuccess();
    closeClaimModal();
  } catch (err) {
    playError();
    $("claimError").hidden = false;
    $("claimError").textContent =
      err.code === "identity/already-claimed"
        ? "That student is already linked to another account. Pick a different name."
        : err.code === "identity/already-bound"
        ? "Your account is already permanently linked to a student and can't be changed here."
        : "Couldn't save that right now. Try again.";
  } finally {
    btn.disabled = false;
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
  const { user, profile, monitor } = latestState;

  if (!user) {
    slot.innerHTML = `<button class="btn btn-primary btn-small" id="signInTriggerBtn">Sign in</button>`;
    $("signInTriggerBtn").addEventListener("click", () => showAuthModal("signin"));
    return;
  }

  const name = (profile && profile.claimedStudentName) || user.displayName || user.email || "Account";
  const avatarId = getAvatarForUid(user.uid);
  const avatarHtml = avatarMarkup(avatarId, name, 24);

  slot.innerHTML = `
    <div class="nav-item has-dropdown" id="profileItem">
      <button class="profile-pill" id="profileTrigger" aria-expanded="false" type="button">
        ${avatarHtml}
        <span class="tri">▾</span>
      </button>
      <div class="dropdown profile-dropdown" id="profileDropdown">
        <p class="profile-name">${escapeHtml(name)}</p>
        <p class="profile-email">${escapeHtml(user.email || "")}</p>
        <div class="profile-actions">
          ${profile?.claimedStudentId ? `<button class="dropdown-action" id="viewProfileBtn" type="button">View profile</button>` : ""}
          ${monitor ? `<button class="dropdown-action" id="monitorPanelBtn" type="button">Monitor panel</button>` : ""}
          <button class="dropdown-action" id="signOutBtn" type="button">Sign out</button>
        </div>
      </div>
    </div>
  `;

  const item = $("profileItem");
  const trigger = $("profileTrigger");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = item.classList.toggle("open");
    trigger.setAttribute("aria-expanded", open);
    open ? playOpen() : playClose();
  });

  const viewBtn = $("viewProfileBtn");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      playClick();
      item.classList.remove("open");
      window.__cmOpenProfile?.(profile?.claimedStudentId);
    });
  }

  const monitorBtn = $("monitorPanelBtn");
  if (monitorBtn) {
    monitorBtn.addEventListener("click", () => {
      playClick();
      window.location.href = "manage.html";
    });
  }

  $("signOutBtn").addEventListener("click", () => {
    playClose();
    item.classList.remove("open");
    signOutUser();
  });
}

document.addEventListener("click", (e) => {
  const item = $("profileItem");
  if (item && !item.contains(e.target)) item.classList.remove("open");
});

// ------------------------------------------------
// Init
// ------------------------------------------------
export function openSwitchStudentModal(preselectId) {
  openClaimModal("switch", preselectId || (latestState.profile && latestState.profile.claimedStudentId));
}

export function initAuthUI() {
  wirePasswordToggles();
  // Re-render profile pill if Firestore students arrive/resolve after
  // first paint, so the claimed name updates without a reload.
  onStudents(() => renderAuthSlot());
  onAvatars(() => renderAuthSlot());
  window.addEventListener("cm:avatar-changed", () => renderAuthSlot());

  if (!isFirebaseConfigured) {
    $("configBanner").hidden = false;
  }

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      playClick();
      setMode(tab.dataset.mode);
    });
  });

  $("authClose").addEventListener("click", hideAuthModal);
  $("authForm").addEventListener("submit", handleAuthSubmit);
  $("googleSignInBtn").addEventListener("click", handleGoogleSignIn);
  $("forgotPasswordBtn").addEventListener("click", () => {
    playClick();
    setMode("reset");
  });
  $("authOverlay").addEventListener("click", (e) => {
    if (e.target === $("authOverlay")) hideAuthModal();
  });

  $("claimConfirmBtn").addEventListener("click", handleClaimConfirm);
  // This signs the account out entirely — it's not a "skip", it's the
  // only way out for someone who authenticated with the wrong Google
  // account during the mandatory first-time claim. Hidden in "switch"
  // mode, where claimCancelBtn/claimClose below do the equivalent job
  // without signing anyone out.
  $("claimWrongAccountBtn").addEventListener("click", () => {
    signOutUser();
    closeClaimModal();
  });
  $("claimCancelBtn").addEventListener("click", closeClaimModal);
  $("claimClose").addEventListener("click", closeClaimModal);
  $("claimOverlay").addEventListener("click", (e) => {
    if (e.target === $("claimOverlay") && claimMode === "switch") closeClaimModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && claimMode === "switch" && !$("claimOverlay").hidden) {
      closeClaimModal();
    }
  });
  const cached = readCachedAuth();
  if (cached) {
    latestState = { user: cached.user, profile: cached.profile, monitor: cached.monitor };
    renderAuthSlot();
  }

  subscribeAuth((state) => {
    latestState = state;
    if (state.user) {
      writeCachedAuth({
        user: { uid: state.user.uid, email: state.user.email, displayName: state.user.displayName },
        profile: state.profile,
        monitor: state.monitor,
      });
    } else {
      writeCachedAuth(null);
    }
    renderAuthSlot();
    syncThemeFromProfile(state.user ? state.user.uid : null, state.profile);

    if (state.user && state.monitor) {
      import("./firebase-config.js").then(async ({ db }) => {
        const { setDoc, doc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        setDoc(doc(db, "settings", "monitors"), { uids: { [state.user.uid]: true } }, { merge: true })
          .catch((err) => console.error("Monitor marker write failed:", err));

        // "This person's browser has actually run as a monitor." The Monitors
        // panel reads this to tell "signed in" from "has an account but hasn't
        // picked up the role yet". Refreshed at most every 6 hours.
        const seen = state.profile && state.profile.monitorSeenAt;
        const seenMs = seen && typeof seen.toMillis === "function" ? seen.toMillis() : 0;
        if (Date.now() - seenMs > 6 * 60 * 60 * 1000) {
          setDoc(doc(db, "users", state.user.uid), { monitorSeenAt: serverTimestamp() }, { merge: true })
            .catch((err) => console.error("Monitor seen-at write failed:", err));
        }
      }).catch((err) => console.error("Monitor marker setup failed:", err));
    }

    if (state.user && (!state.profile || !state.profile.claimedStudentId)) {
      openClaimModal("initial");
    } else if (claimMode === "initial" && !$("claimOverlay").hidden) {
      closeClaimModal();
    }
  });
}
