// ============================================
// Firebase project configuration
// ------------------------------------------------
// Replace every value below with YOUR project's config object, found
// in Firebase console → Project settings → General → Your apps → SDK
// setup and configuration. These values identify the project — they
// are not secret, so this file is safe to commit. Actual access
// control comes from firestore.rules, not from hiding this object.
//
// Before this works you also need to, in the Firebase console:
//   1. Create a project (or use an existing one).
//   2. Build → Authentication → Sign-in method → enable
//      "Google" and "Email/Password".
//   3. Build → Firestore Database → Create database.
//   4. Rules tab → paste in firestore.rules from this project → Publish.
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Persist sessions across refreshes/tabs so onAuthStateChanged in
// auth.js picks the user back up automatically on reload.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});
