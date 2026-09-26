// ============================================
// 8CM — Background music (v17.1)
// ================================================================
// HARDCODED TRACKS + a fixed, manually-set start offset per track.
// Vercel does not expose directory listings, so tracks are explicit.
//
// v14.1: removed the automatic "quiet intro" detection (it downloaded
// and decoded the whole file in-browser just to guess where the
// track gets going — slow, unreliable on some files, and not worth
// it). If a track has a slow intro you want to skip, set `startAt`
// (seconds) on that track below by ear. Defaults to 0 (start of file).
//
// v14.3 — continuity across page navigation + a roomier Settings
// layout.
//
// This is a plain multi-page site, not a single-page app: every
// internal link is a full document load, which necessarily tears
// down the <audio> element and this whole module along with it.
// There's no way around that from here. What WAS avoidable is what
// used to happen next: initBgm() only *armed* an unlock listener and
// waited for the next click/keypress on the new page before playing
// anything, resuming each track from its fixed `startAt` rather than
// wherever it had gotten to — so every click to another page produced
// an audible gap and then a restart. Now the current track's position
// is saved continuously, and on load we (a) try to resume playback
// the instant the page is ready instead of waiting on a gesture, and
// (b) if that works, seek straight back to the saved position instead
// of `startAt`. On most browsers, once the site has been played once,
// this is genuinely gapless. `startAt` is still used for a track
// that's never been played yet. A real page *refresh* (not a link
// click) intentionally clears the saved position, so the track
// restarts fresh — matching what "refresh" implies everywhere else on
// the web.
//
// Also: the Track selector, Loop toggle, and Play/Pause are now three
// separate rows instead of Track+Loop being squeezed into one row.
//
// v17.1 — fades. Page changes used to cut the music dead, leave a gap,
// then start it again at full volume. Now:
//   • fadeOutBgm(ms)  — main-nav.js calls it while the page fades out
//   • fadeInBgm()     — called if a navigation is cancelled / the page is
//                       restored from the back-forward cache
//   • every start (page load, unlock tap, Play button) fades IN
//   • the resume position is nudged forward by the time that passed
//     since it was saved, so the dip sounds like a dip and not a rewind
// Volume is `currentVolume` (the slider) × `fadeLevel` (0–1, animated).
// iOS Safari ignores HTMLMediaElement.volume entirely, so on browsers
// where it can't be set the level goes through a Web Audio GainNode
// instead (the slider then works on iOS too).
// ================================================================

const BGM_CONFIG = {
  // Tracks used to live in this repo at assets/audio/; they've since
  // been moved to the dedicated 8cm-assets repo and are now served
  // through jsDelivr's CDN instead. Filenames are unchanged, so only
  // the base URL needed to move.
  audioDir: "https://cdn.jsdelivr.net/gh/mohxmedishan/8cm-assets@main/",
  tracks: [
    { file: "Taswell.mp3", title: "Taswell", startAt: 4.5 },
    { file: "AriaMath.mp3", title: "Aria Math", startAt: 0 },
    { file: "Danny.mp3", title: "Danny", startAt: 0 },
    { file: "LivingMice.mp3", title: "Living Mice", startAt: 28 },
    { file: "Haggstorm.mp3", title: "Haggstorm", startAt: 0 },
    { file: "WetHands.mp3", title: "Wet Hands", startAt: 0 },
    { file: "SubwooferLullaby.mp3", title: "Subwoofer Lullaby", startAt: 0 },
    { file: "MiceOnVenus.mp3", title: "Mice on Venus", startAt: 9.5 },
    { file: "Sweden.mp3", title: "Sweden", startAt: 0 },
    { file: "Otherside.mp3", title: "Otherside", startAt: 0 },
  ],
  defaultVolume: 0.4,
  // Default for a first-ever visit (no saved preference yet). Once
  // the person touches the Loop button, their choice is what's read
  // from STORAGE_LOOP on every later load instead.
  loop: true,
};

const STORAGE_PLAYING = "8cm:bgm:playing";
const STORAGE_VOLUME = "8cm:bgm:volume";
const STORAGE_TRACK = "8cm:bgm:track";
const STORAGE_LOOP = "8cm:bgm:loop";
const STORAGE_POSITION = "8cm:bgm:position"; // { file, time, savedAt }

let audio = null;
let wantsPlaying = false;
let unlocked = false;
let currentVolume = BGM_CONFIG.defaultVolume;
let currentTrackIndex = 0;
let loopEnabled = BGM_CONFIG.loop;
let playRequestId = 0; // guards against overlapping play attempts (see attemptPlay)
let resumeSeconds = 0; // where to seek to on the *next* buildAudio() call
let positionTimer = null;

// ---- v17.1 fade / gain plumbing ----
const FADE_IN_MS = 550;
const MAX_RESUME_GAP_S = 10; // don't "catch up" across a long absence
let fadeLevel = 1;           // 0–1, multiplied with currentVolume
let fadeToken = 0;           // bumping this cancels an in-flight fade
let audioCtx = null;
let gainNode = null;
let elementVolumeOk = null;  // null = not tested yet

function detectElementVolume() {
  if (elementVolumeOk !== null) return elementVolumeOk;
  try {
    const t = new Audio();
    t.volume = 0.5;
    elementVolumeOk = t.volume === 0.5;
  } catch {
    elementVolumeOk = true;
  }
  return elementVolumeOk;
}

function applyLevel() {
  const v = Math.max(0, Math.min(1, currentVolume * fadeLevel));
  if (gainNode) gainNode.gain.value = v;
  else if (audio) { try { audio.volume = v; } catch {} }
}

// Route a fresh <audio> through a GainNode — only when the element's own
// volume is read-only (iOS). Returns false if Web Audio isn't usable, in
// which case playback still works, just without fades.
function attachGain(a) {
  gainNode = null;
  if (detectElementVolume()) return false;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    if (!audioCtx) audioCtx = new Ctx();
    const src = audioCtx.createMediaElementSource(a);
    gainNode = audioCtx.createGain();
    src.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    return true;
  } catch {
    gainNode = null;
    return false;
  }
}

async function ensureContextRunning() {
  if (!audioCtx || audioCtx.state === "running") return;
  try {
    await Promise.race([audioCtx.resume(), new Promise((r) => setTimeout(r, 350))]);
  } catch {}
}

function fadeTo(target, ms) {
  const token = ++fadeToken;
  const from = fadeLevel;
  if (!audio || ms <= 0 || from === target) {
    fadeLevel = target;
    applyLevel();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (token === fadeToken) { fadeLevel = target; applyLevel(); }
      resolve();
    };
    const step = (now) => {
      if (done) return;
      if (token !== fadeToken) { finish(); return; }
      const t = Math.min(1, (now - t0) / ms);
      const eased = t * t * (3 - 2 * t); // smoothstep
      fadeLevel = from + (target - from) * eased;
      applyLevel();
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    // requestAnimationFrame stops in a hidden tab — never leave a promise dangling.
    setTimeout(finish, ms + 80);
  });
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
    const savedLoop = localStorage.getItem(STORAGE_LOOP);
    if (savedLoop === "1" || savedLoop === "0") loopEnabled = savedLoop === "1";
  } catch {}
}

function writePrefs() {
  try {
    localStorage.setItem(STORAGE_PLAYING, wantsPlaying ? "1" : "0");
    localStorage.setItem(STORAGE_VOLUME, String(currentVolume));
    localStorage.setItem(STORAGE_TRACK, BGM_CONFIG.tracks[currentTrackIndex]?.file || "");
    localStorage.setItem(STORAGE_LOOP, loopEnabled ? "1" : "0");
  } catch {}
}

// Was this document load a genuine refresh (F5 / reload button /
// address-bar Enter), as opposed to clicking a link to get here (or
// back/forward)? The Navigation Timing API can tell the two apart;
// browsers without it just fall back to "not a reload," i.e. always
// try to resume — the safe direction, since the worst case there is a
// track resuming a few seconds into itself instead of restarting.
function wasHardRefresh() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) return nav.type === "reload";
    if (performance.navigation) return performance.navigation.type === 1;
  } catch {}
  return false;
}

function readSavedPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_POSITION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSavedPosition() {
  if (!audio) return;
  try {
    const track = BGM_CONFIG.tracks[currentTrackIndex];
    if (!track || !isFinite(audio.currentTime)) return;
    localStorage.setItem(STORAGE_POSITION, JSON.stringify({
      file: track.file,
      time: audio.currentTime,
      savedAt: Date.now(),
    }));
  } catch {}
}

function startPositionTimer() {
  stopPositionTimer();
  positionTimer = setInterval(writeSavedPosition, 3000);
}
function stopPositionTimer() {
  if (positionTimer) { clearInterval(positionTimer); positionTimer = null; }
}

// When loop is off and a track finishes, advance to the next one
// (wrapping back to the first after the last) and keep playing.
// Native <audio>.loop handles the "on" case entirely on its own —
// it repeats the same track without ever firing "ended" — so this
// only needs to do anything when loop is off.
async function handleTrackEnded() {
  if (loopEnabled) return;
  const nextIndex = (currentTrackIndex + 1) % BGM_CONFIG.tracks.length;
  currentTrackIndex = nextIndex;
  resumeSeconds = 0; // a track we're advancing into on our own starts at its own startAt
  writePrefs();
  destroyAudio();
  if (wantsPlaying) await playBgm();
  reflectUI();
}

function buildAudio() {
  const track = BGM_CONFIG.tracks[currentTrackIndex];
  if (!track) return null;
  const configuredStart = typeof track.startAt === "number" && track.startAt > 0 ? track.startAt : 0;
  const seekTarget = resumeSeconds > 0 ? resumeSeconds : configuredStart;
  resumeSeconds = 0; // one-shot — only applies to the very next build
  const a = new Audio();
  // Tracks are now hosted cross-origin (jsDelivr), not same-origin like
  // before the assets split. Without this, attachGain()'s
  // createMediaElementSource() below silently taints the audio graph
  // on any browser that routes through it (iOS Safari, where the
  // element's own .volume can't be set — see detectElementVolume) and
  // the track plays back completely silent with no error thrown.
  // jsDelivr sends the permissive CORS header this needs, so this is
  // the only change required to keep that path working.
  a.crossOrigin = "anonymous";
  a.src = BGM_CONFIG.audioDir + track.file;
  a.loop = loopEnabled;
  a.preload = "auto";
  a.addEventListener("ended", handleTrackEnded);
  if (seekTarget > 0) {
    let seeked = false;
    const applySeek = () => {
      if (seeked || !a.duration || !isFinite(a.duration)) return;
      try {
        const wrapped = a.loop ? seekTarget % a.duration : seekTarget;
        a.currentTime = Math.min(wrapped, Math.max(0, a.duration - 1));
        seeked = true;
      } catch {}
    };
    // A same-origin file's metadata was available almost instantly, so
    // loadedmetadata/canplay alone was enough to catch the moment
    // a.duration became readable. A remote CDN resource can take
    // noticeably longer (or, on a flaky connection, land its events in
    // a different order), so the same one-time listeners could miss
    // the window entirely and the track would silently fall back to
    // startAt instead of resuming — this is the "continuation" bug.
    // canplaythrough plus a couple of short-interval retries closes
    // that gap without changing behavior for the common case, where
    // applySeek still just runs once on the very first event that has
    // a usable duration.
    a.addEventListener("loadedmetadata", applySeek);
    a.addEventListener("canplay", applySeek);
    a.addEventListener("canplaythrough", applySeek);
    [150, 400, 900].forEach((delay) => setTimeout(applySeek, delay));
  }
  return a;
}

// Stops and fully releases whatever is currently assigned to `audio`.
// Called before every new Audio() is created so there is never more
// than one track playing at once — a fast double play()/toggle could
// otherwise build a second <audio> element while the first was still
// sounding, and the two would overlap indefinitely since nothing ever
// paused the first one.
function destroyAudio() {
  stopPositionTimer();
  fadeToken++; // cancel any fade still running on the old element
  if (gainNode) { try { gainNode.disconnect(); } catch {} gainNode = null; }
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
  attachGain(a);
  fadeLevel = 0; // every start fades in from silence
  applyLevel();
  try {
    if (gainNode) await ensureContextRunning();
    await a.play();
    if (myRequest !== playRequestId) {
      // A newer request started while this one was awaiting play() —
      // this one lost the race, so stop it instead of letting it run
      // alongside whatever the newer request is playing.
      try { a.pause(); } catch {}
      return false;
    }
    // A suspended AudioContext would "play" in silence and never arm the
    // unlock listener — treat it as blocked so the next tap unlocks it.
    if (gainNode && audioCtx.state !== "running") throw new Error("audio context suspended");
    unlocked = true;
    startPositionTimer();
    fadeTo(1, FADE_IN_MS);
    return true;
  } catch {
    if (myRequest === playRequestId && audio === a) {
      try { a.pause(); } catch {}
      if (gainNode) { try { gainNode.disconnect(); } catch {} gainNode = null; }
      audio = null;
    }
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
      reflectUI();
    }
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

export function isBgmPlaying() { return wantsPlaying && audio && !audio.paused; }

// Called by main-nav.js the moment a page change starts. Resolves when the
// music is silent (or straight away if nothing is playing). Deliberately
// does NOT pause: if the navigation is cancelled, fadeInBgm() just brings
// the level back and nobody heard a restart.
export function fadeOutBgm(ms = 240) {
  if (!audio || audio.paused) return Promise.resolve();
  writeSavedPosition();
  return fadeTo(0, ms).then(writeSavedPosition);
}

// Counterpart to fadeOutBgm(): navigation cancelled, or the page came
// back from the back-forward cache (browsers pause media when a page is
// frozen, so it may need a nudge to play again).
export function fadeInBgm(ms = 450) {
  if (!wantsPlaying) return Promise.resolve();
  if (audio && !audio.paused) return fadeTo(1, ms);
  if (audio && audio.paused) {
    return audio.play().then(() => fadeTo(1, ms)).catch(() => { armUnlock(); });
  }
  return attemptPlay().then((ok) => { if (!ok) armUnlock(); });
}

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
  writeSavedPosition();
  destroyAudio();
  reflectUI();
}

export function toggleBgm() { if (wantsPlaying) pauseBgm(); else playBgm(); }

export function setBgmVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v));
  applyLevel();
  writePrefs();
  reflectUI();
}

export function isBgmLoopEnabled() { return loopEnabled; }

// On: the current track repeats itself forever. Off: it plays once,
// then advances to the next track (wrapping around after the last).
export function setBgmLoop(enabled) {
  loopEnabled = !!enabled;
  if (audio) audio.loop = loopEnabled;
  writePrefs();
  reflectUI();
}

export function toggleBgmLoop() { setBgmLoop(!loopEnabled); }

export async function selectTrack(index) {
  if (index < 0 || index >= BGM_CONFIG.tracks.length || index === currentTrackIndex) return;
  const wasPlaying = wantsPlaying;
  currentTrackIndex = index;
  resumeSeconds = 0; // a track someone just picked starts at its own startAt, not a stale saved time
  writePrefs();
  destroyAudio();
  if (wasPlaying) await playBgm();
  reflectUI();
}

function renderAudioBlock() {
  const block = document.querySelector(".theme-audio-block");
  if (!block || block.dataset.bgmRendered === "v14.3") return;
  block.dataset.bgmRendered = "v14.3";
  block.innerHTML = `
    <h3>Sound</h3>
    <p class="modal-sub">Pick a track, whether it loops, and how loud it plays.</p>
    <div class="bgm-track-row">
      <label class="theme-audio-label" for="bgmTrackSelect">Track</label>
      <select class="bgm-track-select" id="bgmTrackSelect" aria-label="Choose background music"></select>
    </div>
    <div class="theme-audio-row">
      <span class="theme-audio-label">Loop this track</span>
      <button type="button" class="bgm-loop-toggle" id="bgmLoopToggle" aria-pressed="false" title="On repeats this track. Off plays through to the next.">Off</button>
    </div>
    <div class="theme-audio-row">
      <span class="theme-audio-label">Background music</span>
      <button type="button" class="bgm-toggle" id="bgmToggle" aria-pressed="false">Play</button>
    </div>
    <div class="theme-audio-row theme-audio-slider">
      <label class="theme-audio-label" for="bgmVolume">Volume</label>
      <input type="range" id="bgmVolume" min="0" max="100" step="5" value="40">
    </div>
    <p class="theme-audio-note">SFX are always on. BGM only plays after you press Play — browsers block autoplay until then. Once started, it keeps going as you move between pages instead of restarting; only refreshing the page starts it over.</p>
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
  const loopBtn = document.getElementById("bgmLoopToggle");
  if (loopBtn) {
    loopBtn.setAttribute("aria-pressed", loopEnabled ? "true" : "false");
    loopBtn.textContent = loopEnabled ? "On" : "Off";
    loopBtn.classList.toggle("is-active", loopEnabled);
  }
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
  const loopBtn = document.getElementById("bgmLoopToggle");
  if (loopBtn) loopBtn.addEventListener("click", toggleBgmLoop);
}

// Note on multiple tabs: each tab owns its own playback independently,
// on purpose. Syncing "playing" across tabs would mean opening the
// site in a second tab (or a link in a new tab) could silently start
// a *second* audio stream playing on top of the first the moment you
// press Play in either one — with no user gesture in the other tab to
// justify it. Preferences (track/volume/loop) still persist via
// localStorage and apply the next time a page loads; only cross-tab
// auto-play is intentionally left out. Playback *position* is handled
// differently (see the v14.3 note at the top) so that moving between
// pages in the SAME tab feels continuous instead of restarting.
export async function initBgm() {
  renderAudioBlock();
  readPrefs();

  const hardRefresh = wasHardRefresh();
  if (hardRefresh) {
    // Explicit refresh: honor it as an intentional restart. Drop the
    // saved mid-track position so the track resumes at its configured
    // startAt like it always used to, instead of silently reappearing
    // wherever it happened to be.
    try { localStorage.removeItem(STORAGE_POSITION); } catch {}
  } else {
    const saved = readSavedPosition();
    const track = BGM_CONFIG.tracks[currentTrackIndex];
    if (saved && track && saved.file === track.file && saved.time > 0) {
      // Catch up by the time spent in transit so the music carries on where
      // it *would* be, rather than rewinding to where the last page left it.
      const gap = saved.savedAt ? (Date.now() - saved.savedAt) / 1000 : 0;
      const catchUp = gap > 0 && gap <= MAX_RESUME_GAP_S ? gap : 0;
      resumeSeconds = saved.time + catchUp;
    }
  }

  renderTrackOptions();
  reflectUI();
  wireControls();

  if (wantsPlaying && BGM_CONFIG.tracks.length) {
    // Try to just resume immediately — on a normal in-site navigation
    // this usually succeeds without needing another click (the browser
    // remembers this origin already has permission to play audio), and
    // that's what actually delivers "doesn't restart when you switch
    // pages." If the browser blocks it, fall back to the old
    // click-to-unlock behavior exactly as before.
    const ok = await attemptPlay();
    if (!ok) armUnlock();
    reflectUI();
  }

  // Catch the moment a navigation actually happens, in addition to the
  // periodic timer in startPositionTimer(), so a fast click-through
  // doesn't lose up to 3s of position.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeSavedPosition();
  });
  window.addEventListener("pagehide", writeSavedPosition);
}
