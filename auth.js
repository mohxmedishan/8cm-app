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
  getDocs,
  setDoc,
  deleteDoc,
  collection,
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
  "shahbazshamsudheen713596@gmail.com",
];

function monitorRef(uid) {
  return doc(db, "monitors", uid);
}

// ------------------------------------------------
// Monitor invites (add-by-Gmail)
// ------------------------------------------------
// A second onboarding path alongside the bootstrap email list and the
// monitors/{uid} doc: a monitor can grant the role to a Gmail address
// before that person has ever signed in. See firestore.rules for why
// the doc is keyed by the lowercased email itself rather than a uid,
// and for the real (server-side) @gmail.com restriction — the check
// here is just what lets the "Add monitor" form give a friendly error
// instead of a raw permission-denied.
function inviteRef(email) {
  return doc(db, "monitorInvites", email);
}

/** Lowercases/trims and requires an @gmail.com address; null otherwise. */
export function normalizeMonitorEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^@\s]+@gmail\.com$/.test(email) ? email : null;
}

export async function inviteMonitor(email, invitedBy) {
  const normalized = normalizeMonitorEmail(email);
  if (!normalized) {
    const err = new Error("Enter a valid @gmail.com address.");
    err.code = "monitor-invite/invalid-email";
    throw err;
  }
  await setDoc(inviteRef(normalized), {
    email: normalized,
    invitedByEmail: (invitedBy && invitedBy.email) || "",
    invitedByUid: (invitedBy && invitedBy.uid) || "",
    invitedAt: serverTimestamp(),
  });
  return normalized;
}

export async function revokeMonitorInvite(email) {
  const normalized = normalizeMonitorEmail(email) || String(email || "").trim().toLowerCase();
  await deleteDoc(inviteRef(normalized));
}

// One-time fetch (not live) of every invited-by-email monitor —
// there are only ever a couple of these, so a snapshot on demand is
// simpler than a standing listener nobody asked to keep open.
export async function listMonitorInvites() {
  const snap = await getDocs(collection(db, "monitorInvites"));
  return snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""));
}

/**
 * The full "who are the monitors" list for the public panel at the
 * bottom of the main page: the permanent bootstrap emails (already
 * shipped in this file's own source, so listing them here reveals
 * nothing new) plus every active invite. Deliberately does not
 * include monitors/{uid} docs — that collection requires sign-in to
 * read, so an anonymous visitor's request would just fail; the
 * invite path is the one meant for onboarding additional monitors
 * going forward anyway.
 */
export async function getMonitorDirectory() {
  const invites = await listMonitorInvites().catch((err) => {
    console.error("Failed to load monitor invites:", err);
    return [];
  });
  const bootstrap = MONITOR_EMAILS.map((email) => ({ email, builtIn: true }));
  return [...bootstrap, ...invites.map((i) => ({ ...i, builtIn: false }))];
}

// Authoritative-enough for UI purposes: checks the email allowlist
// first (no read needed), then falls back to a single doc read for
// monitors added dynamically. Firestore rules are what actually
// enforce this server-side — this function only controls what
// buttons/panels render.
function emailMatchesAllowlist(user) {
  const candidates = [user.email, user.providerData?.[0]?.email]
    .filter(Boolean)
    .map((e) => e.toLowerCase().trim());
  const allow = MONITOR_EMAILS.map((e) => e.toLowerCase().trim());
  return candidates.some((e) => allow.includes(e));
}

export async function computeIsMonitor(user) {
  if (!user) return false;
  if (emailMatchesAllowlist(user)) return true;
  try {
    const snap = await getDoc(monitorRef(user.uid));
    if (snap.exists()) return true;
    // Also honor a monitor: true flag on the user's own profile doc.
    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists() && profile.data().monitor === true) return true;
    // Also honor a standing invite for this account's email — see
    // inviteMonitor() above and isInvitedMonitorEmail() in
    // firestore.rules, which is the actual authority; this just lets
    // the UI light up immediately on the invited person's first
    // sign-in instead of waiting on a page reload.
    const email = normalizeMonitorEmail(user.email);
    if (email) {
      const invite = await getDoc(doc(db, "monitorInvites", email));
      if (invite.exists()) return true;
    }
    return false;
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
// Claiming and switching both go through this one function so the
// "does anyone else already own this student" check and the write
// that claims it happen atomically — no gap where two accounts can
// both pass the check and then both write. See firestore.rules for
// the server-side half of this guarantee (a create against an
// existing claims/{id} doc is rejected as an unauthorized update).
// The users/{uid} profile mirror is written separately afterward —
// see the comment inside claimTransaction for why.
async function claimTransaction(uid, student, releaseId) {
  const claimRef = doc(db, "claims", student.id);
  const userRef = profileRef(uid);
  const oldClaimRef = releaseId && releaseId !== student.id ? doc(db, "claims", releaseId) : null;

  // This only touches the claims/ collection. It's kept as a
  // transaction so the "is this student already taken" read and the
  // write that claims it stay atomic — that's the anti-race guarantee
  // (see firestore.rules). The users/{uid} mirror write used to live
  // in this same transaction, but firestore.rules validates it with
  // get(claims/{id}).data.uid == request.auth.uid, and a get() inside
  // a transaction can't see that transaction's own not-yet-committed
  // writes. That made every claim attempt fail with a permission
  // error no matter which student was picked. Writing the claim doc
  // first and committing it, THEN mirroring it onto the profile as a
  // separate write, means the rule's get() sees an already-committed
  // claims/{id} doc and passes.
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
  });

  await setDoc(
    userRef,
    {
      claimedStudentId: student.id,
      claimedStudentName: student.name,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
  patchSharedProfile({ claimedStudentId: student.id, claimedStudentName: student.name });
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
  patchSharedProfile({ claimedStudentId: student.id, claimedStudentName: student.name });
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
// Global auth state — one shared subscription, broadcast to everyone
// ------------------------------------------------
// Every page module (auth-ui.js, profile-modal.js, dashboard.js, and
// a dozen others) calls subscribeAuth(callback) independently. This
// used to create a SEPARATE onAuthStateChanged listener per caller,
// each keeping its own private copy of {user, profile, monitor}.
//
// A claim or switch is a Firestore write, not a Firebase auth-state
// change, so it never re-fires onAuthStateChanged at all — none of
// those private copies would ever hear about a freshly-claimed
// identity on their own. auth-ui.js worked around this for itself by
// manually splicing the new claimedStudentId into its own local copy
// right after a successful claim. But that patch was local to
// auth-ui.js: every OTHER module (profile-modal.js's "Change avatar" /
// "Switch student" row included) kept showing the pre-claim profile
// — with no claimedStudentId — until the page was fully reloaded,
// which is the only thing that re-runs onAuthStateChanged from
// scratch and re-fetches a fresh profile. That's why a student who
// just claimed and immediately opened "View profile" in the same
// session wouldn't see "Change" on their own avatar, even though
// someone whose session had already survived a reload since their
// claim looked completely normal.
//
// Fix: keep ONE shared state object and ONE underlying Firebase
// listener, and broadcast every update — including an in-place claim
// patch — to every subscriber at once.
let sharedAuthState = { user: null, profile: null, monitor: false };
let authStateReady = false;
const authListeners = new Set();
let firebaseListenerStarted = false;

function broadcastAuthState() {
  authListeners.forEach((callback) => {
    try {
      callback(sharedAuthState);
    } catch (err) {
      console.error("subscribeAuth callback error:", err);
    }
  });
}

function startFirebaseAuthListener() {
  if (firebaseListenerStarted) return;
  firebaseListenerStarted = true;

  let initial = true;
  let nullTimer = null;

  onAuthStateChanged(auth, async (user) => {
    if (nullTimer) { clearTimeout(nullTimer); nullTimer = null; }

    if (!user && initial) {
      initial = false;
      nullTimer = setTimeout(() => {
        nullTimer = null;
        if (!auth.currentUser) {
          sharedAuthState = { user: null, profile: null, monitor: false };
          authStateReady = true;
          broadcastAuthState();
        }
      }, 500);
      return;
    }
    initial = false;

    if (!user) {
      sharedAuthState = { user: null, profile: null, monitor: false };
      authStateReady = true;
      broadcastAuthState();
      return;
    }

    let profile = null;
    try {
      profile = await getProfileWithRetry(user.uid);
    } catch (err) {
      console.error("Failed to load profile after retries:", err);
    }

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
    sharedAuthState = { user, profile, monitor };
    authStateReady = true;
    broadcastAuthState();
  });
}

// callback receives { user, profile, monitor }. `user` is the raw
// Firebase user (or null when signed out); `profile` is the Firestore
// users/{uid} doc (or null until it loads / if it doesn't exist yet);
// `monitor` is a UI-only convenience flag — see computeIsMonitor().
// A late subscriber (a module that mounts after the first auth event
// already fired) is caught up immediately with the current state
// instead of waiting for the next Firebase event, which may never come.
export function subscribeAuth(callback) {
  startFirebaseAuthListener();
  authListeners.add(callback);
  if (authStateReady) callback(sharedAuthState);
  return () => authListeners.delete(callback);
}

// Merges a patch into the current shared profile and immediately
// notifies every subscribeAuth listener in every module — this is
// what makes a freshly-claimed identity show up everywhere right
// away instead of only in whichever module happened to trigger the
// claim. See the comment above subscribeAuth for the full story.
function patchSharedProfile(patch) {
  sharedAuthState = {
    ...sharedAuthState,
    profile: { ...(sharedAuthState.profile || {}), ...patch },
  };
  broadcastAuthState();
}
