import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
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
googleProvider.setCustomParameters({
  prompt: "select_account",
});

const ERROR_MESSAGES = {
  "auth/email-already-in-use":
    "That email already has an account. Try signing in instead.",
  "auth/invalid-email":
    "That doesn't look like a valid email address.",
  "auth/user-not-found":
    "No account was found with that email.",
  "auth/wrong-password":
    "Incorrect password. Try again, or reset it below.",
  "auth/invalid-credential":
    "Incorrect email or password.",
  "auth/weak-password":
    "Password should be at least 6 characters.",
  "auth/missing-password":
    "Enter a password.",
  "auth/popup-closed-by-user":
    "Google sign-in was closed before it finished. Try again.",
  "auth/popup-blocked":
    "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/cancelled-popup-request":
    "The Google sign-in request was interrupted. Try again.",
  "auth/network-request-failed":
    "Network error. Check your connection and try again.",
  "auth/too-many-requests":
    "Too many attempts. Wait a bit before trying again.",
  "auth/account-exists-with-different-credential":
    "That email is already linked to another sign-in method. Use the method you originally registered with.",
  "auth/operation-not-allowed":
    "That sign-in method is not enabled in Firebase Authentication yet.",
  "auth/user-disabled":
    "This account has been disabled. Contact an administrator.",
  "auth/requires-recent-login":
    "Please sign in again before performing that action.",
};

export function getFriendlyAuthError(error) {
  return (
    ERROR_MESSAGES[error?.code] ||
    "Something went wrong. Try again in a moment."
  );
}

export async function signInGoogle() {
  const auth = await getFirebaseAuth();
  return signInWithPopup(auth, googleProvider);
}

export async function signInEmail(email, password) {
  const auth = await getFirebaseAuth();
  return signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function signUpEmail(
  email,
  password,
  displayName
) {
  const auth = await getFirebaseAuth();

  const credential =
    await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

  if (displayName) {
    await updateProfile(credential.user, {
      displayName,
    });
  }

  return credential;
}

export async function sendVerificationEmail(user) {
  if (!user) {
    throw new Error(
      "There is no signed-in account to verify."
    );
  }

  await sendEmailVerification(user);
}

export async function resetPassword(email) {
  const auth = await getFirebaseAuth();

  return sendPasswordResetEmail(
    auth,
    email
  );
}

export async function signOutUser() {
  const auth = await getFirebaseAuth();
  return signOut(auth);
}

export async function getProfile(uid) {
  const db = await getFirebaseDb();

  const snapshot = await getDoc(
    doc(db, "users", uid)
  );

  return snapshot.exists()
    ? snapshot.data()
    : null;
}

export function computeIsAdmin(user, profile) {
  if (!user) return false;

  const normalizedEmail =
    (user.email || "")
      .trim()
      .toLowerCase();

  return (
    normalizedEmail === ADMIN_EMAIL ||
    profile?.admin === true
  );
}

export async function ensureProfileDoc(user) {
  if (!user) return null;

  const db = await getFirebaseDb();
  const ref = doc(db, "users", user.uid);

  const snapshot = await getDoc(ref);

  const profileData = {
    email: user.email || "",
    displayName: user.displayName || "",
    updatedAt: serverTimestamp(),
  };

  if (!snapshot.exists()) {
    profileData.admin = false;
    profileData.createdAt = serverTimestamp();
  }

  await setDoc(
    ref,
    profileData,
    { merge: true }
  );

  const updated = await getDoc(ref);

  return updated.exists()
    ? updated.data()
    : null;
}

export async function findExistingClaim(studentId) {
  const db = await getFirebaseDb();

  const claimQuery = query(
    collection(db, "studentClaims"),
    where("studentId", "==", studentId)
  );

  const snapshot = await getDocs(
    claimQuery
  );

  return snapshot.empty
    ? null
    : snapshot.docs[0].data().uid || null;
}

export async function claimStudentIdentity(
  uid,
  student
) {
  const db = await getFirebaseDb();

  const existing =
    await findExistingClaim(
      student.id
    );

  if (
    existing &&
    existing !== uid
  ) {
    const error = new Error(
      "That student has already been claimed by another account."
    );

    error.code =
      "identity/already-claimed";

    throw error;
  }

  const claimRef = doc(
    db,
    "studentClaims",
    student.id
  );

  const userRef = doc(
    db,
    "users",
    uid
  );

  await runTransaction(
    db,
    async (transaction) => {
      const claimSnapshot =
        await transaction.get(
          claimRef
        );

      const userSnapshot =
        await transaction.get(
          userRef
        );

      if (!userSnapshot.exists()) {
        const error = new Error(
          "Your account profile has not finished initializing yet."
        );

        error.code =
          "identity/profile-not-found";

        throw error;
      }

      const profile =
        userSnapshot.data();

      if (
        profile.claimedStudentId &&
        profile.claimedStudentId !==
          student.id
      ) {
        const error = new Error(
          "This account is already linked to a different student."
        );

        error.code =
          "identity/account-already-claimed";

        throw error;
      }

      if (
        claimSnapshot.exists() &&
        claimSnapshot.data().uid !== uid
      ) {
        const error = new Error(
          "That student is already claimed by another account."
        );

        error.code =
          "identity/already-claimed";

        throw error;
      }

      transaction.set(
        claimRef,
        {
          uid,
          studentId: student.id,
          studentName: student.name,
          createdAt:
            claimSnapshot.exists()
              ? claimSnapshot.data()
                  .createdAt ||
                serverTimestamp()
              : serverTimestamp(),
        }
      );

      transaction.set(
        userRef,
        {
          claimedStudentId:
            student.id,
          claimedStudentName:
            student.name,
          updatedAt:
            serverTimestamp(),
        },
        { merge: true }
      );
    }
  );
}

export async function subscribeAuth(
  callback
) {
  callback({
    loading: true,
    user: null,
    profile: null,
    admin: false,
  });

  let auth;

  try {
    auth = await getFirebaseAuth();
  } catch (error) {
    console.error(
      "Firebase Auth unavailable:",
      error
    );

    callback({
      loading: false,
      user: null,
      profile: null,
      admin: false,
      error,
    });

    return null;
  }

  return onAuthStateChanged(
    auth,
    async (user) => {
      if (!user) {
        callback({
          loading: false,
          user: null,
          profile: null,
          admin: false,
        });

        return;
      }

      let profile = null;

      try {
        profile =
          await getProfile(
            user.uid
          );

        if (!profile) {
          profile =
            await ensureProfileDoc(
              user
            );
        }
      } catch (error) {
        console.error(
          "Profile load failed:",
          error
        );
      }

      callback({
        loading: false,
        user,
        profile,
        admin:
          computeIsAdmin(
            user,
            profile
          ),
      });
    }
  );
}
