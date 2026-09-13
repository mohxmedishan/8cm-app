// ============================================
// 8CM — Shared file helpers
// ------------------------------------------------
// Used by both tasks.js (task attachments) and gallery.js (photos):
// byte formatting, small colored file-type icons (no external icon
// fetches — everything is inline SVG), and the Base64 pipeline that
// replaced Firebase Storage:
//
//   - fileToDataUrl(): read any file straight to a base64 data: URL.
//   - compressImageToDataUrl(): for images, resize/re-encode via
//     canvas until the result fits under a byte budget, then read
//     that compressed blob to a data: URL.
//   - estimateEncodedBytes(): the actual byte size of a data: URL's
//     base64 payload, since that (not the original file size) is
//     what counts against Firestore's per-document limit.
//
// Why this exists at all: the Spark (free) plan doesn't include
// Firebase Storage, so attachments/photos are stored as base64
// strings directly on Firestore documents instead of as Storage
// blobs. Firestore caps a single document at ~1 MiB total, and
// base64 inflates raw bytes by ~4/3 — MAX_ENCODED_BYTES below is the
// shared ceiling every caller validates or compresses against to
// stay safely under that limit (with headroom for the doc's other
// fields). There is no equivalent of the old "resumable upload with
// progress events" here — reading/encoding a file is fast, local CPU
// work, not a network transfer — so progress reporting is now a
// simple few-step indicator (reading/compressing → writing to
// Firestore) rather than a byte-level transfer percentage.
// ============================================

// Firestore documents are capped at 1,048,487 bytes total. This is
// the shared safety ceiling for a single attachment/photo's encoded
// (base64) payload, leaving headroom for the doc's other fields
// (name, type, caption, timestamps, etc.) and Firestore's own
// storage overhead.
export const MAX_ENCODED_BYTES = 900 * 1024; // 900 KB

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The actual byte size of a data: URL's base64 payload — what really
 * counts against Firestore's document-size limit, as opposed to the
 * original file's byte size (which base64 inflates by ~4/3).
 */
export function estimateEncodedBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Reads a file straight to a base64 data: URL, no compression. Used
 * for file types canvas can't re-encode (PDFs, Office docs, text) —
 * callers are responsible for capping file.size beforehand, since
 * there's no way to shrink these client-side.
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Couldn't read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes and re-encodes an image via <canvas> until it fits under
 * maxBytes, then reads the result to a base64 data: URL.
 *
 * PNGs are kept as PNG (to preserve transparency) and shrunk by
 * dimension only, since canvas has no lossy "quality" knob for PNG.
 * Everything else is re-encoded as JPEG, tightening quality first and
 * then dimensions if it's still too big. Animated GIFs and WEBP are
 * flattened to a single static JPEG frame in the process — there's no
 * way to keep animation within this byte budget.
 *
 * Rejects (rather than looping forever) if the image still can't fit
 * after several attempts, so a caller's Promise.allSettled sees this
 * as a clean per-file failure like any other.
 */
export function compressImageToDataUrl(file, { maxDimension = 1600, maxBytes = MAX_ENCODED_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      let dimensionScale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
      let quality = 0.82;
      let attempts = 0;

      const attemptEncode = () => {
        attempts += 1;
        const width = Math.max(1, Math.round(img.naturalWidth * dimensionScale));
        const height = Math.max(1, Math.round(img.naturalHeight * dimensionScale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(`Couldn't process "${file.name}".`));
              return;
            }

            const fitsBudget = blob.size <= maxBytes;
            const outOfMoves =
              attempts >= 8 ||
              (dimensionScale <= 0.15 && (outputType === "image/png" || quality <= 0.3));

            if (fitsBudget || outOfMoves) {
              if (!fitsBudget) {
                reject(new Error(`"${file.name}" is still too large even after compression — try a smaller image.`));
                return;
              }
              const reader = new FileReader();
              reader.onload = () => resolve({ dataUrl: reader.result, size: blob.size });
              reader.onerror = () => reject(new Error(`Couldn't finalize "${file.name}".`));
              reader.readAsDataURL(blob);
              return;
            }

            // Still over budget: tighten JPEG quality first, then
            // fall back to shrinking dimensions further (the only
            // lever PNG has), and try again.
            if (outputType === "image/jpeg" && quality > 0.3) {
              quality = Math.max(0.3, quality - 0.12);
            } else {
              dimensionScale *= 0.75;
            }
            attemptEncode();
          },
          outputType,
          outputType === "image/jpeg" ? quality : undefined
        );
      };

      attemptEncode();
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Couldn't read "${file.name}" as an image.`));
    };

    img.src = objectUrl;
  });
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


