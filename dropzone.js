// ============================================
// 8CM — Drag-and-drop file picker
// ------------------------------------------------
// Wraps a hidden native <input type="file"> with a styled drop zone
// and a live preview list (thumbnail for images, colored file-type
// badge otherwise, size, and a remove button per staged file).
// The native input stays in the DOM only as the click-to-browse /
// accessibility fallback — the file list this module tracks
// internally is the source of truth callers should read from, since
// it can accumulate across multiple drops, not just one native
// selection.
// ============================================
import { formatBytes, fileIconSvg } from "./file-utils.js";

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.zone - the drop target / click target
 * @param {HTMLInputElement} opts.input - the hidden native file input
 * @param {HTMLElement} [opts.list] - container for preview chips
 * @param {boolean} [opts.multiple] - allow more than one staged file
 * @param {number} [opts.maxFiles] - cap on staged files (mutable via setMaxFiles)
 * @param {(file: File) => string|null} [opts.validate] - return an error string to reject a file, or null/undefined to accept
 * @param {(files: File[]) => void} [opts.onChange] - called whenever the staged file list changes
 * @param {(file: File, error: string) => void} [opts.onInvalid] - called when validate() rejects a file
 */
export function createDropzone({
  zone,
  input,
  list,
  multiple = false,
  maxFiles = 1,
  validate,
  onChange,
  onInvalid,
}) {
  let files = [];
  let cap = maxFiles;
  let objectUrls = [];

  function revokeThumbs() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  function previewNode(file) {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      return `<img class="file-chip-thumb" src="${url}" alt="">`;
    }
    return fileIconSvg(file.name, file.type);
  }

  function render() {
    if (!list) return;
    revokeThumbs();
    list.innerHTML = files
      .map(
        (f, i) => `
        <span class="file-chip">
          ${previewNode(f)}
          <span class="file-chip-name">${f.name}</span>
          <span class="file-chip-size">${formatBytes(f.size)}</span>
          <button type="button" class="file-chip-remove" data-index="${i}" aria-label="Remove ${f.name}">✕</button>
        </span>
      `
      )
      .join("");
    list.querySelectorAll(".file-chip-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        files.splice(Number(btn.dataset.index), 1);
        render();
        notify();
      });
    });
    if (zone) zone.classList.toggle("dropzone-full", cap > 0 && files.length >= cap);
  }

  function notify() {
    if (onChange) onChange(files.slice());
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const accepted = [];
    for (const file of incoming) {
      const error = validate ? validate(file) : null;
      if (error) {
        if (onInvalid) onInvalid(file, error);
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    files = multiple ? [...files, ...accepted].slice(0, cap) : [accepted[0]];
    render();
    notify();
  }

  function reset() {
    files = [];
    if (input) input.value = "";
    render();
    notify();
  }

  function setMaxFiles(n) {
    cap = n;
    if (files.length > cap) {
      files = files.slice(0, cap);
      render();
      notify();
    } else {
      render();
    }
  }

  if (zone) {
    zone.addEventListener("click", (e) => {
      if (e.target.closest(".file-chip-remove")) return;
      input?.click();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input?.click();
      }
    });
    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("dropzone-active");
      })
    );
    ["dragleave", "dragend", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove("dropzone-active");
      })
    );
    zone.addEventListener("drop", (e) => addFiles(e.dataTransfer?.files));
  }

  if (input) {
    input.addEventListener("change", () => {
      addFiles(input.files);
      input.value = ""; // so re-picking the same file later still fires "change"
    });
  }

  return {
    getFiles: () => files.slice(),
    setFiles: (arr) => {
      files = (arr || []).slice(0, cap);
      render();
    },
    setMaxFiles,
    reset,
  };
}
