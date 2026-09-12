import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function loadFirebaseConfig() {
  const response = await fetch("/api/firebase-config", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    let details = "The Firebase configuration endpoint is unavailable.";
    try {
      const payload = await response.json();
      if (payload && payload.error) details = payload.error;
      if (Array.isArray(payload && payload.missing) && payload.missing.length) {
        details += ` Missing environment values: ${payload.missing.join(", ")}.`;
      }
    } catch {
      // Preserve fallback
    }
    throw new Error(details);
  }

  const config = await response.json();
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Firebase configuration is incomplete. Missing: ${missing.join(", ")}.`);
  }
  return config;
}

export const firebaseConfig = await loadFirebaseConfig();
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
