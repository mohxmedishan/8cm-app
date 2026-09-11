// ============================================
// CM — Student data
// ============================================
// batches is an array so students can later carry
// multiple class badges, e.g. ["5CM", "6CM", "7CM", "8CM"].
const students = [
  { name: "Abhay Sriram Kolluru", house: "winter", transport: "22", batches: ["8CM"] },
  { name: "Abhinav Biju", house: "autumn", transport: "4", batches: ["8CM"] },
  { name: "Adithya Sunil Kumar", house: "spring", transport: "61", batches: ["8CM"] },
  { name: "Advitya", house: "autumn", transport: "16", batches: ["8CM"] },
  { name: "Ashwin Verma", house: "summer", transport: "57", batches: ["8CM"] },
  { name: "Dhruvlal Kalathingal", house: "autumn", transport: "OT", batches: ["8CM"] },
  { name: "Garvit Bhola", house: "spring", transport: "26", batches: ["8CM"] },
  { name: "Ihsan Sajidh Karappamveettil", house: "spring", transport: "52", batches: ["8CM"] },
  { name: "Khush Bimal Thakkar", house: "autumn", transport: "17", batches: ["8CM"] },
  { name: "Mohamed Ishan Kunnummal", house: "spring", transport: "OT", batches: ["8CM"] },
  { name: "Mohammed Akhsar", house: "spring", transport: "7", batches: ["8CM"] },
  { name: "Mohammed Ali Al Jabri", house: "winter", transport: "OT", batches: ["8CM"] },
  { name: "Mohammed Isam Hussain", house: "winter", transport: "37", batches: ["8CM"] },
  { name: "Muhammad Ibrahim", house: "autumn", transport: "17", batches: ["8CM"] },
  { name: "Muhammed Mishal Ali Kuzhiyanchery", house: "spring", transport: "58", batches: ["8CM"] },
  { name: "Naresh Nair Narayanan", house: "spring", transport: "OT", batches: ["8CM"] },
  { name: "Parthiv Suresh Babu", house: "autumn", transport: "17", batches: ["8CM"] },
  { name: "Pranav Rakesh Nair", house: "winter", transport: "3", batches: ["8CM"] },
  { name: "Pranav Sathyam", house: "autumn", transport: "26", batches: ["8CM"] },
  { name: "Rushdi Nasar", house: "autumn", transport: "OT", batches: ["8CM"] },
  { name: "Saathvik Chooranath Sajithkumar", house: "spring", transport: "64", batches: ["8CM"] },
  { name: "Sarvesh Prabhu", house: "summer", transport: "17", batches: ["8CM"] },
  { name: "Sayed Ahmed Faizaan Hirdh", house: "winter", transport: "63", batches: ["8CM"] },
  { name: "Shahbaz Shamsudeen", house: "winter", transport: "OT", batches: ["8CM"] },
  { name: "Suhail Saidu Mohammed", house: "summer", transport: "18", batches: ["8CM"] },
  { name: "Tazeem Mahfuz Mohamed Ismail", house: "winter", transport: "4", batches: ["8CM"] },
  { name: "Vaibhav Vibin", house: "autumn", transport: "26", batches: ["8CM"] },
  { name: "Zayan Sayed Munaffer", house: "autumn", transport: "3", batches: ["8CM"] },
  { name: "Zayan Shafil Riyas Raymarakkar Puthanpurayil", house: "winter", transport: "39", batches: ["8CM"] },
  { name: "Zishan Mohammed Karathel", house: "autumn", transport: "7", batches: ["8CM"] },
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

    const batchBadges = (s.batches || [])
      .map((batch) => `<span class="batch-badge">${batch}</span>`)
      .join("");

    card.innerHTML = `
      <div class="student-top">
        <span class="house-dot ${s.house}"></span>
        <span class="student-name">${s.name}</span>
      </div>
      <div class="student-badges">
        ${batchBadges}
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

let activeFilter = "all";
let searchTerm = "";

function matchesFilter(student) {
  if (activeFilter === "all") return true;

  if (activeFilter.startsWith("batch:")) {
    const batch = activeFilter.slice(6);
    return (student.batches || []).includes(batch);
  }

  if (activeFilter.startsWith("transport:")) {
    const transport = activeFilter.slice(10);
    return student.transport === transport;
  }

  if (activeFilter.startsWith("house:")) {
    const house = activeFilter.slice(6);
    return student.house === house;
  }

  // Backward-compatible house filter support.
  return student.house === activeFilter;
}

function applyFilters() {
  let list = students.filter(matchesFilter);

  if (searchTerm.trim() !== "") {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }

  renderStudents(list);
}

function setActiveFilter(filter) {
  activeFilter = filter;

  document.querySelectorAll(".pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.filter === filter);
  });

  applyFilters();
}

renderStudents(students);

// filter pills
document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    setActiveFilter(pill.dataset.filter);
  });
});

// search
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  applyFilters();
});

// ============================================
// House cards — jump to Students with filter
// ============================================
document.querySelectorAll(".house-jump").forEach((card) => {
  const openHouse = () => {
    const house = card.dataset.house;
    setActiveFilter(`house:${house}`);
    document.getElementById("students").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  card.addEventListener("click", openHouse);

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openHouse();
    }
  });
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

// close mobile menu after clicking a regular link
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
