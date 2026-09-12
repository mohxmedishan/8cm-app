import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseInitPromise = null;

async function loadFirebaseConfig() {
  const response = await fetch("/api/firebase-config", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Firebase configuration could not be loaded.";

    try {
      const data = await response.json();

      if (data?.error) {
        message = data.error;
      }

      if (Array.isArray(data?.missing) && data.missing.length > 0) {
        message += ` Missing: ${data.missing.join(", ")}.`;
      }
    } catch {
      // Keep the default error message.
    }

    throw new Error(message);
  }

  const config = await response.json();

  const required = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];

  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Firebase configuration is incomplete. Missing: ${missing.join(", ")}.`
    );
  }

  return config;
}

export async function initializeFirebase() {
  if (firebaseInitPromise) {
    return firebaseInitPromise;
  }

  firebaseInitPromise = (async () => {
    const config = await loadFirebaseConfig();

    firebaseApp = initializeApp(config);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);

    await setPersistence(firebaseAuth, browserLocalPersistence);

    return {
      app: firebaseApp,
      auth: firebaseAuth,
      db: firebaseDb,
    };
  })();

  try {
    return await firebaseInitPromise;
  } catch (error) {
    firebaseInitPromise = null;
    throw error;
  }
}

export async function getFirebaseAuth() {
  if (!firebaseAuth) {
    await initializeFirebase();
  }

  return firebaseAuth;
}

export async function getFirebaseDb() {
  if (!firebaseDb) {
    await initializeFirebase();
  }

  return firebaseDb;
}
