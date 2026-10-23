// Firestore only (no Auth). Public client config — not a secret; access control lives in firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyDOaFX6jYFLxfH_9zf0XhvwZfTFfxkjUyY",
  projectId: "cm-app-1644e",
  appId: "1:984229007988:web:cce453b7206aa1d7dd3721",
});
export const db = getFirestore(app);
