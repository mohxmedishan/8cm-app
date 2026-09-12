import { students } from "./students.js";

import {
  subscribeAuth,
  signInGoogle,
  signInEmail,
  signUpEmail,
  sendVerificationEmail,
  resetPassword,
  signOutUser,
  getFriendlyAuthError,
  ensureProfileDoc,
  claimStudentIdentity,
} from "./auth.js";

let mode = "signin";
let latestState = {
  loading: true,
  user: null,
  profile: null,
  admin: false,
};

let claimModalOpen = false;
let authBusy = false;
let selectedStudentId = null;
let verificationMessage = "";

const $ = (id) =>
  document.getElementById(id);

function setBodyModalState(open) {
  document.body.classList.toggle(
    "modal-open",
    open
  );
}

function setButtonBusy(button, busy, busyText) {
  if (!button) return;

  if (busy) {
    button.dataset.originalText =
      button.textContent;

    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute(
      "aria-busy",
      "true"
    );
  } else {
    button.textContent =
      button.dataset.originalText ||
      button.textContent;

    button.disabled = false;
    button.removeAttribute(
      "aria-busy"
    );
  }
}

function showAuthModal(startMode = "signin") {
  setMode(startMode);

  const overlay =
    $("authOverlay");

  overlay.hidden = false;
  setBodyModalState(true);

  window.requestAnimationFrame(
    () =>
      $("authForm")
        ?.elements
        ?.email?.focus()
  );
}

function hideAuthModal() {
  const overlay =
    $("authOverlay");

  overlay.hidden = true;

  $("authForm")?.reset();

  setAuthError(null);

  $("authResetNote").hidden = true;

  setBodyModalState(
    claimModalOpen
  );
}

function setAuthError(message) {
  const element =
    $("authError");

  if (!element) return;

  element.hidden = !message;
  element.textContent =
    message || "";
}

function setMode(nextMode) {
  mode = nextMode;

  document
    .querySelectorAll(".auth-tab")
    .forEach((tab) => {
      const active =
        tab.dataset.mode ===
          nextMode ||
        (
          nextMode === "reset" &&
          tab.dataset.mode ===
            "signin"
        );

      tab.classList.toggle(
        "active",
        active
      );

      tab.setAttribute(
        "aria-selected",
        String(active)
      );
    });

  const signup =
    nextMode === "signup";
  const reset =
    nextMode === "reset";

  $("authTitle").textContent =
    signup
      ? "Create your account"
      : reset
        ? "Reset your password"
        : "Welcome back";

  $("authSubtitle").textContent =
    signup
      ? "Create your 8CM account and link it to your class identity."
      : reset
        ? "Enter your account email and we'll send you a reset link."
        : "Sign in to access your class profile and live task list.";

  const displayNameField =
    document.querySelector(
      '[data-field="displayName"]'
    );

  const passwordField =
    document.querySelector(
      '[data-field="password"]'
    );

  const confirmPasswordField =
    document.querySelector(
      '[data-field="confirmPassword"]'
    );

  displayNameField.hidden =
    !signup;

  passwordField.hidden =
    reset;

  confirmPasswordField.hidden =
    !signup;

  $("googleSignInBtn").hidden =
    reset;

  $("forgotPasswordBtn").hidden =
    nextMode !== "signin";

  $("authTabs").hidden =
    reset;

  $("authDivider").hidden =
    reset;

  const passwordInput =
    $("authForm")
      .elements
      .password;

  const confirmInput =
    $("authForm")
      .elements
      .confirmPassword;

  passwordInput.required =
    !reset;

  confirmInput.required =
    signup;

  if (signup) {
    passwordInput.autocomplete =
      "new-password";

    confirmInput.autocomplete =
      "new-password";
  } else if (!reset) {
    passwordInput.autocomplete =
      "current-password";

    confirmInput.autocomplete =
      "off";
  } else {
    passwordInput.autocomplete =
      "off";

    confirmInput.autocomplete =
      "off";
  }

  $("authSubmitBtn").textContent =
    signup
      ? "Create account"
      : reset
        ? "Send reset link"
        : "Sign in";

  $("passwordToggle")?.setAttribute(
    "aria-label",
    "Show password"
  );

  $("confirmPasswordToggle")?.setAttribute(
    "aria-label",
    "Show confirm password"
  );

  setPasswordVisible(
    "password",
    "passwordToggle",
    false
  );

  setPasswordVisible(
    "confirmPassword",
    "confirmPasswordToggle",
    false
  );

  $("authResetNote").hidden =
    true;

  setAuthError(null);
}

function setPasswordVisible(
  inputName,
  toggleId,
  visible
) {
  const input =
    $("authForm")
      ?.elements
      ?.namedItem(inputName);

  const toggle =
    $(toggleId);

  if (!input || !toggle)
    return;

  input.type =
    visible
      ? "text"
      : "password";

  toggle.classList.toggle(
    "visible",
    visible
  );

  toggle.setAttribute(
    "aria-label",
    visible
      ? `Hide ${inputName === "confirmPassword" ? "confirm password" : "password"}`
      : `Show ${inputName === "confirmPassword" ? "confirm password" : "password"}`
  );

  toggle.setAttribute(
    "aria-pressed",
    String(visible)
  );
}

function initPasswordToggle(
  toggleId,
  inputName
) {
  const toggle =
    $(toggleId);

  if (!toggle) return;

  toggle.addEventListener(
    "click",
    () => {
      const input =
        $("authForm")
          .elements
          .namedItem(inputName);

      const visible =
        input.type ===
        "password";

      setPasswordVisible(
        inputName,
        toggleId,
        visible
      );

      input.focus({
        preventScroll: true,
      });
    }
  );
}

function validatePassword(
  password
) {
  return password.length >= 6;
}

function validateSignup(
  password,
  confirmPassword,
  displayName,
  email
) {
  if (!email) {
    return "Enter your email address.";
  }

  if (!displayName) {
    return "Enter a display name.";
  }

  if (!validatePassword(password)) {
    return "Password should be at least 6 characters.";
  }

  if (!confirmPassword) {
    return "Confirm your password.";
  }

  if (password !== confirmPassword) {
    return "The passwords don't match.";
  }

  return null;
}

async function handleAuthSubmit(
  event
) {
  event.preventDefault();

  if (authBusy) return;

  const form =
    event.currentTarget;

  const email =
    form.elements.email.value
      .trim();

  const password =
    form.elements.password
      .value;

  const confirmPassword =
    form.elements.confirmPassword
      .value;

  const displayName =
    form.elements.displayName
      .value.trim();

  setAuthError(null);

  if (!email) {
    setAuthError(
      "Enter your email address."
    );
    return;
  }

  if (mode === "reset") {
    const submit =
      $("authSubmitBtn");

    authBusy = true;
    setButtonBusy(
      submit,
      true,
      "Sending…"
    );

    try {
      await resetPassword(email);

      $("authResetNote").hidden =
        false;

      $("authResetNote").textContent =
        "Reset link sent. Check your inbox and spam folder.";

      form.elements.email.focus();
    } catch (error) {
      console.error(
        "Password reset failed:",
        error
      );

      setAuthError(
        getFriendlyAuthError(error)
      );
    } finally {
      authBusy = false;
      setButtonBusy(
        submit,
        false
      );
    }

    return;
  }

  if (mode === "signup") {
    const validationError =
      validateSignup(
        password,
        confirmPassword,
        displayName,
        email
      );

    if (validationError) {
      setAuthError(
        validationError
      );
      return;
    }

    const submit =
      $("authSubmitBtn");

    authBusy = true;
    setButtonBusy(
      submit,
      true,
      "Creating…"
    );

    try {
      const credential =
        await signUpEmail(
          email,
          password,
          displayName
        );

      verificationMessage =
        "Your account was created. We sent a verification email to your inbox.";

      try {
        await sendVerificationEmail(
          credential.user
        );
      } catch (verificationError) {
        console.error(
          "Verification email failed:",
          verificationError
        );

        verificationMessage =
          "Your account was created, but the verification email could not be sent yet. You can resend it from your profile.";
      }

      const profile =
        await ensureProfileDoc(
          credential.user
        );

      hideAuthModal();

      if (
        !profile?.claimedStudentId
      ) {
        openClaimModal();
      }

      return;
    } catch (error) {
      console.error(
        "Account creation failed:",
        error
      );

      setAuthError(
        getFriendlyAuthError(error)
      );
    } finally {
      authBusy = false;
      setButtonBusy(
        submit,
        false
      );
    }

    return;
  }

  if (!password) {
    setAuthError(
      "Enter your password."
    );
    return;
  }

  const submit =
    $("authSubmitBtn");

  authBusy = true;

  setButtonBusy(
    submit,
    true,
    "Signing in…"
  );

  try {
    await signInEmail(
      email,
      password
    );

    hideAuthModal();
  } catch (error) {
    console.error(
      "Email sign-in failed:",
      error
    );

    setAuthError(
      getFriendlyAuthError(error)
    );
  } finally {
    authBusy = false;
    setButtonBusy(
      submit,
      false
    );
  }
}

async function handleGoogleSignIn() {
  if (authBusy) return;

  setAuthError(null);

  const button =
    $("googleSignInBtn");

  authBusy = true;

  setButtonBusy(
    button,
    true,
    "Connecting…"
  );

  try {
    const credential =
      await signInGoogle();

    const profile =
      await ensureProfileDoc(
        credential.user
      );

    hideAuthModal();

    if (
      !profile?.claimedStudentId
    ) {
      verificationMessage = "";
      openClaimModal();
    }
  } catch (error) {
    console.error(
      "Google sign-in failed:",
      error
    );

    setAuthError(
      getFriendlyAuthError(error)
    );
  } finally {
    authBusy = false;
    setButtonBusy(
      button,
      false
    );
  }
}

function populateClaimGrid() {
  const grid =
    $("claimGrid");

  if (!grid) return;

  grid.replaceChildren();

  const sorted = [...students].sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );

  for (const student of sorted) {
    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.className =
      "student-claim-card";

    button.dataset.studentId =
      student.id;

    button.setAttribute(
      "aria-pressed",
      String(
        student.id ===
          selectedStudentId
      )
    );

    const dot =
      document.createElement(
        "span"
      );

    dot.className =
      `claim-house-dot ${student.house}`;

    const content =
      document.createElement(
        "span"
      );

    content.className =
      "claim-card-content";

    const name =
      document.createElement(
        "strong"
      );

    name.textContent =
      student.name;

    const meta =
      document.createElement(
        "small"
      );

    meta.textContent =
      `${student.house.charAt(0).toUpperCase() + student.house.slice(1)} · ${
        student.transport === "OT"
          ? "Own transport"
          : `Bus ${student.transport}`
      }`;

    content.append(
      name,
      meta
    );

    button.append(
      dot,
      content
    );

    button.addEventListener(
      "click",
      () => {
        selectedStudentId =
          student.id;

        grid
          .querySelectorAll(
            ".student-claim-card"
          )
          .forEach((card) => {
            const active =
              card.dataset.studentId ===
              selectedStudentId;

            card.classList.toggle(
              "selected",
              active
            );

            card.setAttribute(
              "aria-pressed",
              String(active)
            );
          });

        $("claimConfirmBtn").disabled =
          false;

        $("claimError").hidden =
          true;
      }
    );

    if (
      student.id ===
      selectedStudentId
    ) {
      button.classList.add(
        "selected"
      );
    }

    grid.appendChild(button);
  }

  $("claimConfirmBtn").disabled =
    !selectedStudentId;
}

function openClaimModal() {
  if (
    !latestState.user ||
    claimModalOpen
  ) {
    return;
  }

  claimModalOpen = true;

  const existingId =
    latestState.profile
      ?.claimedStudentId;

  selectedStudentId =
    existingId &&
    students.some(
      (student) =>
        student.id ===
        existingId
    )
      ? existingId
      : null;

  populateClaimGrid();

  $("claimError").hidden =
    true;

  const verification =
    $("claimVerificationNote");

  verification.hidden =
    !verificationMessage;

  verification.textContent =
    verificationMessage;

  $("claimOverlay").hidden =
    false;

  setBodyModalState(true);

  window.requestAnimationFrame(
    () => {
      $(
        ".student-claim-card.selected"
      )?.scrollIntoView({
        block: "nearest",
      });

      if (!selectedStudentId) {
        $("claimGrid")
          ?.querySelector(
            ".student-claim-card"
          )
          ?.focus();
      }
    }
  );
}

function closeClaimModal() {
  claimModalOpen = false;

  $("claimOverlay").hidden =
    true;

  setBodyModalState(
    !$("authOverlay").hidden
  );
}

async function handleClaimConfirm() {
  if (
    !latestState.user ||
    !selectedStudentId
  ) {
    return;
  }

  const student =
    students.find(
      (entry) =>
        entry.id ===
        selectedStudentId
    );

  if (!student) {
    return;
  }

  const button =
    $("claimConfirmBtn");

  button.disabled = true;

  $("claimError").hidden =
    true;

  try {
    await claimStudentIdentity(
      latestState.user.uid,
      student
    );

    verificationMessage = "";

    closeClaimModal();
  } catch (error) {
    console.error(
      "Student identity claim failed:",
      error
    );

    $("claimError").hidden =
      false;

    if (
      error.code ===
      "identity/already-claimed"
    ) {
      $("claimError").textContent =
        "That student is already linked to another account. Pick your own name or ask an admin to verify the directory.";
    } else if (
      error.code ===
      "identity/account-already-claimed"
    ) {
      $("claimError").textContent =
        "This account is already linked to a different student identity.";
    } else if (
      error.code ===
      "permission-denied"
    ) {
      $("claimError").textContent =
        "Firebase rejected the profile link. Make sure the published Firestore rules allow this claim.";
    } else {
      $("claimError").textContent =
        "Couldn't save the profile link right now. Try again.";
    }
  } finally {
    button.disabled =
      !selectedStudentId;
  }
}

function initials(name) {
  if (!name) return "?";

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]
    )
    .join("")
    .toUpperCase();
}

async function handleResendVerification() {
  if (!latestState.user) return;

  const button =
    $("resendVerificationBtn");

  setButtonBusy(
    button,
    true,
    "Sending…"
  );

  try {
    await sendVerificationEmail(
      latestState.user
    );

    $("verificationStatus")
      .hidden = false;

    $("verificationStatus")
      .textContent =
      "Verification email sent again.";
  } catch (error) {
    console.error(
      "Resend verification failed:",
      error
    );

    $("verificationStatus")
      .hidden = false;

    $("verificationStatus")
      .textContent =
      getFriendlyAuthError(
        error
      );
  } finally {
    setButtonBusy(
      button,
      false
    );
  }
}

function renderAuthSlot() {
  const slot =
    $("authSlot");

  if (!slot) return;

  if (latestState.loading) {
    slot.innerHTML =
      `<span class="auth-loading">Checking account…</span>`;
    return;
  }

  if (!latestState.user) {
    slot.innerHTML =
      `<button class="btn btn-primary btn-small" id="signInTriggerBtn" type="button">Sign in</button>`;

    $("signInTriggerBtn").addEventListener(
      "click",
      () =>
        showAuthModal(
          "signin"
        )
    );

    return;
  }

  const {
    user,
    profile,
    admin,
  } = latestState;

  const name =
    profile?.claimedStudentName ||
    user.displayName ||
    user.email ||
    "Account";

  const needsClaim =
    !profile?.claimedStudentId;

  const unverified =
    user.providerData?.some(
      (provider) =>
        provider.providerId ===
        "password"
    ) &&
    !user.emailVerified;

  slot.innerHTML = `
    <div class="nav-item has-dropdown" id="profileItem">
      <button class="profile-pill" id="profileTrigger" type="button" aria-expanded="false" aria-controls="profileDropdown">
        <span class="profile-avatar">${initials(name)}</span>
        <span class="profile-pill-name">${name}</span>
        <span class="tri" aria-hidden="true">▾</span>
      </button>

      <div class="dropdown profile-dropdown" id="profileDropdown">
        <p class="profile-name"></p>
        <p class="profile-email"></p>

        ${admin ? `<span class="admin-pill">Admin</span>` : ""}

        ${
          unverified
            ? `
              <div class="verification-box">
                <span>Email not verified</span>
                <button class="dropdown-action" id="resendVerificationBtn" type="button">
                  Resend verification
                </button>
                <small id="verificationStatus" hidden></small>
              </div>
            `
            : ""
        }

        ${
          needsClaim
            ? `<button class="dropdown-action" id="completeProfileBtn" type="button">Select class identity</button>`
            : ""
        }

        <div class="dropdown-divider"></div>

        <button class="dropdown-action" id="signOutBtn" type="button">
          Sign out
        </button>
      </div>
    </div>
  `;

  $("profileDropdown")
    .querySelector(
      ".profile-name"
    )
    .textContent = name;

  $("profileDropdown")
    .querySelector(
      ".profile-email"
    )
    .textContent =
    user.email || "";

  const item =
    $("profileItem");

  const trigger =
    $("profileTrigger");

  trigger.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      const open =
        item.classList.toggle(
          "open"
        );

      trigger.setAttribute(
        "aria-expanded",
        String(open)
      );
    }
  );

  $("signOutBtn").addEventListener(
    "click",
    async () => {
      try {
        await signOutUser();
      } catch (error) {
        console.error(
          "Sign-out failed:",
          error
        );
      } finally {
        item.classList.remove(
          "open"
        );
      }
    }
  );

  const completeButton =
    $("completeProfileBtn");

  completeButton?.addEventListener(
    "click",
    () => {
      item.classList.remove(
        "open"
      );

      trigger.setAttribute(
        "aria-expanded",
        "false"
      );

      openClaimModal();
    }
  );

  const resendButton =
    $("resendVerificationBtn");

  resendButton?.addEventListener(
    "click",
    handleResendVerification
  );
}

document.addEventListener(
  "click",
  (event) => {
    const item =
      $("profileItem");

    if (
      item &&
      !item.contains(
        event.target
      )
    ) {
      item.classList.remove(
        "open"
      );

      $("profileTrigger")
        ?.setAttribute(
          "aria-expanded",
          "false"
        );
    }
  }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape")
      return;

    if (
      !$("authOverlay").hidden
    ) {
      hideAuthModal();
      return;
    }

    if (claimModalOpen) {
      closeClaimModal();
      return;
    }

    $("profileItem")
      ?.classList.remove(
        "open"
      );
  }
);

export async function initAuthUI() {
  $("authTabs")
    ?.querySelectorAll(
      ".auth-tab"
    )
    .forEach((tab) => {
      tab.addEventListener(
        "click",
        () => {
          setMode(
            tab.dataset.mode
          );
        }
      );
    });

  $("authClose").addEventListener(
    "click",
    hideAuthModal
  );

  $("authForm").addEventListener(
    "submit",
    handleAuthSubmit
  );

  $("googleSignInBtn")
    .addEventListener(
      "click",
      handleGoogleSignIn
    );

  $("forgotPasswordBtn")
    .addEventListener(
      "click",
      () => setMode("reset")
    );

  $("authOverlay")
    .addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          $("authOverlay")
        ) {
          hideAuthModal();
        }
      }
    );

  $("claimClose")
    .addEventListener(
      "click",
      closeClaimModal
    );

  $("claimSkipBtn")
    .addEventListener(
      "click",
      closeClaimModal
    );

  $("claimConfirmBtn")
    .addEventListener(
      "click",
      handleClaimConfirm
    );

  $("claimOverlay")
    .addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          $("claimOverlay")
        ) {
          closeClaimModal();
        }
      }
    );

  initPasswordToggle(
    "passwordToggle",
    "password"
  );

  initPasswordToggle(
    "confirmPasswordToggle",
    "confirmPassword"
  );

  setMode("signin");

  await subscribeAuth(
    (state) => {
      latestState = state;
      renderAuthSlot();

      if (
        !state.loading &&
        state.user &&
        !state.profile
          ?.claimedStudentId &&
        !claimModalOpen &&
        $("authOverlay").hidden
      ) {
        window.setTimeout(
          openClaimModal,
          150
        );
      }
    }
  );
}
