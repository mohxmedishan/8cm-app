// ============================================
// 8CM — Background music (V13.1.1)
// ================================================================
//             HOW TO SET YOUR OWN TRACK
// ----------------------------------------------------------------
// 1. Create the folder assets/audio/ in your project.
// 2. Drop your MP3 there (e.g. assets/audio/sweden.mp3).
// 3. Set BGM_CONFIG.src below to that path.
// 4. Optionally set `startAt` in seconds to skip a slow intro.
//    (e.g. Minecraft's "Mice on Venus" — you'd want startAt: 20)
//
// To use a hosted track instead, set src to the full URL:
//    src: "https://example.com/your-song.mp3"
//
// To turn BGM off entirely for now, set src: "" — the Play button
// will then do nothing. SFX still work; that's a separate system.
// ================================================================

const BGM_CONFIG = {
  src: "assets/audio/Sweden.mp3", // ← Change this path if you renamed your file!
  startAt: 10,          // skips first 20 seconds
  volume: 0.4,          // default 0-1, user can override with the slider
  loop: true,           // loops continuously
};

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = BGM_CONFIG.volume;
let seekApplied = false;

// ---------------------------------------------------------------
// Prefs
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
function buildAudio() {
  if (audio) return audio;
  if (!BGM_CONFIG.src) return null;

  audio = new Audio();
  audio.src = BGM_CONFIG.src;
  audio.loop = BGM_CONFIG.loop;
  audio.preload = "metadata";
  audio.volume = currentVolume;

  // Seek past the intro as soon as enough of the file has loaded.
  if (BGM_CONFIG.startAt > 0) {
    const applySeek = () => {
      if (seekApplied) return;
      if (!audio.duration || !isFinite(audio.duration)) return;
      try {
        audio.currentTime = Math.min(BGM_CONFIG.startAt, audio.duration - 1);
        seekApplied = true;
      } catch {}
    };
    audio.addEventListener("loadedmetadata", applySeek);
    audio.addEventListener("canplay", applySeek);
  }
  return audio;
}

async function attemptPlay() {
  const a = buildAudio();
  if (!a) return false;
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
// Public API
// ---------------------------------------------------------------
export function isBgmPlaying() { return wantsPlaying && audio && !audio.paused; }

export async function playBgm() {
  if (!BGM_CONFIG.src) {
    console.warn("[8CM] BGM: no src configured. Edit bgm.js BGM_CONFIG.src.");
    return false;
  }
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
// UI
// ---------------------------------------------------------------
function reflectUI() {
  const toggle = document.getElementById("bgmToggle");
  if (toggle) {
    const on = wantsPlaying;
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.textContent = on ? "Pause" : "Play";
    toggle.disabled = !BGM_CONFIG.src;
    if (!BGM_CONFIG.src) toggle.title = "No track configured — see bgm.js";
  }
  const slider = document.getElementById("bgmVolume");
  if (slider && Math.abs(parseFloat(slider.value) / 100 - currentVolume) > 0.01) {
    slider.value = String(Math.round(currentVolume * 100));
  }
  // Small note explaining whether a track is set
  const note = document.querySelector(".theme-audio-note");
  if (note) {
    if (!BGM_CONFIG.src) {
      note.textContent = "No track configured yet. Set BGM_CONFIG.src in bgm.js to enable music.";
    } else {
      note.textContent = "SFX are always on. BGM only plays after you press Play — browsers block autoplay until then.";
    }
  }
}

export function initBgm() {
  readPrefs();
  reflectUI();

  const toggle = document.getElementById("bgmToggle");
  if (toggle) toggle.addEventListener("click", toggleBgm);

  const slider = document.getElementById("bgmVolume");
  if (slider) {
    slider.value = String(Math.round(currentVolume * 100));
    slider.addEventListener("input", (e) => setBgmVolume(parseFloat(e.target.value) / 100));
  }

  if (wantsPlaying && BGM_CONFIG.src) armUnlock();

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
