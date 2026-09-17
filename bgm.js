// ============================================
// 8CM — Background music player (synth)
// ------------------------------------------------
// Instead of loading an audio file (which would 404 the moment we
// didn't ship one), this generates a slow ambient pad with the Web
// Audio API. No asset to host, no network hit, works offline.
//
// Chord progression is a slow minor-key cycle. Volume is user
// controlled and persists in localStorage. Play state persists too —
// navigating between pages resumes on the first user interaction
// (browsers block autoplay otherwise).
// ============================================

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";
const DEFAULT_VOLUME = 0.4;

// Slow minor progression — Am, F, C, G, at 8s per chord.
const PROGRESSION = [
  { bass: 110.00, mid: 220.00, high: 261.63 },  // Am
  { bass:  87.31, mid: 174.61, high: 220.00 },  // F
  { bass: 130.81, mid: 261.63, high: 329.63 },  // C
  { bass:  98.00, mid: 196.00, high: 246.94 },  // G
];
const CHORD_SECONDS = 8;

let ctx = null;
let master = null;
let filter = null;
let currentVolume = DEFAULT_VOLUME;
let wantsPlaying = false;
let unlocked = false;
let activeVoices = [];
let loopTimer = null;
let progressionIndex = 0;

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

function getCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function ensureChain() {
  const c = getCtx();
  if (!c) return null;
  if (!master) {
    filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;

    master = c.createGain();
    master.gain.value = 0;

    filter.connect(master);
    master.connect(c.destination);
  }
  return c;
}

// One chord = three sine oscillators fading in and out over CHORD_SECONDS.
function playChord(chord, atTime) {
  const c = getCtx();
  if (!c) return;
  const duration = CHORD_SECONDS;
  const voices = [
    { freq: chord.bass, gain: 0.14 },
    { freq: chord.mid,  gain: 0.06 },
    { freq: chord.high, gain: 0.04 },
  ];
  voices.forEach((v) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    // Small detune on the upper voices for a chorus effect.
    osc.type = "sine";
    osc.frequency.value = v.freq;
    osc.detune.value = v === voices[0] ? 0 : (Math.random() * 6 - 3);

    g.gain.setValueAtTime(0, atTime);
    g.gain.linearRampToValueAtTime(v.gain, atTime + 2.2);
    g.gain.linearRampToValueAtTime(0, atTime + duration - 0.3);

    osc.connect(g);
    g.connect(filter);
    osc.start(atTime);
    osc.stop(atTime + duration + 0.5);
    activeVoices.push(osc);
  });
}

function scheduleLoop() {
  if (!wantsPlaying) return;
  const c = getCtx();
  if (!c) return;

  // Kick the first chord if this is the initial call
  const now = c.currentTime + 0.05;
  const chord = PROGRESSION[progressionIndex % PROGRESSION.length];
  progressionIndex++;
  playChord(chord, now);

  // Schedule the next chord
  loopTimer = setTimeout(scheduleLoop, CHORD_SECONDS * 1000 - 500);
}

function startPlayback() {
  const c = ensureChain();
  if (!c) return false;
  // Ramp master up from wherever it was
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(master.gain.value, c.currentTime);
  master.gain.linearRampToValueAtTime(currentVolume * 0.28, c.currentTime + 1.2);
  if (!loopTimer) scheduleLoop();
  return true;
}

function stopPlayback() {
  const c = getCtx();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(master.gain.value, c.currentTime);
  master.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

function applyVolume() {
  const c = getCtx();
  if (!c || !master) return;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(master.gain.value, c.currentTime);
  master.gain.linearRampToValueAtTime(wantsPlaying ? currentVolume * 0.28 : 0, c.currentTime + 0.25);
}

// ---------------------------------------------------------------
// Unlock handler — browsers block audio until a user gesture.
// Attach once; the first pointerdown/keydown starts playback.
// ---------------------------------------------------------------
function armUnlock() {
  if (unlocked) return;
  const unlock = () => {
    if (unlocked) return;
    const c = getCtx();
    if (!c) return;
    unlocked = true;
    if (wantsPlaying) startPlayback();
    reflectUI();
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------
export function isBgmPlaying() { return wantsPlaying; }
export function getBgmVolume() { return currentVolume; }

export function playBgm() {
  wantsPlaying = true;
  writePrefs();
  unlocked = true; // clicking the toggle IS a gesture
  startPlayback();
  reflectUI();
}

export function pauseBgm() {
  wantsPlaying = false;
  writePrefs();
  stopPlayback();
  reflectUI();
}

export function toggleBgm() {
  if (wantsPlaying) pauseBgm();
  else playBgm();
}

export function setBgmVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v));
  writePrefs();
  applyVolume();
  reflectUI();
}

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
  if (toggle) toggle.addEventListener("click", toggleBgm);

  const slider = document.getElementById("bgmVolume");
  if (slider) {
    slider.value = String(Math.round(currentVolume * 100));
    slider.addEventListener("input", (e) => setBgmVolume(parseFloat(e.target.value) / 100));
  }

  if (wantsPlaying) armUnlock();

  // If another tab toggles BGM, reflect it here.
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