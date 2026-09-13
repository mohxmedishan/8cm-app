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
//
// No Firebase Storage here on purpose — it isn't included on the
// Spark (free) plan. Task attachments and gallery photos are instead
// stored as base64 strings directly on Firestore documents (see the
// comments in tasks.js, gallery.js, and file-utils.js for how that
// works and what it caps file sizes at). Firestore alone is what
// firestore.rules needs to protect; there's no separate Storage
// rules file to keep in sync with it anymore.
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
  authDomain: "8cm.vercel.app",
  projectId: "cm-app-1644e",
  messagingSenderId: "984229007988",
  appId: "1:984229007988:web:cce453b7206aa1d7dd3721",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Loudly flag the template placeholders instead of letting every auth
// call fail with an opaque "something went wrong" — this is what was
// actually happening: no code bug, just no real project wired up yet.
export const isFirebaseConfigured = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("REPLACE_WITH_")
);
if (!isFirebaseConfigured) {
  console.error(
    "[8CM] firebase-config.js still has placeholder values — every sign-in/sign-up call will fail until you paste in your real project config from Firebase console → Project settings → General → Your apps → SDK setup and configuration."
  );
}

// Persist sessions across refreshes/tabs so onAuthStateChanged in
// auth.js picks the user back up automatically on reload.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

// ------------------------------------------------
// Note on Google sign-in popups (signInWithPopup)
// ------------------------------------------------
// If Google sign-in intermittently fails with "auth/popup-closed-by-user"
// even though nobody closed anything, the usual root cause is a strict
// default Cross-Origin-Opener-Policy ("same-origin") on this page's own
// response headers — it silently severs the window handle Firebase
// needs to watch the popup, which the SDK then reports as the user
// having closed it. firebase.json in this project sets
// "Cross-Origin-Opener-Policy: same-origin-allow-popups" for Firebase
// Hosting; if this site is served from somewhere else (Netlify,
// Vercel, nginx, etc.), that same header needs to be set there instead
// — it can't be set from a <meta> tag, only from the actual HTTP
// response. Also double-check authDomain above matches this site's
// real domain, and that the domain is listed under Authentication →
// Settings → Authorized domains in the Firebase console.
