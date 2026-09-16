// ============================================
// 8CM — Theme customization (V11.2)
// ------------------------------------------------
// Accent color is user-picked and stored on device + profile.
// Mode (dark / light) is stored alongside.
//
// In light mode the picked accent is transformed:
//   · --accent-strong  → darkened (readable as text on white)
//   · --accent-vibrant → saturation boosted, lightness lifted
//                        (vibrant for button backgrounds)
//   · --accent-vibrant-2 → even lighter end of the gradient
// In dark mode all four align with the picked hex.
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
let currentUid = null;

// ------------------------------------------------
// Color math
// ------------------------------------------------
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function hexToRgb(hex) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("");
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * amt,
    g: g + (255 - g) * amt,
    b: b + (255 - b) * amt,
  });
}
function vibrify(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.s = clamp(hsl.s + 20, 0, 85);
  hsl.l = clamp(hsl.l, 55, 68);
  return rgbToHex(hslToRgb(hsl.h, hsl.s, hsl.l));
}
function darkenForText(hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = clamp(hsl.l - 22, 22, 40);
  hsl.s = clamp(hsl.s + 8, 0, 75);
  return rgbToHex(hslToRgb(hsl.h, hsl.s, hsl.l));
}

// ------------------------------------------------
// Mode
// ------------------------------------------------
function getStoredMode() {
  try { return localStorage.getItem(MODE_KEY) || DEFAULT_MODE; }
  catch { return DEFAULT_MODE; }
}
function setStoredMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}
function applyMode(mode) {
  const resolved = mode === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", resolved);
  reflectModeButton(resolved);
}
function reflectModeButton(mode) {
  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}
function chooseMode(mode) {
  applyMode(mode);
  applyTheme(getStoredAccent());
  setStoredMode(mode);
  if (currentUid) {
    saveThemePreference(currentUid, { accent: getStoredAccent(), mode }).catch((err) =>
      console.error("Failed to sync theme:", err)
    );
  }
}

// ------------------------------------------------
// Accent
// ------------------------------------------------
function getStoredAccent() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT; }
  catch { return DEFAULT_ACCENT; }
}
function setStoredAccent(hex) {
  try { localStorage.setItem(STORAGE_KEY, hex); } catch {}
}
function applyTheme(hex) {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const root = document.documentElement.style;
  const rgb = hexToRgb(hex);

  if (isLight) {
    const vibrant = vibrify(hex);
    root.setProperty("--accent", hex);
    root.setProperty("--accent-strong", darkenForText(hex));
    root.setProperty("--accent-vibrant", vibrant);
    root.setProperty("--accent-vibrant-2", lighten(vibrant, 0.22));
    root.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`);
  } else {
    root.setProperty("--accent", hex);
    root.setProperty("--accent-strong", lighten(hex, 0.18));
    root.setProperty("--accent-vibrant", hex);
    root.setProperty("--accent-vibrant-2", lighten(hex, 0.18));
    root.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
  }
  reflectActiveSwatch(hex);
}
function reflectActiveSwatch(hex) {
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accent.toLowerCase() === hex.toLowerCase());
  });
  const custom = $("themeCustomInput");
  if (custom) custom.value = hex;
}
function chooseAccent(hex) {
  applyTheme(hex);
  setStoredAccent(hex);
  if (currentUid) {
    saveThemePreference(currentUid, { accent: hex, mode: getStoredMode() }).catch((err) =>
      console.error("Failed to sync theme to account:", err)
    );
  }
}

// ------------------------------------------------
// Public
// ------------------------------------------------
export function applyStoredTheme() {
  applyMode(getStoredMode());
  applyTheme(getStoredAccent());
}
export function syncThemeFromProfile(uid, profile) {
  currentUid = uid || null;
  if (!uid || !profile) return;
  const theme = profile.theme;
  if (!theme) return;
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

// ------------------------------------------------
// Modal + UI wiring
// ------------------------------------------------
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
  setTimeout(() => { overlay.hidden = true; }, 200);
}
export function initThemeUI() {
  const swatchContainer = $("themeSwatches");
  if (swatchContainer) {
    swatchContainer.innerHTML = PRESETS.map(
      (p) => `<button type="button" class="theme-swatch" data-accent="${p.hex}" style="--swatch:${p.hex}" aria-label="${p.name}" title="${p.name}"></button>`
    ).join("");
    swatchContainer.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.addEventListener("click", () => { playClick(); chooseAccent(btn.dataset.accent); });
    });
  }
  const customInput = $("themeCustomInput");
  if (customInput) customInput.addEventListener("input", (e) => {
    if (/^#[0-9a-fA-F]{3,6}$/.test(e.target.value)) chooseAccent(e.target.value);
  });
  const resetBtn = $("themeResetBtn");
  if (resetBtn) resetBtn.addEventListener("click", () => { playClick(); chooseAccent(DEFAULT_ACCENT); });
  document.querySelectorAll(".theme-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => { playClick(); chooseMode(btn.dataset.mode); });
  });
  const settingsBtn = $("settingsBtn");
  const settingsClose = $("settingsClose");
  const settingsOverlay = $("settingsOverlay");
  if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
  if (settingsClose) settingsClose.addEventListener("click", closeSettings);
  if (settingsOverlay) {
    settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSettings(); });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOverlay && !settingsOverlay.hidden) closeSettings();
  });
  reflectActiveSwatch(getStoredAccent());
  reflectModeButton(getStoredMode());
}
