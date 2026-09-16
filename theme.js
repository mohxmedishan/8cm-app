// ============================================
// 8CM — Theme customization
// ------------------------------------------------
// Lets each visitor pick an accent color for the whole site, on top
// of the default green-and-black look. The choice is cached in
// localStorage immediately (works even signed out, and avoids a
// flash of the default color on repeat visits — see the tiny inline
// script in each page's <head> that reads the same key before this
// module even loads) and, once signed in, synced to the user's
// Firestore profile via auth.js so it follows them to other devices.
// ============================================
import { saveThemePreference } from "./auth.js";
import { playClick, playOpen, playClose } from "./sound.js";

const STORAGE_KEY = "8cm-theme-accent";
const MODE_KEY = "8cm-theme-mode";
export const DEFAULT_ACCENT = "#6b9a8f";
export const DEFAULT_MODE = "dark";

const PRESETS = [
  { name: "Green (default)", hex: "#6b9a8f" },
  { name: "Blue", hex: "#7ea8c4" },
  { name: "Amber", hex: "#c1723a" },
  { name: "Violet", hex: "#9a6bb0" },
  { name: "Rose", hex: "#c16590" },
];

const $ = (id) => document.getElementById(id);

function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, "0")).join("");
}

// Blends a color toward white by `amount` (0-1) — used to derive the
// brighter "strong" accent shade from whatever base color is picked,
// the same way --accent-strong relates to --accent in style.css.
function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * amount,
    g: g + (255 - g) * amount,
    b: b + (255 - b) * amount,
  });
}

let currentUid = null;

function applyTheme(hex) {
  const root = document.documentElement.style;
  const mode = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  root.setProperty("--accent", hex);
  root.setProperty("--accent-strong", mode === "light" ? "#4c7a70" : lighten(hex, 0.18));
  const { r, g, b } = hexToRgb(hex);
  root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, ${mode === "light" ? 0.18 : 0.14})`);
  reflectActiveSwatch(hex);
}

function reflectActiveSwatch(hex) {
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accent.toLowerCase() === hex.toLowerCase());
  });
  const custom = $("themeCustomInput");
  if (custom) custom.value = hex;
}

function applyMode(mode) {
  const resolved = mode === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", resolved);
  reflectModeButton(resolved);
  const accent = getStoredAccent();
  const root = document.documentElement.style;
  root.setProperty("--accent-strong", resolved === "light" ? "#4c7a70" : lighten(accent, 0.18));
  const { r, g, b } = hexToRgb(accent);
  root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, ${resolved === "light" ? 0.18 : 0.14})`);
}

function reflectModeButton(mode) {
  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
    btn.setAttribute("aria-selected", btn.dataset.mode === mode ? "true" : "false");
  });
}

function getStoredMode() {
  try {
    return localStorage.getItem(MODE_KEY) || DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function setStoredMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

function getStoredAccent() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

function setStoredAccent(hex) {
  try {
    localStorage.setItem(STORAGE_KEY, hex);
  } catch {
    // Private browsing / storage disabled — the color still applies
    // for this session, it just won't persist. Not worth surfacing.
  }
}

function chooseAccent(hex) {
  applyTheme(hex);
  setStoredAccent(hex);
  if (currentUid) {
    saveThemePreference(currentUid, {
      accent: hex,
      mode: getStoredMode(),
    }).catch((err) => {
      console.error("Failed to sync theme to account:", err);
    });
  }
}

function chooseMode(mode) {
  applyMode(mode);
  setStoredMode(mode);
  if (currentUid) {
    saveThemePreference(currentUid, {
      accent: getStoredAccent(),
      mode,
    }).catch((err) => {
      console.error("Failed to sync theme to account:", err);
    });
  }
}

/** Applies whatever's cached locally. Call this once, as early as
 * possible, so the picked accent is on screen from first paint. */
export function applyStoredTheme() {
  applyMode(getStoredMode());
  applyTheme(getStoredAccent());
}

/** Called from auth-ui.js's subscribeAuth callback on every auth
 * state change. A theme saved to the account is the source of truth
 * once it's loaded, and overrides whatever was cached locally —
 * but signing out just leaves the last-applied accent alone rather
 * than resetting it, since it's still the same browser/device. */
export function syncThemeFromProfile(uid, profile) {
  currentUid = uid || null;
  if (!uid || !profile) return;
  const theme = profile.theme;
  if (!theme) return;
  // Backward-compatibility: older saves stored only the accent hex string.
  if (typeof theme === "string") {
    applyTheme(theme);
    setStoredAccent(theme);
    return;
  }
  if (theme.mode) {
    applyMode(theme.mode);
    setStoredMode(theme.mode);
  }
  if (theme.accent) {
    applyTheme(theme.accent);
    setStoredAccent(theme.accent);
  }
}

function openSettings() {
  const overlay = $("settingsOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

function closeSettings() {
  const overlay = $("settingsOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => {
    overlay.hidden = true;
  }, 200);
}

/** Wires the settings button, modal, swatches, and custom picker.
 * Safe to call once at boot on every page — no-ops where the
 * settings markup isn't present. */
export function initThemeUI() {
  const swatchContainer = $("themeSwatches");
  if (swatchContainer) {
    swatchContainer.innerHTML = PRESETS.map(
      (p) =>
        `<button type="button" class="theme-swatch" data-accent="${p.hex}" style="--swatch:${p.hex}" aria-label="${p.name}" title="${p.name}"></button>`
    ).join("");
    swatchContainer.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        playClick();
        chooseAccent(btn.dataset.accent);
      });
    });
  }

  const customInput = $("themeCustomInput");
  if (customInput) {
    customInput.addEventListener("input", (e) => chooseAccent(e.target.value));
  }

  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      playClick();
      chooseMode(btn.dataset.mode);
    });
  });

  const resetBtn = $("themeResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      playClick();
      chooseAccent(DEFAULT_ACCENT);
    });
  }

  const settingsBtn = $("settingsBtn");
  const settingsClose = $("settingsClose");
  const settingsOverlay = $("settingsOverlay");
  if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
  if (settingsClose) settingsClose.addEventListener("click", closeSettings);
  if (settingsOverlay) {
    settingsOverlay.addEventListener("click", (e) => {
      if (e.target === settingsOverlay) closeSettings();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOverlay && !settingsOverlay.hidden) closeSettings();
  });

  reflectActiveSwatch(getStoredAccent());
  reflectModeButton(getStoredMode());
}
