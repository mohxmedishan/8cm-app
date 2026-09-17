// ============================================
// 8CM — Background music (v14.1)
// ================================================================
// HARDCODED TRACKS + a fixed, manually-set start offset per track.
// Vercel does not expose directory listings, so tracks are explicit.
//
// v14.1: removed the automatic "quiet intro" detection (it downloaded
// and decoded the whole file in-browser just to guess where the
// track gets going — slow, unreliable on some files, and not worth
// it). If a track has a slow intro you want to skip, set `startAt`
// (seconds) on that track below by ear. Defaults to 0 (start of file).
// ================================================================

const BGM_CONFIG = {
  audioDir: "assets/audio/",
  tracks: [
    { file: "Taswell.mp3", title: "Taswell", startAt: 0 },
    { file: "AriaMath.mp3", title: "Aria Math", startAt: 0 },
    { file: "Danny.mp3", title: "Danny", startAt: 0 },
    { file: "LivingMice.mp3", title: "Living Mice", startAt: 0 },
    { file: "Haggstorm.mp3", title: "Haggstorm", startAt: 0 },
    { file: "WetHands.mp3", title: "Wet Hands", startAt: 0 },
    { file: "SubwooferLullaby.mp3", title: "Subwoofer Lullaby", startAt: 0 },
  ],
  defaultVolume: 0.4,
  loop: true,
};

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";
const STORAGE_TRACK = "8cm:bgm:track";

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = BGM_CONFIG.defaultVolume;
let currentTrackIndex = 0;
let playRequestId = 0; // guards against overlapping play attempts (see attemptPlay)

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

function buildAudio() {
  const track = BGM_CONFIG.tracks[currentTrackIndex];
  if (!track) return null;
  const startAt = typeof track.startAt === "number" && track.startAt > 0 ? track.startAt : 0;
  const a = new Audio();
  a.src = BGM_CONFIG.audioDir + track.file;
  a.loop = BGM_CONFIG.loop;
  a.preload = "auto";
  a.volume = currentVolume;
  if (startAt > 0) {
    let seeked = false;
    const applySeek = () => {
      if (seeked || !a.duration || !isFinite(a.duration)) return;
      try {
        a.currentTime = Math.min(startAt, Math.max(0, a.duration - 1));
        seeked = true;
      } catch {}
    };
    a.addEventListener("loadedmetadata", applySeek);
    a.addEventListener("canplay", applySeek);
  }
  return a;
}

// Stops and fully releases whatever is currently assigned to `audio`.
// Called before every new Audio() is created so there is never more
// than one track playing at once — previously a fast double
// play()/toggle (or the old cross-tab sync) could build a second
// <audio> element while the first was still sounding, and the two
// would overlap indefinitely since nothing ever paused the first one.
function destroyAudio() {
  if (!audio) return;
  try { audio.pause(); } catch {}
  try { audio.removeAttribute("src"); audio.load(); } catch {}
  audio = null;
}

async function attemptPlay() {
  // Bump a request id and destroy any existing audio synchronously,
  // *before* the async play() call below — this closes the race where
  // two attemptPlay() calls overlap (e.g. a double-click, or pointerdown
  // and keydown both firing for the same interaction) and each builds
  // its own <audio> element, resulting in two tracks sounding at once.
  const myRequest = ++playRequestId;
  destroyAudio();
  const a = buildAudio();
  if (!a) return false;
  audio = a;
  try {
    await a.play();
    if (myRequest !== playRequestId) {
      // A newer request started while this one was awaiting play() —
      // this one lost the race, so stop it instead of letting it run
      // alongside whatever the newer request is playing.
      try { a.pause(); } catch {}
      return false;
    }
    unlocked = true;
    return true;
  } catch {
    if (myRequest === playRequestId && audio === a) audio = null;
    return false;
  }
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
  destroyAudio();
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
  if (!block || block.dataset.bgmRendered === "v14.1") return;
  block.dataset.bgmRendered = "v14.1";
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
    toggle.setAttribute("aria-pressed", wantsPlaying ? "true" : "false");
    toggle.textContent = wantsPlaying ? "Pause" : "Play";
    toggle.disabled = false;
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

// Note on multiple tabs: each tab now owns its own playback
// independently, on purpose. v14 used to sync "playing" across tabs
// via the storage event, which meant opening the site in a second tab
// (or a link in a new tab) could silently start a *second* audio
// stream playing on top of the first the moment you pressed Play in
// either one — with no user gesture in the other tab to justify it.
// Preferences (track/volume) still persist via localStorage and apply
// the next time a page loads; only cross-tab auto-play was removed.
export async function initBgm() {
  renderAudioBlock();
  readPrefs();
  renderTrackOptions();
  reflectUI();
  wireControls();
  if (wantsPlaying && BGM_CONFIG.tracks.length) armUnlock();
}
