// The one Firebase entry point: Firestore only (no Auth, no Storage).
// The config below is public client config, not a secret — access control lives in firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDOaFX6jYFLxfH_9zf0XhvwZfTFfxkjUyY",
  projectId: "cm-app-1644e",
  appId: "1:984229007988:web:cce453b7206aa1d7dd3721",
});

// Local cache lets pages paint from what is already on the device; falls back to in-memory.
export const db = (() => {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (err) {
    console.error("[8CM] Persistent Firestore cache unavailable, falling back to in-memory:", err);
    return getFirestore(app);
  }
})();
