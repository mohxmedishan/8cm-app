// ============================================
// 8CM — Background music (v14)
// ================================================================
// HARDCODED TRACKS + automatic quiet-intro detection.
// Vercel does not expose directory listings, so tracks are explicit.
// The first play decodes the selected file in-browser and estimates
// where meaningful audio begins. The detected offset is cached.
// ================================================================

const BGM_CONFIG = {
  audioDir: "assets/audio/",
  tracks: [
    { file: "Taswell.mp3", title: "Taswell" },
    { file: "AriaMath.mp3", title: "Aria Math" },
    { file: "Danny.mp3", title: "Danny" },
    { file: "LivingMice.mp3", title: "Living Mice" },
    { file: "Haggstorm.mp3", title: "Haggstorm" },
    { file: "WetHands.mp3", title: "Wet Hands" },
    { file: "SubwooferLullaby.mp3", title: "Subwoofer Lullaby" },
  ],
  defaultVolume: 0.4,
  loop: true,
};

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";
const STORAGE_TRACK = "8cm:bgm:track";
const STORAGE_START_PREFIX = "8cm:bgm:startAt:";

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = BGM_CONFIG.defaultVolume;
let currentTrackIndex = 0;
let appliedSeek = 0;
let analyzing = false;
const startCache = new Map();

async function detectStartTime(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("Web Audio unavailable");
  const ctx = new AudioCtx();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.1);
  const windowCount = Math.floor(channel.length / windowSize);
  if (windowCount < 4) return 0;
  const rms = new Float32Array(windowCount);
  let peak = 0;
  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const x = channel[start + j];
      sum += x * x;
    }
    rms[i] = Math.sqrt(sum / windowSize);
    if (rms[i] > peak) peak = rms[i];
  }
  const threshold = Math.max(peak * 0.2, 0.02);
  let startWindow = 0;
  for (let i = 0; i < windowCount - 3; i++) {
    if (rms[i] < threshold) continue;
    const avg = (rms[i] + rms[i + 1] + rms[i + 2] + rms[i + 3]) / 4;
    if (avg >= threshold) { startWindow = i; break; }
  }
  return Math.max(0, (startWindow * windowSize) / sampleRate - 0.5);
}

async function ensureStartTime(track) {
  if (typeof track.startAt === "number") return track.startAt;
  if (startCache.has(track.file)) return startCache.get(track.file);
  try {
    const cached = localStorage.getItem(STORAGE_START_PREFIX + track.file);
    if (cached !== null) {
      const v = parseFloat(cached);
      if (!isNaN(v)) { startCache.set(track.file, v); return v; }
    }
  } catch {}
  analyzing = true;
  reflectUI();
  try {
    const seconds = await detectStartTime(BGM_CONFIG.audioDir + track.file);
    startCache.set(track.file, seconds);
    try { localStorage.setItem(STORAGE_START_PREFIX + track.file, String(seconds)); } catch {}
    return seconds;
  } catch (err) {
    console.warn("[8CM] Quiet-intro detection failed for", track.file, err);
    startCache.set(track.file, 0);
    return 0;
  } finally {
    analyzing = false;
    reflectUI();
  }
}

function readPrefs() {
  try {
    wantsPlaying = localStorage.getItem(STORAGE_PLAYING) === "1";
    const v = parseFloat(localStorage.getItem(STORAGE_VOLUME));
    if (!isNaN(v) && v >= 0 && v <= 1) currentVolume = v;
    const savedFile = localStorage.getItem(STORAGE_TRACK);
    if (savedFile) {
      const idx = BGM_CONFIG.tracks.findIndex(x => x.file === savedFile);
      if (idx >= 0) currentTrackIndex = idx;
    }
  } catch {}
}

function writePrefs() {
  try {
    localStorage.setItem(STORAGE_PLAYING, wantsPlaying ? "1" : "0");
    localStorage.setItem(STORAGE_VOLUME, String(currentVolume));
    localStorage.setItem(STORAGE_TRACK, BGM_CONFIG.tracks[currentTrackIndex]?.file || "");
  } catch {}
}

async function buildAudio() {
  const track = BGM_CONFIG.tracks[currentTrackIndex];
  if (!track) return null;
  const startAt = await ensureStartTime(track);
  appliedSeek = startAt;
  audio = new Audio();
  audio.src = BGM_CONFIG.audioDir + track.file;
  audio.loop = BGM_CONFIG.loop;
  audio.preload = "auto";
  audio.volume = currentVolume;
  if (startAt > 0) {
    const applySeek = () => {
      if (!audio || appliedSeek <= 0 || !audio.duration || !isFinite(audio.duration)) return;
      try {
        audio.currentTime = Math.min(appliedSeek, audio.duration - 1);
        appliedSeek = 0;
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
  try { audio.src = ""; } catch {}
  audio = null;
  appliedSeek = 0;
}

async function attemptPlay() {
  const a = await buildAudio();
  if (!a) return false;
  try { await a.play(); unlocked = true; return true; }
  catch { return false; }
}

function armUnlock() {
  if (unlocked) return;
  const unlock = async () => {
    if (unlocked) return;
    if (await attemptPlay()) {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    }
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

export function isBgmPlaying() { return wantsPlaying && audio && !audio.paused; }

export async function playBgm() {
  if (!BGM_CONFIG.tracks.length) return false;
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

export function toggleBgm() { if (wantsPlaying) pauseBgm(); else playBgm(); }

export function setBgmVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v));
  if (audio) audio.volume = currentVolume;
  writePrefs();
  reflectUI();
}

export async function selectTrack(index) {
  if (index < 0 || index >= BGM_CONFIG.tracks.length || index === currentTrackIndex) return;
  const wasPlaying = wantsPlaying;
  currentTrackIndex = index;
  writePrefs();
  destroyAudio();
  if (wasPlaying) await playBgm();
  reflectUI();
}

function renderAudioBlock() {
  const block = document.querySelector(".theme-audio-block");
  if (!block || block.dataset.bgmRendered === "v14") return;
  block.dataset.bgmRendered = "v14";
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
  BGM_CONFIG.tracks.forEach((t, i) => {
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
    if (analyzing) {
      toggle.textContent = "Analyzing…";
      toggle.disabled = true;
    } else {
      toggle.setAttribute("aria-pressed", wantsPlaying ? "true" : "false");
      toggle.textContent = wantsPlaying ? "Pause" : "Play";
      toggle.disabled = false;
    }
  }
  const select = document.getElementById("bgmTrackSelect");
  if (select) select.value = String(currentTrackIndex);
  const slider = document.getElementById("bgmVolume");
  if (slider && Math.abs(parseFloat(slider.value) / 100 - currentVolume) > 0.01)
    slider.value = String(Math.round(currentVolume * 100));
}

function wireControls() {
  const toggle = document.getElementById("bgmToggle");
  if (toggle) toggle.addEventListener("click", toggleBgm);
  const select = document.getElementById("bgmTrackSelect");
  if (select) select.addEventListener("change", e => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx)) selectTrack(idx);
  });
  const slider = document.getElementById("bgmVolume");
  if (slider) slider.addEventListener("input", e => setBgmVolume(parseFloat(e.target.value) / 100));
}

export async function initBgm() {
  renderAudioBlock();
  readPrefs();
  renderTrackOptions();
  reflectUI();
  wireControls();
  if (wantsPlaying && BGM_CONFIG.tracks.length) armUnlock();
  window.addEventListener("storage", e => {
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
      const idx = BGM_CONFIG.tracks.findIndex(x => x.file === e.newValue);
      if (idx >= 0 && idx !== currentTrackIndex) selectTrack(idx);
    }
  });
}
