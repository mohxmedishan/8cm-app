// ============================================
// 8CM — Background music (v14)
// ================================================================
//  HOW TO ADD A TRACK
// ----------------------------------------------------------------
//  Two ways, in order of preference:
//
//  1) AUTOMATIC (works only if your host serves a directory index
//     at assets/audio/ — some do, Vercel/Firebase Hosting don't by
//     default). Just drop the MP3 in assets/audio/ and reload.
//     Every .mp3 in the folder shows up in the dropdown.
//
//  2) EXPLICIT (always works). Add one line to
//     BGM_CONFIG.fallbackTracks below. That's the whole change:
//
//       { file: "Mice on Venus.mp3", title: "Mice on Venus", startAt: 20 }
//
//     `startAt` is optional (seconds to skip — useful when a track
//     has a long quiet intro). Omit it and the track plays from 0:00.
//
//  The chosen track, play/pause state, and volume all persist
//  across reloads via localStorage.
// ================================================================

const BGM_CONFIG = {
  // Directory the tracks live in, relative to the site root.
  audioDir: "assets/audio/",

  // Fallback / explicit track list. Always used for startAt and
  // titles; also used as the full list when auto-discovery fails.
  fallbackTracks: [
    { file: "Sweden.mp3", title: "Sweden", startAt: 10 },
    { file: "MiceOnVenus.mp3", title: "Mice on Venus", startAt: 40},
  ],

  defaultVolume: 0.4,
  loop: true,
};

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME  = "8cm:bgm:volume";
const STORAGE_TRACK   = "8cm:bgm:track";

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = BGM_CONFIG.defaultVolume;
let seekApplied = false;
let tracks = [];
let currentTrackIndex = 0;

// ---------------------------------------------------------------
// Track discovery
// ---------------------------------------------------------------
// Attempts to read the audio directory's index page and pull every
// .mp3 link out of it. On hosts that don't expose a listing this
// throws or returns nothing, and we fall back to fallbackTracks.
// Either way, startAt/title from fallbackTracks takes precedence
// when the same filename appears in both.
async function discoverTracks() {
  const discovered = [];

  try {
    const res = await fetch(BGM_CONFIG.audioDir, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      const matches = [...text.matchAll(/href="([^"]+\.mp3)"/gi)];
      const seen = new Set();
      matches.forEach((m) => {
        const raw = decodeURIComponent(m[1]);
        const file = raw.split("/").pop();
        if (!file || seen.has(file)) return;
        seen.add(file);
        discovered.push({
          file,
          title: file.replace(/\.mp3$/i, "").replace(/[_-]+/g, " "),
          startAt: 0,
        });
      });
    }
  } catch {
    // Expected on Vercel, Firebase Hosting, Netlify, etc. Silent.
  }

  // Merge: prefer fallbackTracks metadata (title, startAt) when a
  // discovered file matches; add fallback-only files at the end.
  const seen = new Set();
  const merged = [];
  discovered.forEach((t) => {
    if (seen.has(t.file)) return;
    seen.add(t.file);
    const fallback = BGM_CONFIG.fallbackTracks.find((f) => f.file === t.file);
    merged.push(fallback || t);
  });
  BGM_CONFIG.fallbackTracks.forEach((t) => {
    if (seen.has(t.file)) return;
    seen.add(t.file);
    merged.push(t);
  });
  return merged;
}

// ---------------------------------------------------------------
// Prefs
// ---------------------------------------------------------------
function readPrefs() {
  try {
    wantsPlaying = localStorage.getItem(STORAGE_PLAYING) === "1";
    const v = parseFloat(localStorage.getItem(STORAGE_VOLUME));
    if (!isNaN(v) && v >= 0 && v <= 1) currentVolume = v;
    const savedFile = localStorage.getItem(STORAGE_TRACK);
    if (savedFile) {
      const idx = tracks.findIndex((x) => x.file === savedFile);
      if (idx >= 0) currentTrackIndex = idx;
    }
  } catch {}
}

function writePrefs() {
  try {
    localStorage.setItem(STORAGE_PLAYING, wantsPlaying ? "1" : "0");
    localStorage.setItem(STORAGE_VOLUME, String(currentVolume));
    localStorage.setItem(STORAGE_TRACK, tracks[currentTrackIndex]?.file || "");
  } catch {}
}

// ---------------------------------------------------------------
// Audio element
// ---------------------------------------------------------------
function buildAudio() {
  if (audio) return audio;
  const track = tracks[currentTrackIndex];
  if (!track) return null;

  audio = new Audio();
  audio.src = BGM_CONFIG.audioDir + track.file;
  audio.loop = BGM_CONFIG.loop;
  audio.preload = "metadata";
  audio.volume = currentVolume;

  if (track.startAt > 0) {
    const applySeek = () => {
      if (seekApplied) return;
      if (!audio.duration || !isFinite(audio.duration)) return;
      try {
        audio.currentTime = Math.min(track.startAt, audio.duration - 1);
        seekApplied = true;
      } catch {}
    };
    audio.addEventListener("loadedmetadata", applySeek);
    audio.addEventListener("canplay", applySeek);
  }
  return audio;
}

function destroyAudio() {
  if (!audio) return;
  try { audio.pause(); } catch {}
  audio.src = "";
  audio = null;
  seekApplied = false;
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
export function isBgmPlaying() {
  return wantsPlaying && audio && !audio.paused;
}

export async function playBgm() {
  if (!tracks.length) return false;
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

export function selectTrack(index) {
  if (index < 0 || index >= tracks.length) return;
  if (index === currentTrackIndex) return;
  const wasPlaying = wantsPlaying;
  currentTrackIndex = index;
  writePrefs();
  destroyAudio();
  if (wasPlaying) playBgm();
  reflectUI();
}

// ---------------------------------------------------------------
// UI — replaces the audio block inside the Settings modal.
// Doing this here (rather than editing every HTML file) keeps the
// three-audio-controls markup in one place and guarantees it's
// identical across all pages.
// ---------------------------------------------------------------
function renderAudioBlock() {
  const block = document.querySelector(".theme-audio-block");
  if (!block || block.dataset.bgmRendered) return;
  block.dataset.bgmRendered = "true";
  block.innerHTML = `
    <h4 class="theme-audio-title">Sound</h4>
    <div class="bgm-track-row">
      <label class="theme-audio-label" for="bgmTrackSelect">Track</label>
      <select class="bgm-track-select" id="bgmTrackSelect" aria-label="Choose background music"></select>
    </div>
    <div class="theme-audio-row">
      <span class="theme-audio-label">Background music</span>
      <button type="button" class="bgm-toggle" id="bgmToggle" aria-pressed="false">Play</button>
    </div>
    <div class="theme-audio-row theme-audio-slider">
      <label class="theme-audio-label" for="bgmVolume">Volume</label>
      <input type="range" id="bgmVolume" min="0" max="100" step="5" value="40">
    </div>
    <p class="theme-audio-note">SFX are always on. BGM only plays after you press Play — browsers block autoplay until then.</p>
  `;
}

function renderTrackOptions() {
  const select = document.getElementById("bgmTrackSelect");
  if (!select) return;
  select.innerHTML = "";
  if (!tracks.length) {
    const opt = document.createElement("option");
    opt.textContent = "No tracks found";
    opt.disabled = true;
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  tracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.title;
    select.appendChild(opt);
  });
  select.value = String(currentTrackIndex);
}

function reflectUI() {
  const toggle = document.getElementById("bgmToggle");
  if (toggle) {
    const on = wantsPlaying;
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.textContent = on ? "Pause" : "Play";
    toggle.disabled = !tracks.length;
    if (!tracks.length) toggle.title = "No tracks found in assets/audio/";
  }

  const select = document.getElementById("bgmTrackSelect");
  if (select && tracks.length) select.value = String(currentTrackIndex);

  const slider = document.getElementById("bgmVolume");
  if (slider && Math.abs(parseFloat(slider.value) / 100 - currentVolume) > 0.01) {
    slider.value = String(Math.round(currentVolume * 100));
  }

  const note = document.querySelector(".theme-audio-note");
  if (note) {
    note.textContent = tracks.length
      ? "SFX are always on. BGM only plays after you press Play — browsers block autoplay until then."
      : "No tracks found in assets/audio/. Drop an MP3 in and reload.";
  }
}

function wireControls() {
  const toggle = document.getElementById("bgmToggle");
  if (toggle) toggle.addEventListener("click", toggleBgm);

  const select = document.getElementById("bgmTrackSelect");
  if (select) {
    select.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (!isNaN(idx)) selectTrack(idx);
    });
  }

  const slider = document.getElementById("bgmVolume");
  if (slider) {
    slider.addEventListener("input", (e) => setBgmVolume(parseFloat(e.target.value) / 100));
  }
}

export async function initBgm() {
  renderAudioBlock();

  tracks = await discoverTracks();
  readPrefs();

  renderTrackOptions();
  reflectUI();
  wireControls();

  if (wantsPlaying && tracks.length) armUnlock();

  // Cross-tab sync — if the user hits Play in one tab, every other
  // open tab follows.
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
    if (e.key === STORAGE_TRACK) {
      const idx = tracks.findIndex((x) => x.file === e.newValue);
      if (idx >= 0 && idx !== currentTrackIndex) selectTrack(idx);
    }
  });
}
