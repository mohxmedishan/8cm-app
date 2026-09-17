// ============================================
// 8CM — Background music player
// ------------------------------------------------
// One HTMLAudioElement reused across pages. State (playing / paused,
// volume) is persisted in localStorage so navigating between pages
// resumes where you left off rather than resetting.
//
// Autoplay policy: browsers refuse to start audio without a prior
// user gesture. We never try to autoplay — we just remember "the
// user pressed Play at some point" and, when the new page loads, we
// resume on the FIRST user interaction (any click or keypress).
//
// ────────────────────────────────────────────────────────────────
// TO SET YOUR TRACK: replace BGM_SRC below with a URL to your audio
// file. Can be a same-origin path (e.g. "assets/audio/theme.mp3") or
// a remote URL. Format support is whatever the browser supports —
// mp3 and ogg cover effectively everything.
// ────────────────────────────────────────────────────────────────
// ============================================

const BGM_SRC = "assets/audio/8cm-theme.mp3"; // ← REPLACE THIS
const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";

const DEFAULT_VOLUME = 0.4;

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = DEFAULT_VOLUME;

// ---------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------
function readPrefs() {
  try {
    wantsPlaying = localStorage.getItem(STORAGE_PLAYING) === "1";
    const v = parseFloat(localStorage.getItem(STORAGE_VOLUME));
    if (!isNaN(v) && v >= 0 && v <= 1) currentVolume = v;
  } catch {}
}

function writePrefs() {
  try {
    localStorage.setItem(STORAGE_PLAYING, wantsPlaying ? "1" : "0");
    localStorage.setItem(STORAGE_VOLUME, String(currentVolume));
  } catch {}
}

// ---------------------------------------------------------------
// Audio element
// ---------------------------------------------------------------
function getAudio() {
  if (audio) return audio;
  audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.preload = "none";
  audio.volume = currentVolume;
  audio.crossOrigin = "anonymous";
  return audio;
}

// Attempt to play. If the browser blocks it (no user gesture yet),
// returns false and we stay in "armed" state — the next real
// interaction unlocks us.
async function attemptPlay() {
  if (!wantsPlaying) return false;
  const a = getAudio();
  try {
    await a.play();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

function armUnlock() {
  if (unlocked) return;
  const unlock = async () => {
    if (unlocked) return;
    const ok = await attemptPlay();
    if (ok) {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    }
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

// ---------------------------------------------------------------
// Public controls
// ---------------------------------------------------------------
export function isBgmPlaying() {
  return wantsPlaying && audio && !audio.paused;
}

export function isBgmWanted() {
  return wantsPlaying;
}

export function getBgmVolume() {
  return currentVolume;
}

export async function playBgm() {
  wantsPlaying = true;
  writePrefs();
  const ok = await attemptPlay();
  if (!ok) armUnlock();
  reflectUI();
  return ok;
}

export function pauseBgm() {
  wantsPlaying = false;
  writePrefs();
  if (audio) audio.pause();
  reflectUI();
}

export function toggleBgm() {
  if (wantsPlaying) pauseBgm();
  else playBgm();
}

export function setBgmVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v));
  if (audio) audio.volume = currentVolume;
  writePrefs();
  reflectUI();
}

// ---------------------------------------------------------------
// UI wiring — safe to call on every page. No-op if the settings
// modal's sound block isn't present.
// ---------------------------------------------------------------
function reflectUI() {
  const toggle = document.getElementById("bgmToggle");
  if (toggle) {
    const on = wantsPlaying;
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.textContent = on ? "Pause" : "Play";
  }
  const slider = document.getElementById("bgmVolume");
  if (slider && Math.abs(parseFloat(slider.value) / 100 - currentVolume) > 0.01) {
    slider.value = String(Math.round(currentVolume * 100));
  }
}

export function initBgm() {
  readPrefs();
  reflectUI();

  const toggle = document.getElementById("bgmToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      toggleBgm();
    });
  }
  const slider = document.getElementById("bgmVolume");
  if (slider) {
    slider.value = String(Math.round(currentVolume * 100));
    slider.addEventListener("input", (e) => {
      setBgmVolume(parseFloat(e.target.value) / 100);
    });
  }

  // If the user already wanted music on a previous page, resume on
  // first interaction of this one.
  if (wantsPlaying) armUnlock();

  // Keep multiple tabs roughly in sync — a press in one tab reflects
  // in the other on next focus.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_PLAYING) {
      const wanted = e.newValue === "1";
      if (wanted && !wantsPlaying) playBgm();
      if (!wanted && wantsPlaying) pauseBgm();
    }
    if (e.key === STORAGE_VOLUME) {
      const v = parseFloat(e.newValue);
      if (!isNaN(v)) setBgmVolume(v);
    }
  });
}
