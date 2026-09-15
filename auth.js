// ============================================
// 8CM — Authentication & profile logic
// ------------------------------------------------
// UI code (auth-ui.js, assignments.js, announcements.js, events.js)
// imports from here rather than touching Firebase directly, so the
// auth/Firestore surface area stays in one place.
// ============================================
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, isFirebaseConfigured } from "./firebase-config.js";

export { isFirebaseConfigured };

// ------------------------------------------------
// Monitor role
// ------------------------------------------------
// There are only 2 roles in this project: student and monitor. There
// are only ever 3 monitors. Role is NOT a field on users/{uid} — it
// is entirely determined by firestore.rules (see isMonitor() there),
// which is the actual authority. This list is a client-side mirror so
// the UI can react instantly without waiting on an extra Firestore
// read; it must be kept in sync with the allowlist in firestore.rules.
// The dynamic path (a doc at monitors/{uid}) is checked via Firestore
// itself in computeIsMonitor() below, so monitors added later through
// the monitor-management UI are picked up without a code change here.
export const MONITOR_EMAILS = [
  "mohamedishankunnummal@gmail.com",
  // "monitor2@example.com",
  // "monitor3@example.com",
];

function monitorRef(uid) {
  return doc(db, "monitors", uid);
}

// Authoritative-enough for UI purposes: checks the email allowlist
// first (no read needed), then falls back to a single doc read for
// monitors added dynamically. Firestore rules are what actually
// enforce this server-side — this function only controls what
// buttons/panels render.
export async function computeIsMonitor(user) {
  if (!user) return false;
  if (user.email && MONITOR_EMAILS.includes(user.email)) return true;
  try {
    const snap = await getDoc(monitorRef(user.uid));
    return snap.exists();
  } catch (err) {
    console.error("Failed to check monitor status:", err);
    return false;
  }
}

const googleProvider = new GoogleAuthProvider();
// Forces the account chooser every time instead of silently reusing
// whatever Google session is cached, which is what produced confusing
// "something went wrong" retries after a first failed popup.
googleProvider.setCustomParameters({ prompt: "select_account" });

// ------------------------------------------------
// Friendly error messages
// ------------------------------------------------
const ERROR_MESSAGES = {
  "auth/email-already-in-use": "That email already has an account — try signing in instead.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Incorrect password. Try again, or reset it below.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/missing-password": "Enter a password.",
  "auth/popup-closed-by-user": "Sign-in was closed before finishing — try again.",
  "auth/cancelled-popup-request": "Sign-in was interrupted — try again.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup — allow popups for this site and try again.",
  "auth/unauthorized-domain": "This domain isn't authorized for Google sign-in yet — a monitor needs to add it in the Firebase console (Authentication → Settings → Authorized domains).",
  "auth/operation-not-allowed": "Google sign-in isn't enabled for this project yet — a monitor needs to turn it on in the Firebase console.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a bit before trying again.",
  "auth/account-exists-with-different-credential":
    "This email is already linked to Google sign-in. Use \"Continue with Google\" instead.",
  "auth/invalid-api-key": "This site's Firebase project isn't configured yet — see firebase-config.js.",
  "auth/api-key-not-valid": "This site's Firebase project isn't configured yet — see firebase-config.js.",
  "auth/configuration-not-found": "This site's Firebase project isn't configured yet — see firebase-config.js.",
  "auth/app-not-authorized": "This site's Firebase project isn't configured yet — see firebase-config.js.",
  "auth/invalid-app-credential": "This site's Firebase project isn't configured yet — see firebase-config.js.",
};

export function getFriendlyAuthError(error) {
  const code = error && error.code;
  return ERROR_MESSAGES[code] || "Something went wrong. Try again in a moment.";
}

// ------------------------------------------------
// Sign in / up / out
// ------------------------------------------------
export function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signUpEmail(email, password) {
  // No separate "name" input — identity comes from the directory-claim
  // step right after this, so the account's displayName is synced
  // there (see claimStudentIdentity) instead of asked for twice.
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return signOut(auth);
}

// ------------------------------------------------
// Profile documents (users/{uid})
// ------------------------------------------------
function profileRef(uid) {
  return doc(db, "users", uid);
}

export async function getProfile(uid) {
  const snap = await getDoc(profileRef(uid));
  return snap.exists() ? snap.data() : null;
}

// Firestore reads issued the instant onAuthStateChanged fires can hit
// a brief window where the ID token hasn't finished propagating to
// the Firestore SDK's channel yet — especially right after a fresh
// sign-out/sign-in cycle — and come back permission-denied even
// though the rules would normally allow them. subscribeAuth used to
// swallow that as "no profile," which is exactly what made an
// already-claimed account get asked to pick a student all over again
// on every re-login. A couple of short retries absorbs that window.
async function getProfileWithRetry(uid, attempts = 3, baseDelayMs = 200) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await getProfile(uid);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// ------------------------------------------------
// Local claim cache
// ------------------------------------------------
// A same-browser, per-uid memory of the last claimedStudentId this
// account successfully claimed. subscribeAuth below treats this as
// the deciding factor for "has this account already onboarded" any
// time Firestore doesn't hand back a claim on its own (a slow read,
// a permission-propagation stall right after sign-in, a dropped
// retry) — that gap used to mean the picker got shown again on a
// perfectly normal re-sign-in. A real Firestore claim always takes
// priority when it's present; this only fills in when it's missing.
// This is a UI convenience cache only — it is never treated as proof
// of a claim by anything that grants access to data. The claims/{id}
// collection in Firestore is the only source of truth for that.
function claimCacheKey(uid) {
  return `8cm:claimedStudent:${uid}`;
}

function cacheClaim(uid, studentId, studentName) {
  try {
    localStorage.setItem(claimCacheKey(uid), JSON.stringify({ id: studentId, name: studentName }));
  } catch (err) {
    // Private browsing / storage disabled — the cache is a nice-to-have
    // fallback, not something the app depends on to function.
  }
}

function getCachedClaim(uid) {
  try {
    const raw = localStorage.getItem(claimCacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

// Creates a bare profile doc right after signup/first Google sign-in,
// before identity claiming happens. Safe to call repeatedly.
export async function ensureProfileDoc(user) {
  await setDoc(
    profileRef(user.uid),
    {
      email: user.email || "",
      displayName: user.displayName || "",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ------------------------------------------------
// Student identity claiming — claims/{studentId}, doc ID = studentId
// ------------------------------------------------
// Claiming and switching both go through this one transaction so the
// "does anyone else already own this student" check and the write
// that claims it happen atomically — no gap where two accounts can
// both pass the check and then both write. See firestore.rules for
// the server-side half of this guarantee (a create against an
// existing claims/{id} doc is rejected as an unauthorized update).
async function claimTransaction(uid, student, releaseId) {
  const claimRef = doc(db, "claims", student.id);
  const userRef = profileRef(uid);
  const oldClaimRef = releaseId && releaseId !== student.id ? doc(db, "claims", releaseId) : null;

  await runTransaction(db, async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists() && claimSnap.data().uid !== uid) {
      const err = new Error("That student has already been claimed by another account.");
      err.code = "identity/already-claimed";
      throw err;
    }

    if (oldClaimRef) {
      tx.delete(oldClaimRef);
    }

    tx.set(claimRef, {
      uid,
      studentName: student.name,
      claimedAt: serverTimestamp(),
    });

    tx.set(
      userRef,
      {
        claimedStudentId: student.id,
        claimedStudentName: student.name,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function syncDisplayName(uid, name) {
  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await updateProfile(auth.currentUser, { displayName: name });
    } catch (err) {
      console.error("Failed to sync displayName after claim:", err);
    }
  }
}

// Links a Firebase account to one directory entry for the mandatory
// first-time pick. Throws { code: "identity/already-claimed" } if
// someone else got there first, or { code: "identity/already-bound" }
// if THIS account already has a student linked — from here on,
// changing it is switchStudentIdentity's job (the explicit "Switch
// student" action), not this function's.
export async function claimStudentIdentity(uid, student, currentProfile) {
  if (currentProfile && currentProfile.claimedStudentId && currentProfile.claimedStudentId !== student.id) {
    const err = new Error("This account is already permanently linked to a different student.");
    err.code = "identity/already-bound";
    throw err;
  }

  await claimTransaction(uid, student, null);
  cacheClaim(uid, student.id, student.name);
  await syncDisplayName(uid, student.name);
}

// Changes an ALREADY-claimed account to a different student, on
// purpose — this is the explicit "Switch student" action, distinct
// from claimStudentIdentity above (which is the mandatory first-time
// pick and refuses to overwrite an existing claim). Still refuses if
// someone else already has the target student linked. Releases the
// previous claims/{id} doc in the same transaction so a student can
// never end up owning two identities, and no window opens where the
// old identity is claimed by no one and free for a race.
export async function switchStudentIdentity(uid, student, currentProfile) {
  const releaseId = currentProfile && currentProfile.claimedStudentId;
  await claimTransaction(uid, student, releaseId || null);
  cacheClaim(uid, student.id, student.name);
  await syncDisplayName(uid, student.name);
}

// Saves the picked accent color to the user's profile doc so it
// follows them to other devices. Called from theme.js, debounced by
// nothing in particular — a color input fires often, but a merge
// write of one small field is cheap and last-write-wins is fine here.
export async function saveThemePreference(uid, theme) {
  await setDoc(profileRef(uid), { theme, updatedAt: serverTimestamp() }, { merge: true });
}

// ------------------------------------------------
// Global auth state
// ------------------------------------------------
// callback receives { user, profile, monitor }. `user` is the raw
// Firebase user (or null when signed out); `profile` is the Firestore
// users/{uid} doc (or null until it loads / if it doesn't exist yet);
// `monitor` is a UI-only convenience flag — see computeIsMonitor().
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null, monitor: false });
      return;
    }

    let profile = null;
    try {
      profile = await getProfileWithRetry(user.uid);
    } catch (err) {
      console.error("Failed to load profile after retries:", err);
    }

    // The single source of truth for "has this account already picked
    // a student" is meant to be Firestore's claimedStudentId — but a
    // signed-in user should NEVER see the picker again once they've
    // completed it on this browser, full stop, regardless of whether
    // this particular Firestore read came back clean, came back
    // without the field due to a propagation lag, or failed outright.
    // So: if Firestore didn't give us a claim but this browser has
    // already seen this uid claim one, trust the cache instead of
    // re-opening the picker. A genuine Firestore claim always wins
    // when it's present — this only fills the gap when it's absent.
    if (!profile || !profile.claimedStudentId) {
      const cached = getCachedClaim(user.uid);
      if (cached) {
        profile = { ...(profile || {}), claimedStudentId: cached.id, claimedStudentName: cached.name };
      }
    }

    if (profile && profile.claimedStudentId) {
      cacheClaim(user.uid, profile.claimedStudentId, profile.claimedStudentName);
    }

    const monitor = await computeIsMonitor(user);
    callback({ user, profile, monitor });
  });
}
