// ============================================
// 8CM — Premade avatars
// ------------------------------------------------
// Each avatar is a 64×64 SVG data URI: a colored circle with an emoji
// glyph on top. Nothing to host, nothing to load from the network.
// Only the short avatar ID is stored in Firestore.
// ============================================
import {
  doc, setDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const C = {
  winter: "#7ea8c4",
  autumn: "#c1723a",
  spring: "#7c9a5d",
  summer: "#d9a441",
  accent: "#6b9a8f",
  violet: "#9a6bb0",
  rose: "#c16590",
  red: "#c1665a",
};

export const AVATARS = [
  { id: "cat", bg: C.autumn, emoji: "🐱", label: "Cat" },
  { id: "dog", bg: C.winter, emoji: "🐶", label: "Dog" },
  { id: "fox", bg: C.autumn, emoji: "🦊", label: "Fox" },
  { id: "owl", bg: C.spring, emoji: "🦉", label: "Owl" },
  { id: "bear", bg: C.violet, emoji: "🐻", label: "Bear" },
  { id: "rabbit", bg: C.rose, emoji: "🐰", label: "Rabbit" },
  { id: "panda", bg: C.accent, emoji: "🐼", label: "Panda" },
  { id: "tiger", bg: C.summer, emoji: "🐯", label: "Tiger" },
  { id: "wolf", bg: C.winter, emoji: "🐺", label: "Wolf" },
  { id: "eagle", bg: C.red, emoji: "🦅", label: "Eagle" },
  { id: "dolphin", bg: C.winter, emoji: "🐬", label: "Dolphin" },
  { id: "turtle", bg: C.spring, emoji: "🐢", label: "Turtle" },
  { id: "penguin", bg: C.winter, emoji: "🐧", label: "Penguin" },
  { id: "elephant", bg: C.violet, emoji: "🐘", label: "Elephant" },
  { id: "lion", bg: C.summer, emoji: "🦁", label: "Lion" },
  { id: "book", bg: C.autumn, emoji: "📚", label: "Book" },
  { id: "pencil", bg: C.summer, emoji: "✏️", label: "Pencil" },
  { id: "atom", bg: C.accent, emoji: "⚛️", label: "Atom" },
  { id: "flask", bg: C.spring, emoji: "🧪", label: "Flask" },
  { id: "compass", bg: C.red, emoji: "🧭", label: "Compass" },
  { id: "star", bg: C.summer, emoji: "⭐", label: "Star" },
  { id: "moon", bg: C.violet, emoji: "🌙", label: "Moon" },
  { id: "sun", bg: C.summer, emoji: "☀️", label: "Sun" },
  { id: "leaf", bg: C.spring, emoji: "🍃", label: "Leaf" },
  { id: "mountain", bg: C.winter, emoji: "⛰️", label: "Mountain" },
  { id: "wave", bg: C.winter, emoji: "🌊", label: "Wave" },
  { id: "cloud", bg: C.winter, emoji: "☁️", label: "Cloud" },
  { id: "rocket", bg: C.red, emoji: "🚀", label: "Rocket" },
  { id: "planet", bg: C.violet, emoji: "🪐", label: "Planet" },
  { id: "crystal", bg: C.rose, emoji: "💎", label: "Crystal" },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));
const svgCache = new Map();

export function avatarUrl(id) {
  if (!id) return null;
  if (svgCache.has(id)) return svgCache.get(id);
  const a = byId.get(id);
  if (!a) return null;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="${a.bg}"/>` +
    `<text x="32" y="46" font-size="38" text-anchor="middle" ` +
    `font-family="system-ui,-apple-system,'Apple Color Emoji','Segoe UI Emoji',sans-serif">` +
    `${a.emoji}</text></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  svgCache.set(id, url);
  return url;
}

export function avatarLabel(id) {
  const a = byId.get(id);
  return a ? a.label : null;
}

function initialsOf(name) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export function avatarMarkup(avatarId, name, size = 32, extraClass = "") {
  const url = avatarUrl(avatarId);
  const cls = `cm-avatar ${extraClass}`.trim();
  const safeSize = Math.max(16, Number(size) || 32);
  const style = `width:${safeSize}px;height:${safeSize}px;font-size:${Math.round(safeSize * 0.4)}px;`;
  if (url) {
    return `<span class="${cls}" style="${style}"><img src="${url}" alt="" loading="lazy"></span>`;
  }
  return `<span class="${cls} cm-avatar-initials" style="${style}">${initialsOf(name)}</span>`;
}

// avatars/{uid} = { id: "fox" | null }
import { subscribeAuth } from "./auth.js";

let cache = new Map();
const listeners = new Set();
let loaded = false;
let inflight = null;
let currentUid = null;

subscribeAuth((state) => {
  currentUid = state.user ? state.user.uid : null;
  notify();
});

function notify() {
  listeners.forEach((cb) => {
    try {
      cb(cache);
    } catch (err) {
      console.error("Avatar listener failed:", err);
    }
  });
}

export function onAvatars(cb) {
  listeners.add(cb);
  cb(cache);
  return () => listeners.delete(cb);
}

export function getAvatarForUid(uid) {
  if (!uid) return null;
  return cache.get(uid) || null;
}

export function getCurrentUid() {
  return currentUid;
}

export async function loadAvatars({ force = false } = {}) {
  if (loaded && !force) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const snap = await getDocs(collection(db, "avatars"));
      const next = new Map();

      snap.forEach((d) => {
        const data = d.data();
        if (data && data.id) next.set(d.id, data.id);
      });

      cache = next;
      loaded = true;
      notify();
      return cache;
    } catch (err) {
      console.error("Failed to load avatars:", err);
      loaded = false;
      return cache;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Backward-compatible:
//   setAvatarForUid("fox")
//   setAvatarForUid(uid, "fox")
export async function setAvatarForUid(uidOrAvatarId, maybeAvatarId) {
  let uid;
  let avatarId;

  if (maybeAvatarId !== undefined) {
    uid = uidOrAvatarId;
    avatarId = maybeAvatarId;
  } else {
    uid = currentUid;
    avatarId = uidOrAvatarId;
  }

  if (!uid) throw new Error("Cannot set an avatar while signed out.");

  const id = avatarId || null;
  if (id && !byId.has(id)) {
    throw new Error("Unknown avatar.");
  }

  const previous = cache.has(uid) ? cache.get(uid) : null;

  // Update locally first so every render site reacts immediately.
  cache.set(uid, id);
  loaded = true;
  notify();

  try {
    await setDoc(doc(db, "avatars", uid), { id });
  } catch (err) {
    console.error("Avatar write failed, rolling back:", err);

    if (previous) {
      cache.set(uid, previous);
    } else {
      cache.delete(uid);
    }

    notify();
    throw err;
  }
}
