// ============================================
// 8CM — Site interactions (entry module)
// ============================================
import { onStudents } from "./students.js";
import { changelog } from "./changelog.js";
import { playToggleOn, playToggleOff, playOpen, playClose, playExternal, playNav, playHover } from "./sound.js";
import { onAchievements } from "./achievements.js";
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
    if (box) box.classList.toggle("is-active", !!filters[key]);
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
// House card → students list, with the house filter pre-applied
// ============================================
function initHouseCards() {
  const cards = document.querySelectorAll(".house-card[data-house]");
  if (!cards.length) return;

  cards.forEach((card) => {
    const jump = () => {
      const house = card.dataset.house;
      if (!house) return;

      const clearBtn = document.getElementById("filterClear");
      if (clearBtn && !clearBtn.hidden) clearBtn.click();

      const box = document.querySelector(`#filterRow .filter-box[data-filter-key="house"]`);
      if (box) {
        box.click();
        const option = document.querySelector(`#filterDropdownHost .filter-option[data-value="${house}"]`);
        if (option) option.click();
      }

      const target = document.getElementById("students");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    card.addEventListener("click", jump);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jump();
      }
    });
  });

  document.querySelectorAll(".bar-row[data-house]").forEach((bar) => {
    bar.addEventListener("click", () => {
      const house = bar.dataset.house;
      window.location.href = `archives.html#students?house=${house}`;
    });
  });
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
// Hero chart, stats count-up, splash, changelog, date line — unchanged
// ============================================
function initHeroChart() {
  window.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll(".bar-fill").forEach((bar) => {
          const value = parseFloat(bar.dataset.value);
          const max = parseFloat(bar.dataset.max);
          bar.style.width = `${(value / max) * 100}%`;
        });
      }, 300);
    });
  });
}

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
      (entry) => `
        <div class="changelog-entry">
          <p class="changelog-date">${entry.date}</p>
          <ul>${entry.items.map((item) => `<li>${item}</li>`).join("")}</ul>
        </div>
      `
    )
    .join("");
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
  const SELECTOR = ".student-card, .teacher-card, .house-card, .resource-card, .quick-link-card, .pill, .filter-box, .hub-nav-link";
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
}

// ============================================
// Bottom-of-page Changelog / Monitors toggles
// ------------------------------------------------
// Changelog reuses the #changelogEntries container initChangelog()
// already knows how to fill (see initChangelog below) — it just
// happens to also exist on this page now, tucked inside a hidden
// panel. Monitors is a lazy one-time fetch: auth.js (and Firestore)
// only get pulled in if someone actually opens that panel.
// ============================================
function initFooterToggles() {
  const buttons = document.querySelectorAll(".footer-toggle-btn");
  if (!buttons.length) return;

  const escapeHtml = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);

  let monitorsLoaded = false;
  function loadPublicMonitors() {
    if (monitorsLoaded) return;
    monitorsLoaded = true;
    const list = document.getElementById("publicMonitorsList");
    if (!list) return;
    list.innerHTML = `<p class="task-empty">Loading…</p>`;
    import("./auth.js")
      .then((mod) => mod.getMonitorDirectory())
      .then((directory) => {
        if (!directory.length) {
          list.innerHTML = `<p class="task-empty">No monitors found.</p>`;
          return;
        }
        list.innerHTML = directory
          .map(
            (m) => `
          <div class="manage-row">
            <div class="manage-row-body">
              <p class="task-subject">${escapeHtml(m.email)}${m.builtIn ? ' <span class="inactive-tag">built-in</span>' : ""}</p>
            </div>
          </div>`
          )
          .join("");
      })
      .catch((err) => {
        console.error("Failed to load monitor directory:", err);
        list.innerHTML = `<p class="task-empty">Couldn't load the monitor list right now.</p>`;
        monitorsLoaded = false; // allow a retry on next open
      });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.dataset.toggleTarget);
      if (!panel) return;
      const opening = panel.hidden;

      // Only one panel open at a time, so the section stays compact.
      document.querySelectorAll(".footer-toggle-panel").forEach((p) => { p.hidden = true; });
      buttons.forEach((b) => b.classList.remove("active"));

      if (opening) {
        panel.hidden = false;
        btn.classList.add("active");
        playOpen();
        if (btn.dataset.toggleTarget === "footerMonitorsPanel") loadPublicMonitors();
      } else {
        playClose();
      }
    });
  });
}

initVersionBadge();

// ============================================
// Boot — every page
// ============================================
initSplash();
initNav();
initStudentDirectory();
initHouseCards();
initGalleryLightbox();
initHeroChart();
initChangelog();  // no-ops on pages without #changelogEntries
initFooterToggles();
initTodayDate();
initHoverSfx();

// Profile modal + avatar picker boot
import("./profile-modal.js")
  .then((m) => {
    window.__cmOpenProfile = m.openProfile;
    m.initProfileModal();
  })
  .catch((err) => console.error("Failed to init profile modal:", err));


// Background music is independent of Firebase and safe to lazy-load on every page.
import("./bgm.js").then((m) => m.initBgm()).catch((err) => {
  console.error("[8CM] BGM module failed:", err);
});

// Firebase-backed modules are lazy. A blocked third-party SDK must not stop
// static navigation, the directory, splash handling, or other local UI.
const OPTIONAL_MODULES = [
  ["auth", "./auth-ui.js", "initAuthUI"],
  ["assignments", "./assignments.js", "initAssignments"],
  ["announcements", "./announcements.js", "initAnnouncements"],
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
  ["manage page", "./manage.js", "initManagePage"],
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
