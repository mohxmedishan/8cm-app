// ============================================
// 8CM — Gallery (public view + admin upload)
// ------------------------------------------------
// The grid is built from two sources, rendered through one code path:
//   1. gallerySeed — the original hand-picked photos, baked in as data.
//   2. the Firestore `gallery` collection — anything an admin uploads
//      through the "+ Add photo" form, live via onSnapshot for every
//      visitor (no sign-in required to see them — see firestore.rules).
// Uploads go to Firebase Storage at gallery/<timestamp>-<filename>;
// the Firestore doc just stores the resulting URL + caption + the
// storage path (so a delete can clean up the file, not just the doc).
// ============================================
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { gallerySeed } from "./gallery-seed.js";

const $ = (id) => document.getElementById(id);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

let isCurrentAdmin = false;
let uploadedPhotos = []; // Firestore-backed, newest last (see orderBy below)

function figureMarkup(photo) {
  const deleteBtn =
    photo.docId && isCurrentAdmin
      ? `<button type="button" class="gallery-delete-btn admin-only" data-id="${photo.docId}" data-path="${photo.storagePath || ""}" aria-label="Delete photo">✕</button>`
      : "";
  return `
    <figure class="gallery-photo" tabindex="0" role="button" aria-label="View larger photo: ${photo.caption || photo.alt || ""}">
      <img src="${photo.src}" alt="${photo.alt || photo.caption || ""}" loading="lazy">
      <figcaption>${photo.caption || ""}</figcaption>
      ${deleteBtn}
    </figure>
  `;
}

function renderGallery() {
  const grid = $("galleryGrid");
  if (!grid) return;

  const seedMarkup = gallerySeed.map((p) => figureMarkup(p)).join("");
  const uploadedMarkup = uploadedPhotos
    .map((p) => figureMarkup({ src: p.url, alt: p.caption, caption: p.caption, docId: p.id, storagePath: p.path }))
    .join("");

  grid.innerHTML = seedMarkup + uploadedMarkup;

  grid.querySelectorAll(".gallery-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // don't also open the lightbox
      handleDeletePhoto(btn.dataset.id, btn.dataset.path);
    });
  });
}

function startGalleryListener() {
  const q = query(collection(db, "gallery"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      uploadedPhotos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderGallery();
    },
    (err) => {
      console.error("Failed to load gallery uploads:", err);
    }
  );
}

async function handleDeletePhoto(docId, storagePath) {
  if (!confirm("Delete this photo?")) return;
  try {
    await deleteDoc(doc(db, "gallery", docId));
    if (storagePath) {
      await deleteObject(ref(storage, storagePath)).catch((err) => {
        // The Firestore doc is already gone — a leftover file in
        // Storage isn't ideal but isn't user-visible either, so this
        // doesn't need to block or alarm anyone.
        console.error("Failed to delete storage file:", err);
      });
    }
  } catch (err) {
    console.error("Delete failed:", err);
    alert("Couldn't delete that photo — check your admin access and try again.");
  }
}

function setUploadError(message) {
  const el = $("galleryUploadError");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function openUploadForm() {
  const form = $("galleryUploadForm");
  if (!form) return;
  form.hidden = false;
  setUploadError(null);
}

function closeUploadForm() {
  const form = $("galleryUploadForm");
  if (!form) return;
  form.reset();
  form.hidden = true;
  setUploadError(null);
}

function sanitizeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const caption = form.caption.value.trim();
  const file = form.photo.files[0];

  if (!caption || !file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    setUploadError("Only PNG or JPG images are allowed.");
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    setUploadError("That photo is too large — 8MB max.");
    return;
  }

  const submitBtn = $("galleryUploadSubmit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading…";
  setUploadError(null);

  try {
    const path = `gallery/${Date.now()}-${sanitizeFilename(file.name)}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await addDoc(collection(db, "gallery"), {
      url,
      caption,
      path,
      createdAt: serverTimestamp(),
    });

    closeUploadForm();
  } catch (err) {
    console.error("Gallery upload failed:", err);
    setUploadError("Couldn't upload that photo — check your admin access and try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload";
  }
}

export function initGallery() {
  renderGallery(); // seed photos show immediately, before Firestore responds
  startGalleryListener();

  subscribeAuth(({ admin }) => {
    isCurrentAdmin = admin;
    renderGallery(); // re-render so delete buttons appear/disappear with admin state
  });

  const addBtn = $("addPhotoBtn");
  if (addBtn) addBtn.addEventListener("click", openUploadForm);

  const form = $("galleryUploadForm");
  if (form) {
    form.addEventListener("submit", handleUploadSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", closeUploadForm);
  }
}
