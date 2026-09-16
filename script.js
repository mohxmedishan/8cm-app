// ============================================
// 8CM — Site interactions (entry module)
// ============================================
import { getStudentsSync, onStudents } from "./students.js";
import { changelog } from "./changelog.js";
import { playToggleOn, playToggleOff, playOpen, playClose, playExternal, playNav } from "./sound.js";

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

// ============================================
// Student directory — now driven by the live student cache
// ============================================
function initStudentDirectory() {
  const grid = document.getElementById("studentGrid");
  const resultCount = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  if (!grid || !resultCount || !searchInput) return;

  let liveStudents = [];
  let activeFilters = new Set();
  let searchTerm = "";

  const transportLabel = (t) => (t === "OT" ? "Own transport" : `Bus ${t}`);
  const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
  const rollLabel = (n) => String(n).padStart(2, "0");

  function renderStudents(list) {
    grid.innerHTML = "";
    grid.classList.toggle("empty", list.length === 0);
    list.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "student-card";
      card.style.animationDelay = `${Math.min(i, 12) * 0.02}s`;
      card.innerHTML = `
        <div class="student-top">
          <span class="roll-badge">${rollLabel(s.rollNumber)}</span>
          <span class="house-dot ${s.house}"></span>
          <span class="student-name">${s.name}</span>
        </div>
        <div class="student-meta">
          <span>${houseLabel(s.house)}</span>
          <span>${s.language || "—"}</span>
          <span>${transportLabel(s.transport)}</span>
        </div>
      `;
      grid.appendChild(card);
    });
    resultCount.textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
  }

  function matchesFilters(student) {
    if (activeFilters.size === 0) return true;
    return [...activeFilters].every((filter) => {
      if (filter.startsWith("transport:")) return student.transport === filter.slice(10);
      if (filter.startsWith("house:")) return student.house === filter.slice(6);
      if (filter.startsWith("language:")) {
        return (student.language || "").toLowerCase() === filter.slice(9);
      }
      return true;
    });
  }

  function applyFilters() {
    let list = liveStudents.filter(matchesFilters);
    if (searchTerm.trim() !== "") {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    renderStudents(list);
  }

  function syncPillStates() {
    document.querySelectorAll(".pill").forEach((pill) => {
      const isAll = pill.dataset.filter === "all";
      pill.classList.toggle(
        "active",
        isAll ? activeFilters.size === 0 : activeFilters.has(pill.dataset.filter)
      );
      if (pill.dataset.filter === "house:winter") pill.style.setProperty("--pill-house-color", "var(--house-winter)");
      if (pill.dataset.filter === "house:autumn") pill.style.setProperty("--pill-house-color", "var(--house-autumn)");
      if (pill.dataset.filter === "house:spring") pill.style.setProperty("--pill-house-color", "var(--house-spring)");
      if (pill.dataset.filter === "house:summer") pill.style.setProperty("--pill-house-color", "var(--house-summer)");
    });
  }

  function toggleFilter(filter) {
    if (filter === "all") {
      const had = activeFilters.size > 0;
      activeFilters.clear();
      if (had) playToggleOff();
    } else if (filter.startsWith("house:")) {
      const houseFilters = ["house:winter", "house:autumn", "house:spring", "house:summer"];
      if (activeFilters.has(filter)) { activeFilters.delete(filter); playToggleOff(); }
      else { houseFilters.forEach((h) => activeFilters.delete(h)); activeFilters.add(filter); playToggleOn(); }
    } else if (filter.startsWith("language:")) {
      const languageFilters = ["language:hindi", "language:malayalam", "language:french"];
      if (activeFilters.has(filter)) { activeFilters.delete(filter); playToggleOff(); }
      else { languageFilters.forEach((l) => activeFilters.delete(l)); activeFilters.add(filter); playToggleOn(); }
    } else if (activeFilters.has(filter)) {
      activeFilters.delete(filter); playToggleOff();
    } else {
      activeFilters.add(filter); playToggleOn();
    }
    syncPillStates();
    applyFilters();
  }

  function jumpToHouse(house) {
    playNav();
    activeFilters.clear();
    activeFilters.add(`house:${house}`);
    syncPillStates();
    applyFilters();
    document.getElementById("students").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Live: re-render whenever Firestore students resolve or get invalidated.
  onStudents((list) => {
    liveStudents = list;
    applyFilters();
  });

  syncPillStates();

  document.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => toggleFilter(pill.dataset.filter));
  });

  searchInput.addEventListener("input", (e) => {
    searchTerm = e.target.value;
    applyFilters();
  });

  document.querySelectorAll(".house-card, .bar-row").forEach((el) => {
    const trigger = () => jumpToHouse(el.dataset.house);
    el.addEventListener("click", trigger);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(); }
    });
  });
}

// ============================================
// Resources — unchanged
// ============================================
function initResources() {
  const resourceGrid = document.getElementById("resourceGrid");
  if (!resourceGrid) return;

  const resources = [
    { name: "Google Classroom", description: "Assignments, materials, and class-wide posts.", url: "https://classroom.google.com" },
    { name: "Digital Campus (DC)", description: "School portal for grades, attendance, and notices.", url: "https://ict.adiswathba.com/ADIS1/" },
  ];

  resources.forEach((r) => {
    const card = document.createElement("a");
    card.className = "resource-card";
    card.href = r.url;
    card.target = "_blank";
    card.rel = "noopener";
    card.innerHTML = `<h3>${r.name}</h3><p>${r.description}</p><span class="resource-note">Open →</span>`;
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
// Boot — every page
// ============================================
initSplash();
initNav();
initStudentDirectory();
initResources();
initGalleryLightbox();
initHeroChart();
initStatCountUp();
initChangelog();
initTodayDate();

// Firebase-backed modules are lazy. A blocked third-party SDK must not stop
// static navigation, the directory, splash handling, or other local UI.
const OPTIONAL_MODULES = [
  ["auth", "./auth-ui.js", "initAuthUI"],
  ["assignments", "./assignments.js", "initAssignments"],
  ["announcements", "./announcements.js", "initAnnouncements"],
  ["events", "./events.js", "initEvents"],
  ["timetable", "./timetable-live.js", "initTimetableLive"],
  ["dashboard", "./dashboard.js", "initDashboard"],
  ["student management", "./student-manage.js", "initStudentManagement"],
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
