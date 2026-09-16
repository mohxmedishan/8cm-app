// ============================================
// 8CM — Site interactions (entry module)
// ============================================
import { getStudentsSync, onStudents } from "./students.js";
import { changelog } from "./changelog.js";
import { playToggleOn, playToggleOff, playOpen, playClose, playExternal, playNav } from "./sound.js";
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
  let monitorUids = new Set();
  const claimUids = new Map();

  const OPTIONS = {
    house: [
      { value: "", label: "All" }, { value: "winter", label: "Winter" },
      { value: "autumn", label: "Autumn" }, { value: "spring", label: "Spring" },
      { value: "summer", label: "Summer" },
    ],
    language: [
      { value: "", label: "All" }, { value: "hindi", label: "Hindi" },
      { value: "malayalam", label: "Malayalam" }, { value: "french", label: "French" },
    ],
    transport: [
      { value: "", label: "All" }, { value: "OT", label: "Own transport" },
      { value: "bus", label: "Bus" },
    ],
    islamic: [
      { value: "", label: "All" }, { value: "islamic", label: "Islamic Education" },
      { value: "value", label: "Value Education" },
    ],
    creative: [
      { value: "", label: "All" }, { value: "dance", label: "Dance" },
      { value: "music", label: "Music" }, { value: "art", label: "Art" },
    ],
  };

  const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
  const transportLabel = (t) => (t === "OT" ? "Own transport" : `Bus ${t}`);
  const rollLabel = (n) => String(n).padStart(2, "0");

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
      const claimedUid = claimUids.get(s.id);
      card.innerHTML = `
        <div class="student-top">
          <span class="roll-badge">${rollLabel(s.rollNumber)}</span>
          <span class="house-dot ${s.house}"></span>
          <span class="student-name">${s.name}</span>
          ${claimedUid && monitorUids.has(claimedUid) ? `<span class="monitor-badge">Monitor</span>` : ""}
        </div>
        <div class="student-meta">
          <span>${houseLabel(s.house)}</span>
          <span>${s.language || "—"}</span>
          <span>${transportLabel(s.transport)}</span>
          ${s.islamic ? `<span>${s.islamic === "islamic" ? "Islamic Ed" : "Value Ed"}</span>` : ""}
          ${s.creative ? `<span>${s.creative.charAt(0).toUpperCase() + s.creative.slice(1)}</span>` : ""}
        </div>
      `;
      card.addEventListener("click", () => openProfile(s.id));
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
    if (!dropdownHost) return;
    dropdownHost.innerHTML = "";
    filterRow.querySelectorAll(".filter-box").forEach((b) => b.classList.remove("open"));
  }

  function openDropdownFor(box) {
    if (!dropdownHost) return;
    const key = box.dataset.filterKey;
    if (box.classList.contains("open")) { closeDropdown(); return; }
    closeDropdown();
    box.classList.add("open");
    const rect = box.getBoundingClientRect();
    dropdownHost.style.left = `${rect.left}px`;
    dropdownHost.style.top = `${rect.bottom + 6}px`;
    dropdownHost.style.minWidth = `${rect.width}px`;
    dropdownHost.innerHTML = OPTIONS[key].map((o) => {
      const active = filters[key] === o.value;
      return `<button type="button" class="filter-option ${active ? "active" : ""}" data-value="${o.value}">${o.label}</button>`;
    }).join("");
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
    box.addEventListener("click", (e) => { e.stopPropagation(); openDropdownFor(box); });
  });
  document.addEventListener("click", (e) => {
    if (!dropdownHost || !dropdownHost.contains(e.target)) closeDropdown();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDropdown(); });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      Object.keys(filters).forEach((k) => (filters[k] = ""));
      Object.keys(filters).forEach(updateBoxLabel);
      searchInput.value = "";
      searchTerm = "";
      applyFilters();
    });
  }

  searchInput.addEventListener("input", (e) => { searchTerm = e.target.value; applyFilters(); });

  onStudents((list) => { liveStudents = list; applyFilters(); });
  Object.keys(filters).forEach(updateBoxLabel);

  async function loadClaims() {
    try {
      const { db } = await import("./firebase-config.js");
      const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const snap = await getDocs(collection(db, "claims"));
      snap.forEach((d) => claimUids.set(d.id, d.data().uid));
      window.__cmClaimUids = claimUids;
    } catch {}
  }
  async function loadMonitorUids() {
    try {
      const { db } = await import("./firebase-config.js");
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const snap = await getDoc(doc(db, "settings", "monitors"));
      if (snap.exists()) monitorUids = new Set(Object.keys(snap.data().uids || {}));
      window.__cmMonitorUids = monitorUids;
    } catch {}
  }
  Promise.all([loadClaims(), loadMonitorUids()]).then(applyFilters);
}

export function openProfile(studentId) {
  const overlay = document.getElementById("profileOverlay");
  const body = document.getElementById("profileBody");
  if (!overlay || !body) return;
  const student = (window.__cmStudents || []).find((s) => s.id === studentId);
  if (!student) return;
  const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
  const transportLabel = (t) => (t === "OT" ? "Own transport" : `Bus ${t}`);
  const claimMap = window.__cmClaimUids || new Map();
  const monitorSet = window.__cmMonitorUids || new Set();
  const claimedUid = claimMap.get(studentId);
  const myAchievements = achievementsCache.filter((a) => a.studentId === studentId);
  body.innerHTML = `
    <div class="profile-header">
      <span class="roll-badge">${String(student.rollNumber).padStart(2, "0")}</span>
      <h3 class="profile-title">${student.name} ${claimedUid && monitorSet.has(claimedUid) ? `<span class="monitor-badge">Monitor</span>` : ""}</h3>
      <div class="profile-pills">
        <span class="profile-stat-pill house-${student.house}"><span class="house-dot ${student.house}"></span>${houseLabel(student.house)}</span>
        ${student.language ? `<span class="profile-stat-pill">${student.language}</span>` : ""}
        <span class="profile-stat-pill">${transportLabel(student.transport)}</span>
        ${student.islamic ? `<span class="profile-stat-pill">${student.islamic === "islamic" ? "Islamic Ed" : "Value Ed"}</span>` : ""}
        ${student.creative ? `<span class="profile-stat-pill">${student.creative.charAt(0).toUpperCase() + student.creative.slice(1)}</span>` : ""}
      </div>
    </div>
    <h4 class="profile-section-title">Achievements</h4>
    ${myAchievements.length ? myAchievements.map((a) => `
      <div class="profile-achievement">
        <span class="task-tag announcement">${a.category || "General"}</span>
        <p class="profile-ach-title">${a.title}</p>
        ${a.description ? `<p class="profile-ach-desc">${a.description}</p>` : ""}
        ${a.date ? `<p class="profile-ach-date">${a.date}</p>` : ""}
      </div>`).join("") : `<p class="tt-ann-empty">No achievements logged yet.</p>`}
  `;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("open"));
}
function closeProfile() {
  const overlay = document.getElementById("profileOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  setTimeout(() => (overlay.hidden = true), 200);
}
window.__cmOpenProfile = openProfile;
onStudents((list) => { window.__cmStudents = list; });
function initProfileModal() {
  const overlay = document.getElementById("profileOverlay");
  const closeBtn = document.getElementById("profileClose");
  if (!overlay) return;
  if (closeBtn) closeBtn.addEventListener("click", closeProfile);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeProfile(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProfile(); });
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
initProfileModal();
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
  ["timetable announcements", "./timetable-announcements.js", "initTimetableAnnouncements"],
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
