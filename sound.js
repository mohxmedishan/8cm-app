// ============================================
// 8CM — UI sound effects
// ------------------------------------------------
// Every sound here is synthesized on the fly with the Web Audio API
// (short sine/triangle blips shaped with a quick volume envelope) —
// there are no audio files to host or load, so this stays fast and
// has zero network dependency. Browsers won't let a page make sound
// before the user has interacted with it at all, so the shared
// AudioContext is created lazily on first use rather than at load.
//
// Import the play* functions anywhere a click/open/close/success/
// error should have a sound, and call initSoundToggle() once (from
// script.js) to wire up the mute button in the nav.
// ============================================

const STORAGE_KEY = "8cm-sound-muted";
const $ = (id) => document.getElementById(id);

let ctx = null;
let muted = localStorage.getItem(STORAGE_KEY) === "true";

function getContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// A single short tone: frequency in Hz, duration in seconds, a
// waveform shape, and a start delay (for chaining notes into simple
// little melodies). Volume follows a quick attack + exponential decay
// so nothing ever clicks or pops.
function tone(freq, { duration = 0.12, type = "sine", delay = 0, gain = 0.09, glideTo = null } = {}) {
  const audio = getContext();
  if (!audio || muted) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// ------------------------------------------------
// Public sound palette — each one used for a distinct kind of
// interaction, so the site starts to feel responsive without being
// noisy or repetitive.
// ------------------------------------------------

/** Generic button / pill / link click. */
export function playClick() {
  tone(720, { duration: 0.05, type: "triangle", gain: 0.06 });
}

/** A filter pill or toggle being turned ON. */
export function playToggleOn() {
  tone(660, { duration: 0.07, type: "sine", gain: 0.07 });
  tone(880, { duration: 0.09, type: "sine", gain: 0.06, delay: 0.05 });
}

/** A filter pill or toggle being turned OFF. */
export function playToggleOff() {
  tone(520, { duration: 0.08, type: "sine", gain: 0.06 });
}

/** Opening a panel, dropdown, modal, or the mobile menu. */
export function playOpen() {
  tone(440, { duration: 0.1, type: "sine", gain: 0.06, glideTo: 660 });
}

/** Closing a panel, dropdown, modal, or the mobile menu. */
export function playClose() {
  tone(520, { duration: 0.1, type: "sine", gain: 0.06, glideTo: 320 });
}

/** A save/sign-in/claim that completed successfully — small ascending chime. */
export function playSuccess() {
  tone(523.25, { duration: 0.1, type: "sine", gain: 0.07 });
  tone(659.25, { duration: 0.1, type: "sine", gain: 0.07, delay: 0.08 });
  tone(783.99, { duration: 0.16, type: "sine", gain: 0.08, delay: 0.16 });
}

/** A failed submit / sign-in / validation error — short low buzz. */
export function playError() {
  tone(220, { duration: 0.14, type: "sawtooth", gain: 0.05 });
  tone(180, { duration: 0.18, type: "sawtooth", gain: 0.05, delay: 0.09 });
}

/** A destructive action completing (deleting a task). */
export function playDelete() {
  tone(500, { duration: 0.12, type: "triangle", gain: 0.07, glideTo: 180 });
}

/** Very soft tick for nav links / lower-emphasis clicks. */
export function playNav() {
  tone(880, { duration: 0.035, type: "sine", gain: 0.045 });
}

/** Opening an external link/resource in a new tab. */
export function playExternal() {
  tone(600, { duration: 0.06, type: "sine", gain: 0.05 });
  tone(950, { duration: 0.07, type: "sine", gain: 0.045, delay: 0.045 });
}

export function isMuted() {
  return muted;
}

function updateToggleUI() {
  const btn = $("soundToggleBtn");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(muted));
  btn.setAttribute("aria-label", muted ? "Unmute sounds" : "Mute sounds");
  btn.title = muted ? "Sound effects (off)" : "Sound effects (on)";
  const onIcon = btn.querySelector(".sound-icon-on");
  const offIcon = btn.querySelector(".sound-icon-off");
  if (onIcon) onIcon.hidden = muted;
  if (offIcon) offIcon.hidden = !muted;
}

/** Wires up the nav's mute/unmute button. Safe to call once at boot. */
export function initSoundToggle() {
  updateToggleUI();
  const btn = $("soundToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // Play the confirmation chime *before* flipping the flag when
    // muting, so the person hears that it worked; skip it when
    // unmuting into silence would be the whole point of the click.
    if (!muted) tone(440, { duration: 0.09, type: "sine", gain: 0.07, glideTo: 220 });
    muted = !muted;
    localStorage.setItem(STORAGE_KEY, String(muted));
    updateToggleUI();
    if (!muted) tone(660, { duration: 0.09, type: "sine", gain: 0.07 });
  });
}
