// ============================================
// 8CM — Gallery (public view + admin upload)
// ------------------------------------------------
// The grid is built from two sources, rendered through one code path:
//   1. gallerySeed — the original hand-picked photos, baked in as data,
//      served as plain static image files (unaffected by any of this).
//   2. the Firestore `gallery` collection — anything an admin uploads
//      through the "+ Add photo" form, live via onSnapshot for every
//      visitor (no sign-in required to see them — see firestore.rules).
//
// There's no Firebase Storage here — the Spark (free) plan doesn't
// include it. Each uploaded photo is compressed and re-encoded to a
// base64 data: URL client-side (compressImageToDataUrl, file-utils.js)
// and that string is written straight onto the gallery doc's
// `dataUrl` field — Firestore is the only backing store, so deleting
// the doc is the entire delete (no separate blob to clean up).
//
// Photos are capped much smaller than before (an 8MB JPEG straight
// off a phone would blow well past Firestore's ~1 MiB per-document
// limit once base64-encoded) — compressImageToDataUrl resizes and
// re-encodes until the result fits comfortably under that limit.
// ============================================
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
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { gallerySeed } from "./gallery-seed.js";
import { compressImageToDataUrl } from "./file-utils.js";
import { createDropzone } from "./dropzone.js";
import { confirmDelete } from "./confirm-modal.js";

const $ = (id) => document.getElementById(id);

// Generous pre-compression ceiling on the original file — just a
// sanity guard against picking something absurd; the real cap is
// what compressImageToDataUrl squeezes it down to before it's ever
// written to Firestore.
const MAX_PHOTO_INPUT_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

let isCurrentAdmin = false;
let uploadedPhotos = []; // Firestore-backed, newest last (see orderBy below)
let photoDropzone = null;

function figureMarkup(photo) {
  const deleteBtn =
    photo.docId && isCurrentAdmin
      ? `<button type="button" class="gallery-delete-btn admin-only" data-id="${photo.docId}" data-caption="${(photo.caption || "").replace(/"/g, "&quot;")}" aria-label="Delete photo">✕ Delete</button>`
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
    .map((p) => figureMarkup({ src: p.dataUrl, alt: p.caption, caption: p.caption, docId: p.id }))
    .join("");

  grid.innerHTML = seedMarkup + uploadedMarkup;

  grid.querySelectorAll(".gallery-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // don't also open the lightbox
      handleDeletePhoto(btn.dataset.id, btn.dataset.caption);
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

async function handleDeletePhoto(docId, caption) {
  const ok = await confirmDelete({
    title: "Delete this photo?",
    message: caption
      ? `"${caption}" will be removed from the gallery for everyone. This action cannot be undone.`
      : "This photo will be removed from the gallery for everyone. This action cannot be undone.",
  });
  if (!ok) return;

  try {
    // The photo's bytes live entirely on this doc (dataUrl field) —
    // no separate Storage object to clean up, so deleting the doc is
    // the whole delete. This is also what makes it disappear from
    // every visitor's grid via onSnapshot.
    await deleteDoc(doc(db, "gallery", docId));
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
  if (file.size > MAX_PHOTO_INPUT_BYTES) return "That photo is too large to process — try a smaller image.";
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
  setUploadProgress(10);

  try {
    // Resize/re-encode client-side until it fits Firestore's document
    // budget, then write the base64 result straight onto the doc —
    // no Storage bucket, no separate file reference.
    const { dataUrl } = await compressImageToDataUrl(file);
    setUploadProgress(70);

    await addDoc(collection(db, "gallery"), {
      dataUrl,
      caption,
      createdAt: serverTimestamp(),
    });
    setUploadProgress(100);

    closeUploadForm();
  } catch (err) {
    console.error("Gallery upload failed:", err);
    setUploadError(err?.message || "Couldn't upload that photo — check your admin access and try again.");
  } finally {
    // Always runs — success, validation failure, a compression that
    // couldn't hit budget, or a rules rejection all land here, so the
    // button never gets stuck reading "Uploading…" indefinitely.
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
