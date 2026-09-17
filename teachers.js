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

function render() {
  const grid = $("teacherGrid");
  const count = $("teacherResultCount");
  if (!grid) return;

  const q = searchTerm.trim().toLowerCase();
  const list = q
    ? currentList.filter((t) =>
        (t.name || "").toLowerCase().includes(q) ||
        (t.subject || "").toLowerCase().includes(q) ||
        (t.honorific || "").toLowerCase().includes(q)
      )
    : currentList;

  grid.innerHTML = "";
  grid.classList.toggle("empty", list.length === 0);

  if (list.length === 0) {
    grid.innerHTML = `<p class="teacher-empty">No teachers match that search.</p>`;
    if (count) count.textContent = "0 teachers";
    return;
  }

  list.forEach((t, i) => {
    const card = document.createElement("article");
    card.className = "teacher-card";
    card.style.setProperty("--teacher-accent", subjectAccent(t.subject));
    card.style.animationDelay = `${Math.min(i, 12) * 0.02}s`;
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

  if (count) count.textContent = `${list.length} teacher${list.length === 1 ? "" : "s"}`;
}

export function initTeachers() {
  const grid = $("teacherGrid");
  if (!grid) return;

  currentList = getTeachersSync();
  render();

  onTeachers((list) => {
    currentList = list;
    render();
  });

  loadTeachers().catch(() => {});

  const search = $("teacherSearchInput");
  if (search) {
    search.addEventListener("input", (e) => {
      searchTerm = e.target.value;
      render();
    });
    search.addEventListener("focus", () => playClick());
  }
}
