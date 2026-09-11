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
  { name: "Sarvesh Prabhu", house: "spring", transport: "17" },
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
        <span>${s.house.charAt(0).toUpperCase() + s.house.slice(1)}</span>
        <span>${transportLabel(s.transport)}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  resultCount.textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
}

let activeFilter = "all";
let searchTerm = "";

function applyFilters() {
  let list = students;
  if (activeFilter !== "all") {
    list = list.filter((s) => s.house === activeFilter);
  }
  if (searchTerm.trim() !== "") {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }
  renderStudents(list);
}

renderStudents(students);

// filter pills
document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    activeFilter = pill.dataset.filter;
    applyFilters();
  });
});

// search
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  applyFilters();
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

// close mobile menu after clicking a link
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
const statNumbers = document.querySelectorAll(".stat-number");

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
