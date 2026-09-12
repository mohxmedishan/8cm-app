// ============================================
// 8CM — Student data
// ============================================
const students = [
  { name: "Abhay Sriram Kolluru", house: "winter", transport: "22" },
  { name: "Abhinav Biju", house: "autumn", transport: "4" },
  { name: "Adithya Sunil Kumar", house: "spring", transport: "61" },
  { name: "Advitya", house: "autumn", transport: "16" },
  { name: "Ashwin Verma", house: "summer", transport: "57" },
  { name: "Dhruvlal Kalathingal", house: "autumn", transport: "OT" },
  { name: "Garvit Bhola", house: "spring", transport: "26" },
  { name: "Ihsan Sajidh Karappamveettil", house: "spring", transport: "52" },
  { name: "Khush Bimal Thakkar", house: "autumn", transport: "17" },
  { name: "Mohamed Ishan Kunnummal", house: "spring", transport: "OT" },
  { name: "Mohammed Akhsar", house: "spring", transport: "7" },
  { name: "Mohammed Ali Al Jabri", house: "winter", transport: "OT" },
  { name: "Mohammed Isam Hussain", house: "winter", transport: "37" },
  { name: "Muhammad Ibrahim", house: "autumn", transport: "17" },
  { name: "Muhammed Mishal Ali Kuzhiyanchery", house: "spring", transport: "58" },
  { name: "Naresh Nair Narayanan", house: "spring", transport: "OT" },
  { name: "Parthiv Suresh Babu", house: "autumn", transport: "17" },
  { name: "Pranav Rakesh Nair", house: "winter", transport: "3" },
  { name: "Pranav Sathyam", house: "autumn", transport: "26" },
  { name: "Rushdi Nasar", house: "autumn", transport: "OT" },
  { name: "Saathvik Chooranath Sajithkumar", house: "spring", transport: "64" },
  { name: "Sarvesh Prabhu", house: "summer", transport: "17" },
  { name: "Sayed Ahmed Faizaan Hirdh", house: "winter", transport: "63" },
  { name: "Shahbaz Shamsudeen", house: "winter", transport: "OT" },
  { name: "Suhail Saidu Mohammed", house: "summer", transport: "18" },
  { name: "Tazeem Mahfuz Mohamed Ismail", house: "winter", transport: "4" },
  { name: "Vaibhav Vibin", house: "autumn", transport: "26" },
  { name: "Zayan Sayed Munaffer", house: "autumn", transport: "3" },
  { name: "Zayan Shafil Riyas Raymarakkar Puthanpurayil", house: "winter", transport: "39" },
  { name: "Zishan Mohammed Karathel", house: "autumn", transport: "7" },
];

// ============================================
// Render student grid
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
    if (filter.startsWith("transport:")) {
      return student.transport === filter.slice(10);
    }
    if (filter.startsWith("house:")) {
      return student.house === filter.slice(6);
    }
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
    activeFilters.clear();
  } else if (filter.startsWith("house:")) {
    // Houses are mutually exclusive with each other; OT stays independent.
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

// House cards + hero bar rows both jump to Students with that house pre-filtered
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
    url: "#",
  },
  {
    name: "ClassDojo",
    description: "Behaviour points and updates from teachers.",
    url: "#",
  },
  {
    name: "Digital Campus (DC)",
    description: "School portal for grades, attendance, and notices.",
    url: "#",
  },
];

const resourceGrid = document.getElementById("resourceGrid");

resources.forEach((r) => {
  const card = document.createElement("a");
  card.className = "resource-card";
  card.href = r.url;
  card.target = "_blank";
  card.rel = "noopener";

  const isPlaceholder = r.url === "#";
  if (isPlaceholder) {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const note = card.querySelector(".resource-note");
      note.textContent = "Link not added yet";
      card.classList.add("pinged");
      setTimeout(() => {
        note.textContent = "Open →";
        card.classList.remove("pinged");
      }, 1600);
    });
  }

  card.innerHTML = `
    <h3>${r.name}</h3>
    <p>${r.description}</p>
    <span class="resource-note">${isPlaceholder ? "Open →" : "Open →"}</span>
  `;
  resourceGrid.appendChild(card);
});

// ============================================
// What's for today — daily task hub
// ============================================
// Placeholder auth state. This is UI scaffolding only — real access
// control has to come from Firebase (or whatever backend is chosen)
// once that's wired in. A client-side flag like this can be flipped
// in devtools, so it must never be trusted as the actual security
// boundary; it just decides what the page tries to render.
let currentUser = { role: "student" }; // "student" | "admin"
function isAdmin() {
  return currentUser.role === "admin";
}

// Mock data for layout testing. Swap for the real list (and eventually
// a Firestore collection) once one exists.
const dailyTasks = [
  { subject: "Math", type: "homework", detail: "Exercise 4.3, questions 1–10", due: "Tomorrow" },
  { subject: "Science", type: "announcement", detail: "Bring lab coats for the practical", due: "Monday" },
  { subject: "English", type: "homework", detail: "Finish the Chapter 6 reading summary", due: "Tomorrow" },
  { subject: "Value Education", type: "announcement", detail: "Notebook check next class", due: "Wednesday" },
];

function renderTasks() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  if (dailyTasks.length === 0) {
    list.innerHTML = `<p class="task-empty">Nothing logged for today.</p>`;
    return;
  }

  dailyTasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task-row";
    row.innerHTML = `
      <span class="task-tag ${task.type}">${task.type === "homework" ? "Homework" : "Announcement"}</span>
      <div class="task-body">
        <p class="task-subject">${task.subject}</p>
        <p class="task-detail">${task.detail}</p>
      </div>
      <span class="task-due">${task.due}</span>
      <div class="task-admin-actions admin-only" hidden>
        <button class="task-icon-btn" aria-label="Edit task">✎</button>
        <button class="task-icon-btn" aria-label="Delete task">✕</button>
      </div>
    `;
    list.appendChild(row);
  });

  applyAdminVisibility();
}

function applyAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.hidden = !isAdmin();
  });
}

document.getElementById("todayDate").textContent =
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
  " — homework, tasks, and announcements, kept current.";

renderTasks();

document.getElementById("addTaskBtn").addEventListener("click", () => {
  // Wire this up to a real form + Firestore write once admin auth exists.
  console.log("Add task clicked — hook up admin editing here later.");
});

// ============================================
// Nav: scroll shadow + mobile menu + Home dropdown
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

const homeTrigger = document.getElementById("homeTrigger");
const homeItem = homeTrigger.closest(".nav-item");

homeTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = homeItem.classList.toggle("open");
  homeTrigger.setAttribute("aria-expanded", isOpen);
});

document.addEventListener("click", (e) => {
  if (!homeItem.contains(e.target)) {
    homeItem.classList.remove("open");
    homeTrigger.setAttribute("aria-expanded", "false");
  }
});

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
