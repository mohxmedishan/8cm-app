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
//
// Uploading uses uploadFileWithProgress (file-utils.js) instead of a
// bare uploadBytes() call: it reports real progress for the bar below
// the form, and — the actual fix for the old "stuck on Uploading…"
// bug — it guarantees the promise always settles, even if the
// transfer stalls, by cancelling and rejecting after a timeout.
// ============================================
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
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
import { sanitizeFilename, uploadFileWithProgress } from "./file-utils.js";
import { createDropzone } from "./dropzone.js";
import { confirmDelete } from "./confirm-modal.js";

const $ = (id) => document.getElementById(id);

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

let isCurrentAdmin = false;
let uploadedPhotos = []; // Firestore-backed, newest last (see orderBy below)
let photoDropzone = null;

function figureMarkup(photo) {
  const deleteBtn =
    photo.docId && isCurrentAdmin
      ? `<button type="button" class="gallery-delete-btn admin-only" data-id="${photo.docId}" data-path="${photo.storagePath || ""}" data-caption="${(photo.caption || "").replace(/"/g, "&quot;")}" aria-label="Delete photo">✕ Delete</button>`
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
      handleDeletePhoto(btn.dataset.id, btn.dataset.path, btn.dataset.caption);
    });
  });
}

function startGalleryListener() {
  const q = query(collection(db, "gallery"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      uploadedPhotos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderGallery(); // live for every visitor — no page refresh needed
    },
    (err) => {
      console.error("Failed to load gallery uploads:", err);
    }
  );
}

async function handleDeletePhoto(docId, storagePath, caption) {
  const ok = await confirmDelete({
    title: "Delete this photo?",
    message: caption
      ? `"${caption}" will be removed from the gallery for everyone. This action cannot be undone.`
      : "This photo will be removed from the gallery for everyone. This action cannot be undone.",
  });
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "gallery", docId));
    // Firestore delete succeeding is what makes the photo disappear
    // from every visitor's grid via onSnapshot — the Storage cleanup
    // below is bookkeeping, so it doesn't block or reverse that.
    if (storagePath) {
      await deleteObject(ref(storage, storagePath)).catch((err) => {
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

function setUploadProgress(pct) {
  const wrap = $("galleryUploadProgress");
  if (!wrap) return;
  if (pct == null) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="upload-progress-row">
      <span class="upload-progress-name">Uploading photo…</span>
      <div class="upload-progress"><div class="upload-progress-bar" style="width:${pct}%"></div></div>
      <span class="upload-progress-pct">${pct}%</span>
    </div>
  `;
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
  photoDropzone?.reset();
  setUploadProgress(null);
  form.hidden = true;
  setUploadError(null);
}

function validatePhoto(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return "Only PNG or JPG images are allowed.";
  if (file.size > MAX_PHOTO_BYTES) return "That photo is too large — 8MB max.";
  return null;
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const caption = form.caption.value.trim();
  const file = photoDropzone?.getFiles()[0];

  setUploadError(null);
  if (!caption) {
    setUploadError("Give the photo a caption first.");
    return;
  }
  if (!file) {
    setUploadError("Add a photo to upload.");
    return;
  }

  const submitBtn = $("galleryUploadSubmit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading…";
  setUploadProgress(0);

  try {
    const path = `gallery/${Date.now()}-${sanitizeFilename(file.name)}`;
    const fileRef = ref(storage, path);
    const url = await uploadFileWithProgress(fileRef, file, {
      onProgress: setUploadProgress,
    });

    await addDoc(collection(db, "gallery"), {
      url,
      caption,
      path,
      createdAt: serverTimestamp(),
    });

    closeUploadForm();
  } catch (err) {
    console.error("Gallery upload failed:", err);
    setUploadError(err?.message || "Couldn't upload that photo — check your admin access and try again.");
  } finally {
    // Always runs — success, validation failure, stalled/timed-out
    // upload, or a rules rejection all land here, so the button
    // never gets stuck reading "Uploading…" indefinitely.
    submitBtn.disabled = false;
    submitBtn.textContent = "Upload";
    setUploadProgress(null);
  }
}

export function initGallery() {
  renderGallery(); // seed photos show immediately, before Firestore responds
  startGalleryListener();

  subscribeAuth(({ admin }) => {
    isCurrentAdmin = admin;
    renderGallery(); // re-render so delete buttons appear/disappear with admin state
  });

  photoDropzone = createDropzone({
    zone: $("galleryPhotoZone"),
    input: $("galleryPhotoInput"),
    list: $("galleryPhotoPreview"),
    multiple: false,
    maxFiles: 1,
    validate: validatePhoto,
    onInvalid: (file, error) => setUploadError(error),
    onChange: () => setUploadError(null),
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
