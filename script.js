// ============================================
// 8CM — Site interactions (entry module)
// ============================================
import { onStudents } from "./students.js";
import { changelog } from "./changelog.js";
import { playToggleOn, playToggleOff, playOpen, playClose, playExternal, playNav, playHover } from "./sound.js";
import { onAchievements } from "./achievements.js";
import { initMainNav } from "./main-nav.js";
let achievementsCache = [];
onAchievements((list) => (achievementsCache = list));

(function applyStoredAccentImmediately() {
  try {
    const accent = localStorage.getItem("8cm-theme-accent");
    if (accent) document.documentElement.style.setProperty("--accent", accent);
  } catch (_) {}
})();

// Fallback error toast (unchanged)
function showErrorToast(message) {
  let toast = document.getElementById("globalErrorToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalErrorToast";
    toast.className = "error-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showErrorToast._timer);
  showErrorToast._timer = setTimeout(() => toast.classList.remove("show"), 5000);
}
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  showErrorToast("Something went wrong behind the scenes — try that again.");
});
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error || event.message);
});

const avatarAPI = {
  getAvatarForUid: () => null,
  avatarMarkup: (avatarId, name, size = 32) => {
    const initials = String(name || "?").split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
    return `<span class="cm-avatar cm-avatar-initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;">${initials}</span>`;
  },
  onAvatars: () => () => {},
  loadAvatars: async () => {},
};

// ============================================
// Student directory — now driven by the live student cache
// ============================================
function initStudentDirectory() {
  const grid = document.getElementById("studentGrid");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const filterRow = document.getElementById("filterRow");
  const dropdownHost = document.getElementById("filterDropdownHost");
  const clearBtn = document.getElementById("filterClear");
  if (!grid || !resultCount || !searchInput || !filterRow) return;

  let liveStudents = [];
  let searchTerm = "";
  const filters = { house: "", language: "", transport: "", islamic: "", creative: "" };

  // --- Badge data + avatar data -------------------------------------
  const claimUids = new Map();       // studentId → uid
  let monitorUids = new Set();
  let currentAuthUid = null;
  let currentAuthClaimedStudentId = null;
  let currentAuthIsMonitor = false;

  function isMonitorStudent(studentId) {
    const claimed = claimUids.get(studentId);
    if (!claimed) return false;
    if (monitorUids.has(claimed)) return true;
    return currentAuthIsMonitor && claimed === currentAuthUid;
  }
  window.__cmIsMonitorStudent = isMonitorStudent;

  async function loadBadgeData() {
    try {
      const { db } = await import("./firebase-config.js");
      const { doc, getDoc, collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const [claimsSnap, monitorsSnap] = await Promise.all([
        getDocs(collection(db, "claims")),
        getDoc(doc(db, "settings", "monitors")),
      ]);
      claimUids.clear();
      claimsSnap.forEach((d) => {
        const data = d.data();
        if (data && data.uid) claimUids.set(d.id, data.uid);
      });
      monitorUids = monitorsSnap.exists()
        ? new Set(Object.keys(monitorsSnap.data().uids || {}))
        : new Set();
      window.__cmClaimUids = claimUids;
      window.__cmMonitorUids = monitorUids;
      applyFilters();
      window.dispatchEvent(new CustomEvent("cm:monitor-cache-ready"));
    } catch (err) {
      console.error("Failed to load badge data:", err);
    }
  }

  import("./auth.js").then(({ subscribeAuth }) => {
    subscribeAuth((state) => {
      currentAuthUid = state.user ? state.user.uid : null;
      currentAuthClaimedStudentId = state.profile?.claimedStudentId || null;
      currentAuthIsMonitor = !!state.monitor;
      applyFilters();
    });
  }).catch((err) => console.error("Failed to subscribe to auth for directory:", err));

  const OPTIONS = {
    house: [
      { value: "", label: "All" },
      { value: "winter", label: "Winter" },
      { value: "autumn", label: "Autumn" },
      { value: "spring", label: "Spring" },
      { value: "summer", label: "Summer" },
    ],
    language: [
      { value: "", label: "All" },
      { value: "hindi", label: "Hindi" },
      { value: "malayalam", label: "Malayalam" },
      { value: "french", label: "French" },
    ],
    transport: [
      { value: "", label: "All" },
      { value: "OT", label: "Own transport" },
      { value: "bus", label: "Bus" },
    ],
    islamic: [
      { value: "", label: "All" },
      { value: "islamic", label: "Islamic Education" },
      { value: "value", label: "Value Education" },
    ],
    creative: [
      { value: "", label: "All" },
      { value: "dance", label: "Dance" },
      { value: "music", label: "Music" },
      { value: "art", label: "Art" },
    ],
  };

  const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
  const transportLabel = (t) => (t === "OT" ? "Own transport" : `Bus ${t}`);
  const rollLabel = (n) => String(n).padStart(2, "0");
  const escapeHtml = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);

  function matchesFilters(s) {
    if (filters.house && s.house !== filters.house) return false;
    if (filters.language && (s.language || "").toLowerCase() !== filters.language) return false;
    if (filters.transport === "OT" && s.transport !== "OT") return false;
    if (filters.transport === "bus" && s.transport === "OT") return false;
    if (filters.islamic && s.islamic !== filters.islamic) return false;
    if (filters.creative && s.creative !== filters.creative) return false;
    return true;
  }

  function renderStudents(list) {
    grid.innerHTML = "";
    grid.classList.toggle("empty", list.length === 0);
    list.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "student-card";
      card.style.animationDelay = `${Math.min(i, 12) * 0.02}s`;
      card.dataset.studentId = s.id;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const isMonitor = isMonitorStudent(s.id);
      const claimed = claimUids.get(s.id);
      // The signed-in user's own profile already knows its claimed student ID.
      // Use that as a fallback when the public claims cache is still loading or
      // temporarily unavailable, so the student card matches the navbar avatar.
      const avatarUid = claimed || (s.id === currentAuthClaimedStudentId ? currentAuthUid : null);
      const avatarId = avatarUid ? avatarAPI.getAvatarForUid(avatarUid) : null;
      const avatarHtml = avatarAPI.avatarMarkup(avatarId, s.name, 44);

      card.innerHTML = `
        <div class="student-card-top">
          ${avatarHtml}
          <div class="student-card-name-block">
            <span class="student-name">${escapeHtml(s.name)}${isMonitor ? `<span class="monitor-badge">Monitor</span>` : ""}</span>
            <span class="student-card-roll">Roll ${rollLabel(s.rollNumber)}</span>
          </div>
        </div>
        <div class="student-meta">
          <span class="house-pill house-${escapeHtml(s.house)}"><span class="house-dot ${escapeHtml(s.house)}"></span>${escapeHtml(houseLabel(s.house))}</span>
          <span>${escapeHtml(s.language || "—")}</span>
          <span>${escapeHtml(transportLabel(s.transport))}</span>
          ${s.islamic ? `<span>${s.islamic === "islamic" ? "Islamic Ed" : "Value Ed"}</span>` : ""}
          ${s.creative ? `<span>${escapeHtml(s.creative.charAt(0).toUpperCase() + s.creative.slice(1))}</span>` : ""}
        </div>
      `;
      card.addEventListener("click", () => window.__cmOpenProfile?.(s.id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.__cmOpenProfile?.(s.id);
        }
      });
      grid.appendChild(card);
    });
    resultCount.textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
  }

  function applyFilters() {
    let list = liveStudents.filter(matchesFilters);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    renderStudents(list);
    const anyActive = Object.values(filters).some(Boolean) || searchTerm.trim();
    if (clearBtn) clearBtn.hidden = !anyActive;
  }

  function updateBoxLabel(key) {
    const valEl = filterRow.querySelector(`[data-value-for="${key}"]`);
    if (!valEl) return;
    const opt = OPTIONS[key].find((o) => o.value === filters[key]);
    valEl.textContent = opt ? opt.label : "All";
    const box = filterRow.querySelector(`[data-filter-key="${key}"]`);
    if (box) {
      const active = !!filters[key];
      box.classList.toggle("is-active", active);
      if (key === "house") box.dataset.houseColor = active ? filters.house : "";
    }
  }

  function closeDropdown() {
    dropdownHost.innerHTML = "";
    filterRow.querySelectorAll(".filter-box").forEach((b) => b.classList.remove("open"));
  }

  function openDropdownFor(box) {
    const key = box.dataset.filterKey;
    if (!OPTIONS[key]) return;
    if (box.classList.contains("open")) {
      closeDropdown();
      return;
    }
    closeDropdown();
    box.classList.add("open");
    const rect = box.getBoundingClientRect();
    dropdownHost.style.left = `${rect.left}px`;
    dropdownHost.style.top = `${rect.bottom + 6}px`;
    dropdownHost.style.minWidth = `${rect.width}px`;
    dropdownHost.innerHTML = OPTIONS[key]
      .map((o) => `<button type="button" class="filter-option ${filters[key] === o.value ? "active" : ""}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`)
      .join("");
    dropdownHost.querySelectorAll(".filter-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        filters[key] = opt.dataset.value;
        updateBoxLabel(key);
        closeDropdown();
        applyFilters();
      });
    });
  }

  filterRow.querySelectorAll(".filter-box").forEach((box) => {
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      openDropdownFor(box);
    });
  });
  document.addEventListener("click", (e) => {
    if (!dropdownHost.contains(e.target)) closeDropdown();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdown();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      Object.keys(filters).forEach((k) => (filters[k] = ""));
      Object.keys(filters).forEach(updateBoxLabel);
      searchInput.value = "";
      searchTerm = "";
      applyFilters();
    });
  }

  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    applyFilters();
  });

  onStudents((list) => {
    liveStudents = list;
    window.__cmStudents = list;
    applyFilters();
  });

  Object.keys(filters).forEach(updateBoxLabel);

  // Deep-link from the Houses chart (archives.html?house=winter#students).
  // Apply the filter after the controls have been initialized, then remove the
  // query from the address bar so a later refresh does not unexpectedly reapply it.
  try {
    const params = new URLSearchParams(window.location.search);
    const incomingHouse = params.get("house");
    if (incomingHouse && ["winter", "autumn", "spring", "summer"].includes(incomingHouse)) {
      filters.house = incomingHouse;
      updateBoxLabel("house");
      applyFilters();
      if (history.replaceState) {
        const url = window.location.pathname + window.location.hash;
        history.replaceState(null, "", url);
      }
    }
  } catch (_) {}

  import("./avatars.js").then((mod) => {
    avatarAPI.getAvatarForUid = mod.getAvatarForUid;
    avatarAPI.avatarMarkup = mod.avatarMarkup;
    avatarAPI.onAvatars = mod.onAvatars;
    avatarAPI.loadAvatars = mod.loadAvatars;
    avatarAPI.onAvatars(() => applyFilters());
    return avatarAPI.loadAvatars();
  }).then(() => applyFilters()).catch((err) => {
    console.error("[8CM] Avatar module unavailable:", err);
  });

  loadBadgeData();
}

// ============================================
// Houses page — live headcount chart + house rosters
// ------------------------------------------------
// Everything here is driven by the real student roster (onStudents),
// never by numbers typed into the HTML, so a monitor moving someone
// between houses updates the chart, the counts and the name lists
// together. Clicking a name opens that student's profile.
// ============================================
const HOUSE_KEYS = ["winter", "autumn", "spring", "summer"];

function initHouseCards() {
  const cards = document.querySelectorAll(".house-card[data-house]");
  const bars = document.querySelectorAll(".bar-row[data-house]");
  if (!cards.length && !bars.length) return;

  // A chart row jumps to that house's card when the card is on the
  // same page (the Houses page); anywhere else it opens the filtered
  // student directory in Archives.
  bars.forEach((bar) => {
    const jump = () => {
      const house = bar.dataset.house;
      if (!house) return;
      const card = document.querySelector(`.house-card[data-house="${house}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.remove("is-pinged");
        void card.offsetWidth; // restart the animation on repeat clicks
        card.classList.add("is-pinged");
        return;
      }
      window.location.href = `archives.html?house=${encodeURIComponent(house)}#students`;
    };
    bar.addEventListener("click", jump);
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jump();
      }
    });
  });

  // onLiveStudents() stays silent until Firestore has answered (no
  // stale seed numbers flashing first), then fires again whenever a
  // monitor edits/moves a student — so the chart and cards are always
  // live. Until then the chart shows a loading skeleton.
  import("./students.js")
    .then((m) => {
      m.onLiveStudents((list) => {
        renderHouseChart(list);
        renderHouseCardLists(list);
      });
      m.loadStudents().catch(() => {});
    })
    .catch((err) => console.error("[8CM] Failed to load house rosters:", err));

  window.addEventListener("load", equalizeHouseCardHeights);
  let houseResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(houseResizeTimer);
    houseResizeTimer = setTimeout(equalizeHouseCardHeights, 150);
  });
}

const escapeHouseName = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

// Live headcount bars. The widest bar is whichever house is biggest
// right now, so the chart always uses its full width.
function renderHouseChart(list) {
  const rows = document.querySelectorAll(".bar-row[data-house]");
  if (!rows.length) return;
  const chart = document.getElementById("housesChart");
  if (chart) { chart.classList.remove("is-loading"); chart.removeAttribute("aria-busy"); }

  const counts = {};
  HOUSE_KEYS.forEach((h) => { counts[h] = 0; });
  list.forEach((s) => { if (s.house in counts) counts[s.house] += 1; });
  const max = Math.max(1, ...Object.values(counts));

  rows.forEach((row) => {
    const house = row.dataset.house;
    const count = counts[house] || 0;
    const fill = row.querySelector(".bar-fill");
    const countEl = row.querySelector(".bar-count");
    if (countEl) countEl.textContent = String(count);
    if (fill) {
      fill.dataset.value = String(count);
      fill.dataset.max = String(max);
      fill.style.width = `${(count / max) * 100}%`;
    }
    row.setAttribute("aria-label", `${houseLabelFor(house)} house, ${count} ${count === 1 ? "student" : "students"}`);
  });
}

const houseLabelFor = (h) => h.charAt(0).toUpperCase() + h.slice(1);

// Fills each house card with its real count and a name list. Each
// name is a button-like row: click (or Enter/Space) opens that
// student's profile in the same profile modal the directory uses.
function renderHouseCardLists(list) {
  const cards = document.querySelectorAll(".house-card[data-house]");
  if (!cards.length) return;

  cards.forEach((card) => {
    const house = card.dataset.house;
    const body = card.querySelector(".house-card-body");
    if (!house || !body) return;

    const members = list
      .filter((s) => s.house === house)
      .slice()
      .sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));

    const countEl = body.querySelector(".house-count");
    if (countEl) countEl.textContent = `${members.length} ${members.length === 1 ? "member" : "members"}`;

    let listEl = body.querySelector(".house-student-list");
    if (!listEl) {
      const oldDesc = body.querySelector(".house-desc");
      if (oldDesc) oldDesc.remove();
      listEl = document.createElement("ul");
      listEl.className = "house-student-list";
      // Bound once: only listEl's innerHTML changes on later renders,
      // so these delegated handlers survive every re-render.
      const open = (li) => {
        if (!li) return;
        playOpen();
        window.__cmOpenProfile?.(li.dataset.studentId);
      };
      listEl.addEventListener("click", (e) => open(e.target.closest("li[data-student-id]")));
      listEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const li = e.target.closest("li[data-student-id]");
        if (!li) return;
        e.preventDefault();
        open(li);
      });
      body.appendChild(listEl);
    }
    listEl.innerHTML = members
      .map((s) => `<li data-roll="${String(s.rollNumber || "").padStart(2, "0")}" data-student-id="${escapeHouseName(s.id)}" tabindex="0" role="button" aria-label="View profile for ${escapeHouseName(s.name)}">${escapeHouseName(s.name)}</li>`)
      .join("");
  });

  equalizeHouseCardHeights();
}

// Every house card is stretched to match whichever card is naturally
// tallest right now — a 3-student house and an 11-student house line
// up either way — instead of assuming any one house will always be
// the biggest. Recomputed on every re-render and on resize.
function equalizeHouseCardHeights() {
  const cards = document.querySelectorAll(".house-card[data-house]");
  if (!cards.length) return;
  cards.forEach((card) => { card.style.minHeight = ""; });
  // One column (phones): every card is its own row, so stretching them to
  // the tallest just leaves dead space at the bottom of the short ones.
  const grid = cards[0].parentElement;
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 2;
  if (cols < 2) return;
  let max = 0;
  cards.forEach((card) => { max = Math.max(max, card.getBoundingClientRect().height); });
  cards.forEach((card) => { card.style.minHeight = `${max}px`; });
}

// ============================================
// Resources — unchanged
// ============================================
function initResources() {
  const resourceGrid = document.getElementById("resourceGrid");
  if (!resourceGrid) return;

  // Google's official 4-color "G" mark — same SVG paths used by this
  // site's own "Continue with Google" button, so it's verified
  // accurate rather than an approximation from memory.
  const googleIcon = `<svg class="resource-icon" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.97 10.72A5.4 5.4 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" fill="#FBBC05"/>
    <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
  </svg>`;
  // Not ADIS's actual logo — a generic campus/portal glyph. Swap in
  // the school's real icon file here whenever one's available.
  const campusIcon = `<svg class="resource-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 2 8l10 5 8-4.2V15h2V8L12 3z" fill="currentColor"/>
    <path d="M6 11.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-4.5l-6 3-6-3z" fill="currentColor" opacity="0.55"/>
  </svg>`;

  const resources = [
    { name: "Google Classroom", description: "Assignments, materials, and class-wide posts.", url: "https://classroom.google.com", icon: googleIcon },
    { name: "Digital Campus (DC)", description: "School portal for grades, attendance, and notices.", url: "https://ict.adiswathba.com/ADIS1/", icon: campusIcon },
  ];

  resources.forEach((r) => {
    const card = document.createElement("a");
    card.className = "resource-card";
    card.href = r.url;
    card.target = "_blank";
    card.rel = "noopener";
    card.innerHTML = `<div class="resource-card-head">${r.icon}<h3>${r.name}</h3></div><p>${r.description}</p><span class="resource-note">Open →</span>`;
    card.addEventListener("click", () => playExternal());
    resourceGrid.appendChild(card);
  });
}

// ============================================
// Gallery lightbox — unchanged
// ============================================
function initGalleryLightbox() {
  const galleryGrid = document.getElementById("galleryGrid");
  const lightboxOverlay = document.getElementById("lightboxOverlay");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxCaption = document.getElementById("lightboxCaption");
  const lightboxClose = document.getElementById("lightboxClose");
  if (!galleryGrid || !lightboxOverlay) return;

  function openLightbox(photo) {
    const img = photo.querySelector("img");
    const caption = photo.querySelector("figcaption");
    if (!img) return;
    lightboxImage.src = img.currentSrc || img.src;
    lightboxImage.alt = img.alt || "";
    lightboxCaption.textContent = caption ? caption.textContent : "";
    lightboxOverlay.hidden = false;
    document.body.classList.add("lightbox-locked");
    playOpen();
    requestAnimationFrame(() => requestAnimationFrame(() => lightboxOverlay.classList.add("open")));
  }

  function closeLightbox() {
    if (lightboxOverlay.hidden) return;
    lightboxOverlay.classList.remove("open");
    document.body.classList.remove("lightbox-locked");
    playClose();
    setTimeout(() => {
      lightboxOverlay.hidden = true;
      lightboxImage.src = "";
    }, 220);
  }

  galleryGrid.addEventListener("click", (e) => {
    const photo = e.target.closest(".gallery-photo");
    if (photo) openLightbox(photo);
  });
  galleryGrid.addEventListener("keydown", (e) => {
    const photo = e.target.closest(".gallery-photo");
    if (!photo) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(photo); }
  });
  if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
  lightboxOverlay.addEventListener("click", (e) => { if (e.target === lightboxOverlay) closeLightbox(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });
}

// ============================================
// Nav — unchanged
// ============================================
function initNav() {
  const nav = document.getElementById("nav");
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("navLinks");
  if (!nav || !burger || !navLinks) return;

  window.addEventListener("scroll", () => nav.classList.toggle("scrolled", window.scrollY > 8));
  burger.addEventListener("click", () => {
    const isOpen = burger.classList.toggle("open");
    navLinks.classList.toggle("open");
    isOpen ? playOpen() : playClose();
  });
  navLinks.querySelectorAll("a.nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      playNav();
      burger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });

  function wireDropdown(triggerId) {
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;
    const item = trigger.closest(".nav-item");
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = item.classList.toggle("open");
      trigger.setAttribute("aria-expanded", isOpen);
      isOpen ? playOpen() : playClose();
    });
    trigger.nextElementSibling?.querySelectorAll("a")?.forEach((link) => {
      link.addEventListener("click", () => playNav());
    });
    document.addEventListener("click", (e) => {
      if (!item.contains(e.target)) {
        item.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  }
  wireDropdown("moreTrigger");
}

// ============================================
// Stats count-up, splash, changelog, date line — unchanged
// ============================================
function initStatCountUp() {
  const statNumbers = document.querySelectorAll(".stat-number[data-count]");
  if (statNumbers.length === 0) return;
  function countUp(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { countUp(entry.target); statObserver.unobserve(entry.target); }
    });
  }, { threshold: 0.5 });
  statNumbers.forEach((el) => statObserver.observe(el));
}

function initSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;

  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    splash.classList.add("hide");
    window.setTimeout(() => splash.remove(), 550);
  };

  if (document.readyState === "complete") {
    window.setTimeout(hide, 350);
  } else {
    window.addEventListener("load", () => window.setTimeout(hide, 350), { once: true });
  }
  // Hard timeout: no dependency, no promise, no Firebase. The splash can
  // never permanently cover the site because a module failed to load.
  window.setTimeout(hide, 3000);
}

function initChangelog() {
  const container = document.getElementById("changelogEntries");
  if (!container) return;

  container.innerHTML = changelog
    .map(
      (entry, i) => `
        <div class="changelog-entry" data-index="${i}">
          <button type="button" class="changelog-date" aria-expanded="false">
            <span class="changelog-date-label">${entry.date}</span>
            ${entry.version ? `<span class="changelog-version">v${entry.version}</span>` : ""}
            <span class="changelog-caret" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </button>
          <div class="changelog-body">
            <ul>${entry.items.map((item) => `<li>${item}</li>`).join("")}</ul>
          </div>
        </div>
      `
    )
    .join("");

  container.querySelectorAll(".changelog-entry").forEach((el) => {
    const btn = el.querySelector(".changelog-date");
    btn.addEventListener("click", () => {
      const open = el.classList.toggle("is-expanded");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
}
function initTodayDate() {
  const el = document.getElementById("todayDate");
  if (!el) return;
  el.textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    " — homework and announcements, kept current.";
}

// ============================================
// V13 — Hover SFX
// ============================================
function initHoverSfx() {
  const SELECTOR = ".student-card, .teacher-card, .house-card, .resource-card, .quick-link-card, .pill, .filter-box, .hub-nav-link, .glance-tile, .glance-strip";
  let lastEl = null;
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.(SELECTOR);
    if (!el || el === lastEl) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    lastEl = el;
    import("./sound.js").then((m) => m.playHover?.());
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest?.(SELECTOR) === lastEl) lastEl = null;
  }, { passive: true });
}

// ============================================
// V12 — version watermark
// ============================================
function initVersionBadge() {
  if (document.querySelector(".version-badge")) return;
  const el = document.createElement("div");
  el.className = "version-badge";
  el.textContent = window.__cmVersion || "v14.1";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  // changelog.js's currentVersion (the newest entry's version field)
  // is the single source of truth here — this used to be a separate
  // hardcoded string that only updated when someone remembered to
  // bump it by hand, so it silently fell behind the real changelog.
  import("./changelog.js")
    .then((m) => { el.textContent = m.currentVersion ? `v${m.currentVersion}` : "v14.3"; })
    .catch(() => { el.textContent = "v14.3"; });
}

// ============================================
// Anchor re-jump after dynamic content loads
// ------------------------------------------------
// "Meet the class" → archives.html#students lands in the wrong place
// because the browser's native jump fires before the student grid /
// house rosters / teacher cards have rendered. Those push the target
// section down, so the original scroll position ends up pointing at
// empty space. Re-running the jump after the initial render settles
// puts you where you actually asked to go.
// ============================================
function initAnchorRescue() {
  // Stop re-jumping the moment the person takes over: a late jump while
  // they're already scrolling around reads as the page fighting them.
  let touched = false;
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((type) =>
    window.addEventListener(type, () => { touched = true; }, { passive: true, once: true })
  );

  function jump() {
    if (touched) return;
    const hash = location.hash;
    if (!hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    // "#top" means the top of the PAGE (the browser would otherwise stop
    // at <main>, which starts underneath the sticky header).
    if (id === "top") { window.scrollTo({ top: 0, behavior: "instant" }); return; }
    const el = document.getElementById(id);
    if (!el) return;
    // "instant": html has scroll-behavior:smooth, and a visible glide on
    // a correction jump looks like the page wandering.
    el.scrollIntoView({ behavior: "instant", block: "start" });
  }
  if (document.readyState === "complete") setTimeout(jump, 60);
  else window.addEventListener("load", () => setTimeout(jump, 60), { once: true });
  setTimeout(jump, 900);
  setTimeout(jump, 2000);
}

initVersionBadge();

// ============================================
// Boot — every page
// ============================================
// Background music kicks off before anything else in this file. The
// <head> of every page has already asked the browser to modulepreload
// bgm.js (and preload the current track's audio) before script.js even
// started running, so this import() should resolve against warm cache
// — but starting it first here still means initBgm()'s own work
// (reading prefs, calling play()) begins as early in the page's life
// as this module can make it, instead of queued behind unrelated UI
// setup that has nothing to do with audio continuity.
import("./bgm.js").then((m) => m.initBgm()).catch((err) => {
  console.error("[8CM] BGM module failed:", err);
});

initSplash();
initNav();
initMainNav();  // V17.1: sticky metrics, active pill, page fades, subnav scrollspy
initAnchorRescue();
initStudentDirectory();
initHouseCards();
initGalleryLightbox();
initChangelog();  // no-ops on pages without #changelogEntries
initTodayDate();
initHoverSfx();

// Profile modal + avatar picker boot
import("./profile-modal.js")
  .then((m) => {
    window.__cmOpenProfile = m.openProfile;
    m.initProfileModal();
  })
  .catch((err) => console.error("Failed to init profile modal:", err));

// Firebase-backed modules are lazy. A blocked third-party SDK must not stop
// static navigation, the directory, splash handling, or other local UI.
const OPTIONAL_MODULES = [
  ["auth", "./auth-ui.js", "initAuthUI"],
  ["assignments", "./assignments.js", "initAssignments"],
  ["resources", "./resources.js", "initResources"],
  ["notices", "./notices.js", "initNotices"],
  ["events", "./events.js", "initEvents"],
  ["timetable", "./timetable-live.js", "initTimetableLive"],
  ["timetable announcements", "./timetable-announcements.js", "initTimetableAnnouncements"],
  ["dashboard", "./dashboard.js", "initDashboard"],
  ["student management", "./student-manage.js", "initStudentManagement"],
  ["teachers", "./teachers.js", "initTeachers"],
  ["teacher management", "./teacher-manage.js", "initTeacherManagement"],
  ["monitor management", "./monitor-manage.js", "initMonitorManagement"],
  ["gallery", "./gallery.js", "initGallery"],
  ["achievements", "./achievements.js", "initAchievements"],
  ["archive materials", "./archive-materials.js", "initArchiveMaterials"],
  ["quick links", "./quick-links.js", "initQuickLinks"],
  ["manage page", "./manage.js", "initManagePage"],
  ["home glance", "./glance-panels.js", "initHomeGlance"],
  ["archives glance", "./glance-panels.js", "initArchivesGlance"],
  ["theme", "./theme.js", "initThemeUI"],
];

OPTIONAL_MODULES.forEach(([label, path, initializer]) => {
  import(path).then((mod) => {
    if (label === "theme" && typeof mod.applyStoredTheme === "function") mod.applyStoredTheme();
    if (initializer && typeof mod[initializer] === "function") mod[initializer]();
  }).catch((err) => {
    console.error(`[8CM] Optional ${label} module failed to load:`, err);
    if (label !== "theme") showErrorToast(`${label[0].toUpperCase() + label.slice(1)} features are temporarily unavailable.`);
  });
});

