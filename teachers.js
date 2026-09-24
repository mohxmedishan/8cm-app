
// ============================================
// 8CM — Teachers directory (grid + search)
// ============================================
import { getTeachersSync, onTeachers, loadTeachers } from "./teachers-data.js";
import { playClick } from "./sound.js";

const $ = (id) => document.getElementById(id);

const escapeHtml = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

function initials(teacher) {
  const parts = String(teacher.name || "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// Pick a background tint based on subject so each subject reads as
// a loose cluster without needing per-subject icons.
function subjectAccent(subject) {
  const s = (subject || "").toLowerCase();
  if (s.includes("math")) return "var(--accent)";
  if (s.includes("phys") || s.includes("chem") || s.includes("bio") || s.includes("science") || s.includes("computer") || s.includes("artificial"))
    return "var(--house-winter)";
  if (s.includes("english") || s.includes("arabic") || s.includes("hindi") || s.includes("malayalam") || s.includes("french"))
    return "var(--house-autumn)";
  if (s.includes("social") || s.includes("physical") || s.includes("value")) return "var(--house-spring)";
  if (s.includes("creative") || s.includes("islamic")) return "var(--house-summer)";
  return "var(--accent)";
}

let currentList = [];
let searchTerm = "";

function subjectCategory(subject) {
  const s = (subject || "").toLowerCase();
  if (s.includes("math")) return "math";
  if (
    s.includes("phys") || s.includes("chem") || s.includes("bio") ||
    s.includes("science") || s.includes("computer") || s.includes("artificial") ||
    s.includes("mscs")
  ) return "sciences";
  if (
    s.includes("english") || s.includes("arabic") || s.includes("hindi") ||
    s.includes("malayalam") || s.includes("french")
  ) return "languages";
  if (
    s.includes("social") || s.includes("physical education") ||
    s.includes("value education") || s.includes("library")
  ) return "humanities";
  if (s === "art" || s.includes("creative") || s.includes("islamic") ||
      s.includes("dance") || s.includes("music")) return "creative";
  return "other";
}

const CATEGORY_OPTIONS = [
  { value: "",          label: "All" },
  { value: "math",      label: "Mathematics" },
  { value: "sciences",  label: "Sciences & computing" },
  { value: "languages", label: "Languages" },
  { value: "humanities",label: "Humanities & PE" },
  { value: "creative",  label: "Creative arts" },
  { value: "other",     label: "Other" },
];

export function initTeachers() {
  const grid = $("teacherGrid");
  if (!grid) return;

  currentList = getTeachersSync();
  let activeCategory = "";

  // ---- filtering ----
  function applyAndRender() {
    const q = searchTerm.trim().toLowerCase();
    const list = currentList.filter((t) => {
      if (activeCategory && subjectCategory(t.subject) !== activeCategory) return false;
      if (!q) return true;
      return (
        (t.name || "").toLowerCase().includes(q) ||
        (t.subject || "").toLowerCase().includes(q) ||
        (t.honorific || "").toLowerCase().includes(q)
      );
    });
    renderList(list);

    // result count
    const count = $("teacherResultCount");
    if (count) count.textContent = `${list.length} teacher${list.length === 1 ? "" : "s"}`;

    // filter box state
    const box = document.querySelector('#teacherFilterRow .filter-box[data-filter-key="category"]');
    if (box) box.classList.toggle("is-active", !!activeCategory);
    const clear = $("teacherFilterClear");
    if (clear) clear.hidden = !activeCategory && !searchTerm.trim();
  }

  function renderList(list) {
    grid.innerHTML = "";
    grid.classList.toggle("empty", list.length === 0);
    if (list.length === 0) {
      grid.innerHTML = `<p class="teacher-empty">No teachers match that search.</p>`;
      return;
    }
    list.forEach((t, i) => {
      const card = document.createElement("article");
      card.className = "teacher-card";
      card.style.setProperty("--teacher-accent", subjectAccent(t.subject));
      card.style.animationDelay = `${Math.min(i, 12) * 0.01}s`;
      card.innerHTML = `
        <div class="teacher-avatar" aria-hidden="true">
          <span>${escapeHtml(initials(t))}</span>
        </div>
        <div class="teacher-body">
          <p class="teacher-name">${escapeHtml(t.honorific || "")} ${escapeHtml(t.name || "")}</p>
          <p class="teacher-subject">${escapeHtml(t.subject || "—")}</p>
          ${t.notes ? `<p class="teacher-notes">${escapeHtml(t.notes)}</p>` : ""}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ---- category dropdown (same mechanic as the student filter row) ----
  const filterRow = $("teacherFilterRow");
  const dropdownHost = $("teacherFilterDropdownHost");

  function closeDropdown() {
    if (dropdownHost) dropdownHost.innerHTML = "";
    filterRow?.querySelectorAll(".filter-box").forEach((b) => b.classList.remove("open"));
  }

  function openDropdown(box) {
    if (!dropdownHost) return;
    if (box.classList.contains("open")) { closeDropdown(); return; }
    closeDropdown();
    box.classList.add("open");
    const rect = box.getBoundingClientRect();
    dropdownHost.style.left = `${rect.left}px`;
    dropdownHost.style.top = `${rect.bottom + 6}px`;
    dropdownHost.style.minWidth = `${rect.width}px`;
    dropdownHost.innerHTML = CATEGORY_OPTIONS
      .map((o) => `<button type="button" class="filter-option ${activeCategory === o.value ? "active" : ""}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`)
      .join("");
    dropdownHost.querySelectorAll(".filter-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        activeCategory = opt.dataset.value;
        const valEl = filterRow.querySelector('[data-value-for="category"]');
        if (valEl) valEl.textContent = CATEGORY_OPTIONS.find((o) => o.value === activeCategory)?.label || "All";
        closeDropdown();
        applyAndRender();
      });
    });
  }

  if (filterRow) {
    filterRow.querySelectorAll(".filter-box").forEach((box) => {
      box.addEventListener("click", (e) => { e.stopPropagation(); openDropdown(box); });
    });
  }
  document.addEventListener("click", (e) => {
    if (dropdownHost && !dropdownHost.contains(e.target)) closeDropdown();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDropdown(); });

  const clearBtn = $("teacherFilterClear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activeCategory = "";
      searchTerm = "";
      const search = $("teacherSearchInput");
      if (search) search.value = "";
      const valEl = filterRow?.querySelector('[data-value-for="category"]');
      if (valEl) valEl.textContent = "All";
      applyAndRender();
    });
  }

  const search = $("teacherSearchInput");
  if (search) {
    search.addEventListener("input", (e) => { searchTerm = e.target.value; applyAndRender(); });
    search.addEventListener("focus", () => playClick());
  }

  onTeachers((list) => { currentList = list; applyAndRender(); });
  loadTeachers().catch(() => {});

  applyAndRender();
}
