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
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFirebaseAuth,
  getFirebaseDb,
} from "./firebase-config.js";

export const ADMIN_EMAIL = "mohamedishankunnummal@gmail.com";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const ERROR_MESSAGES = {
  "auth/email-already-in-use": "That email already has an account. Try signing in instead.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/user-not-found": "No account was found with that email.",
  "auth/wrong-password": "Incorrect password. Try again, or reset it below.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/missing-password": "Enter a password.",
  "auth/popup-closed-by-user": "Sign-in was closed before it finished. Try again.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "auth/cancelled-popup-request": "Sign-in was interrupted. Try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a bit before trying again.",
  "auth/account-exists-with-different-credential": "That email is already linked to another sign-in method. Use the method you originally registered with.",
  "auth/operation-not-allowed": "That sign-in method is not enabled in Firebase Authentication yet.",
};

export function getFriendlyAuthError(error) {
  return ERROR_MESSAGES[error?.code] || "Something went wrong. Try again in a moment.";
}

async function waitForPersistence() {
  await authPersistenceReady;
}

export async function signInGoogle() {
  await waitForPersistence();
  return signInWithPopup(auth, googleProvider);
}

export async function signUpEmail(email, password, displayName) {
  await waitForPersistence();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
}

export async function signInEmail(email, password) {
  await waitForPersistence();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email) {
  await waitForPersistence();
  return sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

function profileRef(uid) {
  return doc(db, "users", uid);
}

export async function getProfile(uid) {
  const snap = await getDoc(profileRef(uid));
  return snap.exists() ? snap.data() : null;
}

export function computeIsAdmin(user, profile) {
  if (!user) return false;
  const normalizedEmail = (user.email || "").trim().toLowerCase();
  return normalizedEmail === ADMIN_EMAIL || profile?.admin === true;
}

export async function ensureProfileDoc(user) {
  if (!user) return null;

  const existing = await getProfile(user.uid);
  const payload = {
    email: user.email || "",
    displayName: user.displayName || "",
    updatedAt: serverTimestamp(),
  };

  if (!existing) {
    payload.admin = false;
  }

  await setDoc(profileRef(user.uid), payload, { merge: true });
  return getProfile(user.uid);
}

export async function findExistingClaim(studentId) {
  const q = query(collection(db, "users"), where("claimedStudentId", "==", studentId));
  const snap = await getDocs(q);

  for (const docSnap of snap.docs) {
    return docSnap.id;
  }
  return null;
}

export async function claimStudentIdentity(uid, student) {
  const existing = await findExistingClaim(student.id);
  if (existing && existing !== uid) {
    const error = new Error("That student has already been claimed by another account.");
    error.code = "identity/already-claimed";
    throw error;
  }

  const claimRef = doc(db, "studentClaims", student.id);
  const userRef = profileRef(uid);

  await runTransaction(db, async (transaction) => {
    const [claimSnap, userSnap] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userRef),
    ]);

    if (!userSnap.exists()) {
      const error = new Error("Your profile has not finished initializing yet.");
      error.code = "identity/profile-not-found";
      throw error;
    }

    const currentProfile = userSnap.data();
    if (currentProfile.claimedStudentId && currentProfile.claimedStudentId !== student.id) {
      const error = new Error("This account is already linked to a different student.");
      error.code = "identity/account-already-claimed";
      throw error;
    }

    if (claimSnap.exists() && claimSnap.data().uid !== uid) {
      const error = new Error("That student has already been claimed by another account.");
      error.code = "identity/already-claimed";
      throw error;
    }

    transaction.set(
      claimRef,
      {
        uid,
        createdAt: claimSnap.exists() ? claimSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
      },
      { merge: false }
    );

    transaction.set(
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

export function subscribeAuth(callback) {
  callback({ loading: true, user: null, profile: null, admin: false });

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ loading: false, user: null, profile: null, admin: false });
      return;
    }

    let profile = null;
    try {
      profile = await getProfile(user.uid);
      if (!profile) {
        profile = await ensureProfileDoc(user);
      }
    } catch (error) {
      console.error("Failed to load account profile:", error);
    }

    callback({
      loading: false,
      user,
      profile,
      admin: computeIsAdmin(user, profile),
    });
  });
}
