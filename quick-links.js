// ============================================
// 8CM — Quick links
// ------------------------------------------------
// Monitor-managed shortcuts shown in index.html#quick-links.
// Logos are built into the site as inline SVGs. No uploads.
// Defaults can also be edited/deleted through small Firestore overrides.
// ============================================
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playExternal } from "./sound.js";

const $ = (id) => document.getElementById(id);
const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
const escapeAttr = escapeHtml;

export const QUICK_LINK_LOGOS = {
  whatsapp: {
    label: "WhatsApp",
    tint: "#25d366",
    image: "assets/WA-logo.png",  // 1:1
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.92 9.92 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02Zm-7.01 15.24h-.01c-1.47 0-2.91-.4-4.17-1.14l-.3-.18-3.11.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.25 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"/></svg>`,
  },
  classroom: {
    label: "Google Classroom",
    tint: "#0F9D58",
    image: "assets/GC-logo.png",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 17v-4l6-3 6 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="8.5" r="1.8" fill="currentColor"/></svg>`,
  },
  campus: {
    label: "Digital Campus / Portal",
    tint: "#d6492c",
    image: "assets/DC-logo.png",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8l10 5 8-4.2V15h2V8L12 3z" fill="currentColor"/><path d="M6 11.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-4.5l-6 3-6-3z" fill="currentColor" opacity="0.55"/></svg>`,
  },
  drive: {
    label: "Google Drive",
    tint: "#0F9D58",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l6 10-4 7H6l-4-7 6-10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 3 4 10h16L16 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
  },
  docs: {
    label: "Doc / Notes",
    tint: "#4285F4",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 15h6M9 18h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  },
  sheet: {
    label: "Sheet / Grades",
    tint: "#0F9D58",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 9h16M4 14h16M9 4v16M14 4v16" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  },
  calendar: {
    label: "Calendar",
    tint: "#c1723a",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  },
  video: {
    label: "Video / Meet",
    tint: "#EA4335",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m15 10 6-3v10l-6-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  },
  form: {
    label: "Form / Survey",
    tint: "#9a6bb0",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  },
  chat: {
    label: "Chat / Discord",
    tint: "#7ea8c4",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>`,
  },
  book: {
    label: "Book / Reading",
    tint: "#c16590",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14a2 2 0 0 1 2-2h12V3H6a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 7h6M8 10h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  link: {
    label: "Generic link",
    tint: "#9c9b96",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  globe: {
    label: "Website",
    tint: "#d9a441",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  mail: {
    label: "Email",
    tint: "#7d8fc4",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  },
  folder: {
    label: "Folder / Files",
    tint: "#c7a65a",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  },
};

export const DEFAULT_QUICK_LINK_LOGO = "link";

export const SEED_QUICK_LINKS = [
  { id: "seed-whatsapp", seedKey: "seed-whatsapp", title: "WhatsApp", description: "Open the web client", url: "https://web.whatsapp.com", logo: "whatsapp", order: 0 },
  { id: "seed-classroom", seedKey: "seed-classroom", title: "Google Classroom", description: "Assignments, materials, posts", url: "https://classroom.google.com", logo: "classroom", order: 1 },
  { id: "seed-campus", seedKey: "seed-campus", title: "Digital Campus", description: "Grades, attendance, notices", url: "https://ict.adiswathba.com/ADIS1/", logo: "campus", order: 2 },
];

let cache = null;
let isCurrentMonitor = false;
let editingItem = null;

function getVisible() {
  const docs = cache || [];
  const bySeed = new Map(docs.filter((x) => x.seedKey).map((x) => [x.seedKey, x]));
  const seeded = SEED_QUICK_LINKS
    .map((seed) => {
      const override = bySeed.get(seed.seedKey);
      if (override?.deleted) return null;
      return { ...seed, ...(override || {}), isSeed: true, id: seed.id };
    })
    .filter(Boolean);
  const custom = docs.filter((x) => !x.seedKey && !x.deleted).map((x) => ({ ...x, isSeed: false }));
  return [...seeded, ...custom].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function logoMarkup(logoId) {
  const l = QUICK_LINK_LOGOS[logoId] || QUICK_LINK_LOGOS[DEFAULT_QUICK_LINK_LOGO];
  if (l.image) {
    return `<span class="quick-link-icon has-image" style="--ql-tint:${escapeAttr(l.tint)}">
      <img src="${escapeAttr(l.image)}" alt="" loading="lazy">
    </span>`;
  }
  return `<span class="quick-link-icon" style="--ql-tint:${escapeAttr(l.tint)}">${l.svg}</span>`;
}

function renderPublicGrid() {
  const grid = $("quickLinksGrid");
  if (!grid) return;
  const items = getVisible();
  grid.innerHTML = items.length
    ? items.map((q) => `
      <a class="quick-link-card quick-link-${escapeAttr(q.logo || "link")}"
         href="${escapeAttr(q.url)}" target="_blank" rel="noopener" data-action="open-link">
        ${logoMarkup(q.logo)}
        <span class="quick-link-body">
          <span class="quick-link-title">${escapeHtml(q.title)}</span>
          ${q.description ? `<span class="quick-link-sub">${escapeHtml(q.description)}</span>` : ""}
        </span>
        <span class="quick-link-arrow">→</span>
      </a>`).join("")
    : `<p class="empty-body">No quick links yet.</p>`;

  grid.querySelectorAll('[data-action="open-link"]').forEach((a) =>
    a.addEventListener("click", () => playExternal())
  );
}

function renderManageList() {
  const list = $("quickLinkManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage quick links.</p>`;
    return;
  }
  const items = getVisible();
  if (!items.length) {
    list.innerHTML = `<p class="task-empty">No quick links yet.</p>`;
    return;
  }
  list.innerHTML = "";
  items.forEach((q) => {
    const row = document.createElement("div");
    row.className = "manage-row";
    row.innerHTML = `
      <div class="manage-logo-thumb">${logoMarkup(q.logo)}</div>
      <div class="manage-row-body">
        <p class="task-subject">${escapeHtml(q.title)}${q.isSeed ? '<span class="inactive-tag">default</span>' : ""}</p>
        <p class="task-detail">${escapeHtml(q.description || "—")} · ${escapeHtml(q.url)}</p>
      </div>
      <div class="task-monitor-actions">
        <button class="task-icon-btn" data-action="edit" data-id="${escapeAttr(q.id)}" aria-label="Edit">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete" data-id="${escapeAttr(q.id)}" aria-label="Delete">✕</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-action="edit"]').forEach((b) =>
    b.addEventListener("click", () => openForm(getVisible().find((x) => x.id === b.dataset.id)))
  );
  list.querySelectorAll('[data-action="delete"]').forEach((b) =>
    b.addEventListener("click", () => handleDelete(getVisible().find((x) => x.id === b.dataset.id)))
  );
}

function renderLogoPicker(selectedId) {
  const grid = $("quickLinkLogoGrid");
  if (!grid) return;
  grid.innerHTML = Object.entries(QUICK_LINK_LOGOS).map(([id, l]) => `
    <button type="button" class="logo-choice${id === selectedId ? " active" : ""}"
      data-logo="${escapeAttr(id)}" title="${escapeAttr(l.label)}" aria-label="${escapeAttr(l.label)}">
      ${logoMarkup(id)}
      <span class="logo-choice-label">${escapeHtml(l.label)}</span>
    </button>`).join("");

  grid.querySelectorAll(".logo-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".logo-choice").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });
}

function getChosenLogo() {
  const active = document.querySelector("#quickLinkLogoGrid .logo-choice.active");
  return active?.dataset.logo || DEFAULT_QUICK_LINK_LOGO;
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function openForm(item = null) {
  const f = $("quickLinkForm");
  if (!f) return;
  editingItem = item;
  f.title.value = item?.title || "";
  f.description.value = item?.description || "";
  f.url.value = item?.url || "";
  f.order.value = item?.order ?? getVisible().length;
  renderLogoPicker(item?.logo || DEFAULT_QUICK_LINK_LOGO);
  setFormError(null);
  f.hidden = false;
  f.querySelector('button[type="submit"]').textContent = item ? "Save changes" : "Add quick link";
  playOpen();
  f.title.focus();
}

function closeForm({ silent = false } = {}) {
  const f = $("quickLinkForm");
  if (!f) return;
  f.reset();
  f.hidden = true;
  editingItem = null;
  setFormError(null);
  if (!silent) playClose();
}

function setFormError(message) {
  const e = $("quickLinkFormError");
  if (!e) return;
  e.hidden = !message;
  e.textContent = message || "";
}

async function handleSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const title = f.title.value.trim();
  const url = normalizeUrl(f.url.value);
  if (!title || !url) {
    setFormError("A title and URL are required.");
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
  } catch {
    setFormError("Enter a valid http(s) URL.");
    return;
  }

  const payload = {
    title,
    description: f.description.value.trim(),
    url,
    logo: QUICK_LINK_LOGOS[getChosenLogo()] ? getChosenLogo() : DEFAULT_QUICK_LINK_LOGO,
    order: Math.max(0, parseInt(f.order.value, 10) || 0),
    updatedAt: serverTimestamp(),
  };

  const btn = f.querySelector('button[type="submit"]');
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  setFormError(null);

  try {
    if (editingItem?.isSeed) {
      const ref = doc(db, "quickLinks", `seed-${editingItem.seedKey}`);
      await setDoc(ref, { ...payload, seedKey: editingItem.seedKey, deleted: false }, { merge: true });
      await logAction("updated", { resourceType: "quickLink", resourceId: ref.id, summary: `Updated quick link: ${title}` });
    } else if (editingItem?.id) {
      await updateDoc(doc(db, "quickLinks", editingItem.id), payload);
      await logAction("updated", { resourceType: "quickLink", resourceId: editingItem.id, summary: `Updated quick link: ${title}` });
    } else {
      const ref = await addDoc(collection(db, "quickLinks"), { ...payload, createdAt: serverTimestamp() });
      await logAction("created", { resourceType: "quickLink", resourceId: ref.id, summary: `Added quick link: ${title}` });
    }
    playSuccess();
    closeForm({ silent: true });
  } catch (err) {
    console.error("Quick link save failed:", err);
    playError();
    setFormError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

async function handleDelete(item) {
  if (!item) return;
  if (!confirm(`Delete "${item.title}" from quick links?`)) return;
  try {
    if (item.isSeed) {
      const ref = doc(db, "quickLinks", `seed-${item.seedKey}`);
      await setDoc(ref, { seedKey: item.seedKey, deleted: true, order: item.order ?? 0, updatedAt: serverTimestamp() }, { merge: true });
      await logAction("deleted", { resourceType: "quickLink", resourceId: ref.id, summary: `Deleted quick link: ${item.title}` });
    } else {
      await deleteDoc(doc(db, "quickLinks", item.id));
      await logAction("deleted", { resourceType: "quickLink", resourceId: item.id, summary: `Deleted quick link: ${item.title}` });
    }
    playDelete();
  } catch (err) {
    console.error("Quick link delete failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

export function initQuickLinks() {
  const needs = !!$("quickLinksGrid") || !!$("quickLinkManageList");
  if (!needs) return;
  const q = query(collection(db, "quickLinks"), orderBy("order", "asc"));
  onSnapshot(q, (snap) => {
    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPublicGrid();
    renderManageList();
  }, (err) => {
    console.error("Failed to load quick links:", err);
    if (cache === null) cache = [];
    renderPublicGrid();
    renderManageList();
  });

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    const b = $("addQuickLinkBtn");
    if (b) b.hidden = !monitor;
    renderManageList();
  });

  const add = $("addQuickLinkBtn");
  if (add) add.addEventListener("click", () => openForm());
  const f = $("quickLinkForm");
  if (f) {
    f.addEventListener("submit", handleSubmit);
    const c = f.querySelector('[data-action="cancel"]');
    if (c) c.addEventListener("click", () => closeForm());
  }
}
