// ============================================
// 8CM — Authentication & profile logic
// ------------------------------------------------
// UI code (auth-ui.js, tasks.js) imports from here rather than
// touching Firebase directly, so the auth/Firestore surface area
// stays in one place.
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
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// This must match the email allow-listed in firestore.rules for the
// tasks collection. Keeping it here too lets the UI hide admin
// controls for everyone else — the rules file is what actually
// enforces it server-side.
export const ADMIN_EMAIL = "mohamedishankunnummal@gmail.com";

const googleProvider = new GoogleAuthProvider();

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
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a bit before trying again.",
  "auth/account-exists-with-different-credential":
    "This email is already linked to Google sign-in. Use \"Continue with Google\" instead.",
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

export async function signUpEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
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

export function computeIsAdmin(user, profile) {
  if (!user) return false;
  if (user.email === ADMIN_EMAIL) return true;
  return !!(profile && profile.admin === true);
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

// Returns the uid that already claimed this student, or null if free.
export async function findExistingClaim(studentId) {
  const q = query(collection(db, "users"), where("claimedStudentId", "==", studentId));
  const snap = await getDocs(q);
  let claimedBy = null;
  snap.forEach((docSnap) => {
    claimedBy = docSnap.id;
  });
  return claimedBy;
}

// Links a Firebase account to one directory entry. Throws
// { code: "identity/already-claimed" } if someone else got there first.
export async function claimStudentIdentity(uid, student) {
  const existing = await findExistingClaim(student.id);
  if (existing && existing !== uid) {
    const err = new Error("That student has already been claimed by another account.");
    err.code = "identity/already-claimed";
    throw err;
  }

  await setDoc(
    profileRef(uid),
    {
      claimedStudentId: student.id,
      claimedStudentName: student.name,
      admin: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ------------------------------------------------
// Global auth state
// ------------------------------------------------
// callback receives { user, profile, admin }. `user` is the raw
// Firebase user (or null when signed out); `profile` is the Firestore
// users/{uid} doc (or null until it loads / if it doesn't exist yet).
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null, admin: false });
      return;
    }

    let profile = null;
    try {
      profile = await getProfile(user.uid);
    } catch (err) {
      console.error("Failed to load profile:", err);
    }

    callback({ user, profile, admin: computeIsAdmin(user, profile) });
  });
}
