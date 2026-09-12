// ============================================
// 8CM — Delete confirmation modal
// ------------------------------------------------
// A single shared overlay (markup lives once in index.html, see
// #deleteConfirmOverlay) that any module can drive with:
//
//   const ok = await confirmDelete({
//     title: "Delete this photo?",
//     message: `"${caption}" will be removed for everyone. This action cannot be undone.`,
//   });
//   if (!ok) return;
//
// This replaces window.confirm() so every destructive action in the
// app (gallery photos, task attachments, tasks) gets the same
// on-brand, two-step "are you sure" instead of a native browser
// dialog — and so it's one place to keep that behavior consistent.
// ============================================
const $ = (id) => document.getElementById(id);

let activeResolve = null;

function settle(result) {
  const overlay = $("deleteConfirmOverlay");
  if (overlay) overlay.hidden = true;
  if (activeResolve) {
    const resolve = activeResolve;
    activeResolve = null;
    resolve(result);
  }
}

export function confirmDelete({
  title = "Delete this item?",
  message = "This action cannot be undone.",
  confirmLabel = "Delete",
} = {}) {
  const overlay = $("deleteConfirmOverlay");
  if (!overlay) {
    // Markup didn't load for some reason — fall back rather than
    // silently skipping confirmation on a destructive action.
    return Promise.resolve(window.confirm(message));
  }
  // A stray earlier prompt (shouldn't happen in normal use, but
  // defensive) resolves as cancelled before the new one opens.
  if (activeResolve) settle(false);

  $("deleteConfirmTitle").textContent = title;
  $("deleteConfirmMessage").textContent = message;
  $("deleteConfirmOk").textContent = confirmLabel;
  overlay.hidden = false;
  $("deleteConfirmOk").focus();

  return new Promise((resolve) => {
    activeResolve = resolve;
  });
}

function init() {
  const overlay = $("deleteConfirmOverlay");
  if (!overlay) return;
  $("deleteConfirmOk").addEventListener("click", () => settle(true));
  $("deleteConfirmCancel").addEventListener("click", () => settle(false));
  $("deleteConfirmClose").addEventListener("click", () => settle(false));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) settle(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) settle(false);
  });
}

init();
