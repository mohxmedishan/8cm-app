// ============================================
// 8CM — Site interactions (entry module)
// ------------------------------------------------
// Imports the auth/task modules and wires up everything else: nav,
// student directory filters, house shortcuts, resources, stats,
// and the loading splash.
// ============================================
import { students } from "./students.js";
import { initAuthUI } from "./auth-ui.js";
import { initTasks } from "./tasks.js";

// ============================================
// Student directory: render + filter
// ============================================
const grid = document.getElementById("studentGrid");
const resultCount = document.getElementById("resultCount");

function transportLabel(t) {
  return t === "OT" ? "Own transport" : `Bus ${t}`;
}

function houseLabel(house) {
  return house.charAt(0).toUpperCase() + house.slice(1);
}

function renderStudents(list) {
  grid.innerHTML = "";
  grid.classList.toggle("empty", list.length === 0);

  list.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "student-card";
    card.style.animationDelay = `${Math.min(i, 12) * 0.02}s`;
    card.innerHTML = `
      <div class="student-top">
        <span class="house-dot ${s.house}"></span>
        <span class="student-name">${s.name}</span>
      </div>
      <div class="student-meta">
        <span>${houseLabel(s.house)}</span>
        <span>${transportLabel(s.transport)}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  resultCount.textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
}

let activeFilters = new Set();
let searchTerm = "";

function matchesFilters(student) {
  if (activeFilters.size === 0) return true;
  return [...activeFilters].every((filter) => {
    if (filter.startsWith("transport:")) return student.transport === filter.slice(10);
    if (filter.startsWith("house:")) return student.house === filter.slice(6);
    return true;
  });
}

function applyFilters() {
  let list = students.filter(matchesFilters);
  if (searchTerm.trim() !== "") {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }
  renderStudents(list);
}

function syncPillStates() {
  document.querySelectorAll(".pill").forEach((pill) => {
    const isAll = pill.dataset.filter === "all";
    pill.classList.toggle("active", isAll ? activeFilters.size === 0 : activeFilters.has(pill.dataset.filter));

    if (pill.dataset.filter === "house:winter") pill.style.setProperty("--pill-house-color", "var(--house-winter)");
    if (pill.dataset.filter === "house:autumn") pill.style.setProperty("--pill-house-color", "var(--house-autumn)");
    if (pill.dataset.filter === "house:spring") pill.style.setProperty("--pill-house-color", "var(--house-spring)");
    if (pill.dataset.filter === "house:summer") pill.style.setProperty("--pill-house-color", "var(--house-summer)");
  });
}

function toggleFilter(filter) {
  if (filter === "all") {
    activeFilters.clear();
  } else if (filter.startsWith("house:")) {
    const houseFilters = ["house:winter", "house:autumn", "house:spring", "house:summer"];
    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
    } else {
      houseFilters.forEach((h) => activeFilters.delete(h));
      activeFilters.add(filter);
    }
  } else if (activeFilters.has(filter)) {
    activeFilters.delete(filter);
  } else {
    activeFilters.add(filter);
  }
  syncPillStates();
  applyFilters();
}

function jumpToHouse(house) {
  activeFilters.clear();
  activeFilters.add(`house:${house}`);
  syncPillStates();
  applyFilters();
  document.getElementById("students").scrollIntoView({ behavior: "smooth", block: "start" });
}

renderStudents(students);
syncPillStates();

document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => toggleFilter(pill.dataset.filter));
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  applyFilters();
});

document.querySelectorAll(".house-card, .bar-row").forEach((el) => {
  const trigger = () => jumpToHouse(el.dataset.house);
  el.addEventListener("click", trigger);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trigger();
    }
  });
});

// ============================================
// Resources — quick links to school platforms
// ============================================
const resources = [
  {
    name: "Google Classroom",
    description: "Assignments, materials, and class-wide posts.",
    url: "https://classroom.google.com",
  },
  {
    name: "Digital Campus (DC)",
    description: "School portal for grades, attendance, and notices.",
    url: "http://lms.adiswathba.com/my/",
  },
];

const resourceGrid = document.getElementById("resourceGrid");
resources.forEach((r) => {
  const card = document.createElement("a");
  card.className = "resource-card";
  card.href = r.url;
  card.target = "_blank";
  card.rel = "noopener";
  card.innerHTML = `
    <h3>${r.name}</h3>
    <p>${r.description}</p>
    <span class="resource-note">Open →</span>
  `;
  resourceGrid.appendChild(card);
});

// ============================================
// Nav: scroll shadow, mobile menu, Home + More dropdowns
// ============================================
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 8);
});

const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");
burger.addEventListener("click", () => {
  burger.classList.toggle("open");
  navLinks.classList.toggle("open");
});

navLinks.querySelectorAll("a.nav-link").forEach((link) => {
  link.addEventListener("click", () => {
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
  });

  document.addEventListener("click", (e) => {
    if (!item.contains(e.target)) {
      item.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

wireDropdown("moreTrigger");

// ============================================
// Hero bar chart — grow on load
// ============================================
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

// ============================================
// Stat count-up — triggered once, on scroll into view
// ============================================
const statNumbers = document.querySelectorAll(".stat-number[data-count]");

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

const statObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        countUp(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);
statNumbers.forEach((el) => statObserver.observe(el));

// ============================================
// Loading splash — brief on first paint, then fades
// ============================================
const splash = document.getElementById("splash");
window.addEventListener("load", () => {
  setTimeout(() => {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 500);
  }, 400);
});

// ============================================
// Boot auth UI + task hub
// ============================================
initAuthUI();
initTasks();
