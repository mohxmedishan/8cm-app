import { students } from "./students.js";
import { initAuthUI } from "./auth-ui.js";
import { initTasks } from "./tasks.js";

const grid = document.getElementById("studentGrid");
const resultCount = document.getElementById("resultCount");

/* ============================================
   Student directory
   ============================================ */

function transportLabel(transport) {
  return transport === "OT" ? "Own transport" : `Bus ${transport}`;
}

function houseLabel(house) {
  return house.charAt(0).toUpperCase() + house.slice(1);
}

function renderStudents(list) {
  if (!grid || !resultCount) return;

  grid.replaceChildren();
  grid.classList.toggle("empty", list.length === 0);

  list.forEach((student, index) => {
    const card = document.createElement("div");
    card.className = "student-card";
    card.style.animationDelay = `${Math.min(index, 12) * 0.02}s`;

    const top = document.createElement("div");
    top.className = "student-top";

    const dot = document.createElement("span");
    dot.className = `house-dot ${student.house}`;

    const name = document.createElement("span");
    name.className = "student-name";
    name.textContent = student.name;

    top.append(dot, name);

    const meta = document.createElement("div");
    meta.className = "student-meta";

    const house = document.createElement("span");
    house.textContent = houseLabel(student.house);

    const transport = document.createElement("span");
    transport.textContent = transportLabel(student.transport);

    meta.append(house, transport);
    card.append(top, meta);
    grid.appendChild(card);
  });

  resultCount.textContent =
    `${list.length} student${list.length === 1 ? "" : "s"}`;
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

  const query = searchTerm.trim().toLowerCase();

  if (query) {
    list = list.filter((student) =>
      student.name.toLowerCase().includes(query)
    );
  }

  renderStudents(list);
}

function syncPillStates() {
  document.querySelectorAll(".pill").forEach((pill) => {
    const filter = pill.dataset.filter;
    const isAll = filter === "all";

    pill.classList.toggle(
      "active",
      isAll
        ? activeFilters.size === 0
        : activeFilters.has(filter)
    );

    const colors = {
      "house:winter": "var(--house-winter)",
      "house:autumn": "var(--house-autumn)",
      "house:spring": "var(--house-spring)",
      "house:summer": "var(--house-summer)",
    };

    if (colors[filter]) {
      pill.style.setProperty(
        "--pill-house-color",
        colors[filter]
      );
    }
  });
}

function toggleFilter(filter) {
  if (filter === "all") {
    activeFilters.clear();
  } else if (filter.startsWith("house:")) {
    const houses = [
      "house:winter",
      "house:autumn",
      "house:spring",
      "house:summer",
    ];

    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
    } else {
      houses.forEach((house) => activeFilters.delete(house));
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

  document.getElementById("students")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

renderStudents(students);
syncPillStates();

document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    toggleFilter(pill.dataset.filter);
  });
});

document.getElementById("searchInput")?.addEventListener(
  "input",
  (event) => {
    searchTerm = event.target.value;
    applyFilters();
  }
);

document.querySelectorAll(".house-card, .bar-row").forEach((element) => {
  const activate = () => jumpToHouse(element.dataset.house);

  element.addEventListener("click", activate);

  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
});

/* ============================================
   Resources
   ============================================ */

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

if (resourceGrid) {
  resources.forEach((resource) => {
    const card = document.createElement("a");

    card.className = "resource-card";
    card.href = resource.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const title = document.createElement("h3");
    title.textContent = resource.name;

    const description = document.createElement("p");
    description.textContent = resource.description;

    const note = document.createElement("span");
    note.className = "resource-note";
    note.textContent = "Open →";

    card.append(title, description, note);
    resourceGrid.appendChild(card);
  });
}

/* ============================================
   Navbar
   ============================================ */

const nav = document.getElementById("nav");

window.addEventListener(
  "scroll",
  () => {
    nav?.classList.toggle(
      "scrolled",
      window.scrollY > 8
    );
  },
  { passive: true }
);

const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");

function closeMobileNav() {
  burger?.classList.remove("open");
  burger?.setAttribute("aria-expanded", "false");
  navLinks?.classList.remove("open");
}

burger?.addEventListener("click", (event) => {
  event.stopPropagation();

  const open = !navLinks?.classList.contains("open");

  burger.classList.toggle("open", open);
  burger.setAttribute("aria-expanded", String(open));
  navLinks?.classList.toggle("open", open);
});

navLinks?.querySelectorAll("a.nav-link").forEach((link) => {
  link.addEventListener("click", closeMobileNav);
});

function wireDropdown(id) {
  const trigger = document.getElementById(id);
  if (!trigger) return;

  const item = trigger.closest(".nav-item");

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();

    document
      .querySelectorAll(".nav-item.has-dropdown.open")
      .forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          other
            .querySelector(".nav-dropdown-trigger")
            ?.setAttribute("aria-expanded", "false");
        }
      });

    const open = item.classList.toggle("open");

    trigger.setAttribute(
      "aria-expanded",
      String(open)
    );
  });

  item.querySelectorAll(".dropdown a").forEach((link) => {
    link.addEventListener("click", () => {
      item.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      closeMobileNav();
    });
  });
}

wireDropdown("homeTrigger");
wireDropdown("moreTrigger");

document.addEventListener("click", (event) => {
  document
    .querySelectorAll(".nav-item.has-dropdown.open")
    .forEach((item) => {
      if (!item.contains(event.target)) {
        item.classList.remove("open");
        item
          .querySelector(".nav-dropdown-trigger")
          ?.setAttribute("aria-expanded", "false");
      }
    });
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  document
    .querySelectorAll(".nav-item.has-dropdown.open")
    .forEach((item) => {
      item.classList.remove("open");
      item
        .querySelector(".nav-dropdown-trigger")
        ?.setAttribute("aria-expanded", "false");
    });

  closeMobileNav();
});

/* ============================================
   Hero bars
   ============================================ */

function animateBars() {
  document.querySelectorAll(".bar-fill").forEach((bar) => {
    const value = Number.parseFloat(bar.dataset.value);
    const max = Number.parseFloat(bar.dataset.max);

    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      bar.style.width = "0%";
      return;
    }

    bar.style.width = `${Math.min(
      100,
      (value / max) * 100
    )}%`;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", animateBars, {
    once: true,
  });
} else {
  animateBars();
}

/* ============================================
   Stat counters
   ============================================ */

const statNumbers = document.querySelectorAll(
  ".stat-number[data-count]"
);

function countUp(element) {
  const target = Number.parseInt(
    element.dataset.count,
    10
  );

  if (!Number.isFinite(target)) return;

  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min(
      (now - start) / duration,
      1
    );

    const eased =
      1 - Math.pow(1 - progress, 3);

    element.textContent = String(
      Math.round(eased * target)
    );

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

if ("IntersectionObserver" in window) {
  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        countUp(entry.target);
        statObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.5 }
  );

  statNumbers.forEach((element) => {
    statObserver.observe(element);
  });
} else {
  statNumbers.forEach(countUp);
}

/* ============================================
   Splash
   ============================================ */

const splash = document.getElementById("splash");

function hideSplash() {
  if (!splash) return;

  splash.classList.add("hide");

  window.setTimeout(() => {
    splash.remove();
  }, 500);
}

if (document.readyState === "complete") {
  window.setTimeout(hideSplash, 380);
} else {
  window.addEventListener(
    "load",
    () => window.setTimeout(hideSplash, 380),
    { once: true }
  );
}

/* ============================================
   Firebase-dependent features
   ============================================ */

(async () => {
  try {
    await initAuthUI();
    await initTasks();
  } catch (error) {
    console.error(
      "Firebase features failed to initialize:",
      error
    );

    const authSlot =
      document.getElementById("authSlot");

    if (authSlot) {
      authSlot.innerHTML = `
        <button
          class="btn btn-primary btn-small"
          id="signInTriggerBtn"
          type="button"
        >
          Sign in
        </button>
      `;

      document
        .getElementById("signInTriggerBtn")
        ?.addEventListener("click", () => {
          document.getElementById("authOverlay").hidden = false;
        });
    }

    const taskList =
      document.getElementById("taskList");

    if (taskList) {
      taskList.innerHTML = `
        <p class="task-empty">
          Live tasks are temporarily unavailable.
        </p>
      `;
    }
  }
})();
