// ============================================
// 8CM — Shared file helpers
// ------------------------------------------------
// Used by both tasks.js (task attachments) and gallery.js (photos):
// byte formatting, filename sanitizing, small colored file-type
// icons (no external icon fetches — everything is inline SVG), and
// uploadFileWithProgress(), which wraps Firebase's resumable upload
// so callers get real progress events AND a guarantee the promise
// always settles — the root cause of the old "stuck on Uploading…"
// bug was that a plain uploadBytes() call with no timeout just hangs
// forever if the network stalls mid-transfer, with zero feedback.
// ============================================
import {
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
}

function getExt(filename = "") {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function getFileKind(filename = "", mime = "") {
  const ext = getExt(filename);
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return "doc";
  if (mime.includes("presentation") || ["ppt", "pptx"].includes(ext)) return "ppt";
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx"].includes(ext)) return "xls";
  if (mime === "text/plain" || ext === "txt") return "text";
  return "file";
}

const ICON_PALETTE = {
  pdf: { color: "#c1665a", label: "PDF" },
  doc: { color: "#7ea8c4", label: "DOC" },
  ppt: { color: "#d9a441", label: "PPT" },
  xls: { color: "#7c9a5d", label: "XLS" },
  image: { color: "#a084c9", label: "IMG" },
  text: { color: "#9c9b96", label: "TXT" },
  file: { color: "#9c9b96", label: "FILE" },
};

// A small "document with folded corner" badge, colored per file type,
// with a short label baked in — reads clearly at 16-18px without
// depending on any external icon font/sprite sheet.
export function fileIconSvg(filename, mime = "") {
  const kind = getFileKind(filename, mime);
  const { color, label } = ICON_PALETTE[kind];
  return `
    <svg class="file-icon" viewBox="0 0 32 32" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M8 2h11l7 7v20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="${color}" opacity="0.16"/>
      <path d="M8 2h11l7 7v20a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M19 2v7h7" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
      <text x="16" y="24" text-anchor="middle" font-family="'IBM Plex Sans', sans-serif" font-size="7.5" font-weight="700" fill="${color}">${label}</text>
    </svg>
  `;
}

/**
 * Uploads a file with real progress reporting, and — unlike a bare
 * uploadBytes() call — guarantees the returned promise always settles:
 *  - if the transfer visibly stalls (no new bytes for `stallTimeoutMs`)
 *  - or if the whole thing runs past `hardTimeoutMs` regardless
 * the in-flight upload is cancelled and the promise rejects with a
 * clear error, instead of leaving the caller (and the "Uploading…"
 * button) hanging indefinitely.
 */
export function uploadFileWithProgress(
  fileRef,
  file,
  { onProgress, stallTimeoutMs = 20000, hardTimeoutMs = 120000 } = {}
) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file);
    let lastBytes = 0;
    let lastProgressAt = Date.now();
    let settled = false;

    const stallCheck = setInterval(() => {
      if (Date.now() - lastProgressAt > stallTimeoutMs) {
        fail(new Error("Upload stalled — check your connection and try again."));
      }
    }, 2000);

    const hardCap = setTimeout(() => {
      fail(new Error("Upload took too long and was cancelled."));
    }, hardTimeoutMs);

    function cleanup() {
      clearInterval(stallCheck);
      clearTimeout(hardCap);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      cleanup();
      task.cancel();
      reject(err);
    }

    task.on(
      "state_changed",
      (snapshot) => {
        if (snapshot.bytesTransferred !== lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          lastProgressAt = Date.now();
        }
        if (onProgress) {
          const pct = snapshot.totalBytes
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;
          onProgress(pct);
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      },
      async () => {
        if (settled) return; // already stalled/timed out and cancelled
        settled = true;
        cleanup();
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          if (onProgress) onProgress(100);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
