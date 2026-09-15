import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOaFX6jYFLxfH_9zf0XhvwZfTFfxkjUyY",
  authDomain: "8cm.vercel.app",
  projectId: "cm-app-1644e",
  storageBucket: "cm-app-1644e.firebasestorage.app",
  messagingSenderId: "984229007988",
  appId: "1:984229007988:web:cce453b7206aa1d7dd3721"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);
