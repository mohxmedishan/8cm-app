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
  apiKey: "AIzaSyDOaFX6jYFLxfH_9zf0XhvwZfTFfxkjUyY",
  authDomain: "cm-app-1644e.firebaseapp.com",
  projectId: "cm-app-1644e",
  storageBucket: "cm-app-1644e.firebasestorage.app",
  messagingSenderId: "984229007988",
  appId: "1:984229007988:web:cce453b7206aa1d7dd3721",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Persist sessions across refreshes/tabs so onAuthStateChanged in
// auth.js picks the user back up automatically on reload.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});
