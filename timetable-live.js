// ============================================
// 8CM — Timetable: live behavior (V10.1)
// ------------------------------------------------
// Layers behavior onto the static grid in timetable.html:
//   · day navigation with relative labels (Today / Tomorrow / …)
//   · current/next class highlighting
//   · date-aware homework dots
//   · tap-a-period detail panel with links to index.html#today
//
// Homework dot rules (see hwAppliesToDay below):
//   · due today → dot today only, and only while school isn't over
//   · due later  → dot every period of that subject from tomorrow
//                   through the due date, nothing before/after
//   · overdue    → nothing
//   · completed  → nothing
// ============================================
import { getLiveStatus, todayKey, isSchoolDay } from "./timetable-data.js";
import { onAssignments, isCompletedByMe } from "./assignments.js";

const $ = (id) => document.getElementById(id);
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri"];
const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };
const DAY_DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

let selectedDay = null;
let homeworkReady = false;
let homeworkCache = [];

function defaultDay() {
  const today = todayKey();
  return isSchoolDay(today) ? today : "mon";
}

// ------------------------------------------------
// Date helpers
// ------------------------------------------------
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd() {
  return ymd(new Date());
}

// The calendar date for a given day key relative to today's real date.
// If today is Wednesday, dateForDay("tue") is yesterday, dateForDay("fri")
// is two days out. The grid is a Mon–Fri schedule so this only ever needs
// to line up those five weekday keys with the current week.
function dateForDay(day) {
  const targetDow = DAY_DOW[day];
  if (targetDow === undefined) return null;
  const t = new Date();
  const diff = targetDow - t.getDay();
  t.setDate(t.getDate() + diff);
  return ymd(t);
}

// ------------------------------------------------
// School-day timing
// ------------------------------------------------
function schoolEndMinutes(day) {
  return day === "fri" ? 11 * 60 + 10 : 14 * 60 + 35;
}
function schoolIsOverToday() {
  const d = todayKey();
  if (!isSchoolDay(d)) return true;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= schoolEndMinutes(d);
}
function minutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ------------------------------------------------
// Day label
// ------------------------------------------------
function relativeDayLabel(day) {
  const today = todayKey();
  const tIdx = DAY_ORDER.indexOf(today);
  const sIdx = DAY_ORDER.indexOf(day);
  const name = DAY_LABEL[day];
  if (tIdx === -1 || sIdx === -1) return name;
  const diff = sIdx - tIdx;
  if (diff === 0) return `${name} · Today`;
  if (diff === 1) return `${name} · Tomorrow`;
  if (diff === -1) return `${name} · Yesterday`;
  if (diff > 1) return `${name} · in ${diff} days`;
  return `${name} · ${Math.abs(diff)} days ago`;
}

// ------------------------------------------------
// Homework → dot logic
// ------------------------------------------------
function hwAppliesToDay(hw, day) {
  if (!hw.dueDate) return false;
  const due = hw.dueDate;
  const today = todayYmd();
  const cellDate = dateForDay(day);
  if (!cellDate) return false;

  if (due < today) return false;
  if (due === today) {
    return cellDate === today && !schoolIsOverToday();
  }
  return cellDate > today && cellDate <= due;
}

function homeworkForCell(cell) {
  const day = cell.dataset.day;
  const subject = cell.dataset.subject;
  if (!day || !subject) return [];
  return homeworkCache.filter(
    (hw) =>
      hw.subject === subject &&
      !isCompletedByMe(hw.id) &&
      hwAppliesToDay(hw, day)
  );
}

function applyHomeworkDots() {
  if (!homeworkReady) return;
  document.querySelectorAll(".tt-cell[data-subject]").forEach((cell) => {
    cell.classList.toggle("tt-cell-has-homework", homeworkForCell(cell).length > 0);
  });
}

// ------------------------------------------------
// Rendering
// ------------------------------------------------
function clearHighlights() {
  document.querySelectorAll(".tt-cell").forEach((cell) => {
    cell.classList.remove("tt-row-selected", "tt-cell-current", "tt-cell-next", "tt-cell-has-homework");
  });
}

function renderStatusBar() {
  const bar = $("ttNowBar");
  if (!bar) return;

  const status = getLiveStatus();
  const isToday = selectedDay === status.dayKey;

  if (!isToday) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;

  if (!status.isSchoolDay) {
    bar.innerHTML = `<span class="tt-now-item">No school today</span>`;
    return;
  }

  if (status.current) {
    let html = `<span class="tt-now-item"><strong>Now:</strong> ${status.current.full} — ${status.minutesLeftInCurrent}m left</span>`;
    if (status.next) {
      html += `<span class="tt-now-item"><strong>Next:</strong> ${status.next.full} at ${minutesToClock(status.next.start)}</span>`;
    } else {
      html += `<span class="tt-now-item">Last period of the day</span>`;
    }
    bar.innerHTML = html;
    return;
  }

  if (status.next) {
    bar.innerHTML = `<span class="tt-now-item">Before school · <strong>First up:</strong> ${status.next.full} at ${minutesToClock(status.next.start)}</span>`;
    return;
  }

  bar.innerHTML = schoolIsOverToday()
    ? `<span class="tt-now-item">School's over for today.</span>`
    : `<span class="tt-now-item">No class right now</span>`;
}

function renderDetailPanel(cell) {
  const panel = $("ttDetailPanel");
  if (!panel) return;

  if (!cell) {
    panel.innerHTML = `<p class="tt-detail-hint">Tap any period for its full name and linked homework.</p>`;
    return;
  }

  const subject = cell.dataset.subject;
  const full = cell.dataset.full || subject;
  const day = cell.dataset.day;
  const hw = homeworkReady ? homeworkForCell(cell) : [];

  panel.innerHTML = `
    <p class="tt-detail-subject">${full} · ${DAY_LABEL[day]}</p>
    ${hw.length
      ? hw.map(
          (h) =>
            `<a class="tt-detail-hw" href="index.html#today">${h.title}<span class="tt-detail-due">Due ${h.dueDate}</span></a>`
        ).join("")
      : `<p class="tt-detail-hw tt-detail-hw-none">No homework linked to this period.</p>`}
  `;
}

function renderDay() {
  clearHighlights();

  document.querySelectorAll(`.tt-cell[data-day="${selectedDay}"]`).forEach((c) =>
    c.classList.add("tt-row-selected")
  );

  const status = getLiveStatus();
  if (selectedDay === status.dayKey && status.isSchoolDay) {
    if (status.current) {
      document
        .querySelectorAll(`.tt-cell[data-day="${selectedDay}"][data-period="${status.current.period}"]`)
        .forEach((c) => c.classList.add("tt-cell-current"));
    }
    if (status.next) {
      document
        .querySelectorAll(`.tt-cell[data-day="${selectedDay}"][data-period="${status.next.period}"]`)
        .forEach((c) => c.classList.add("tt-cell-next"));
    }
  }

  applyHomeworkDots();
  renderStatusBar();

  const label = $("ttSelectedDayLabel");
  if (label) label.textContent = relativeDayLabel(selectedDay);
}

function step(delta) {
  const idx = DAY_ORDER.indexOf(selectedDay);
  const nextIdx = (idx + delta + DAY_ORDER.length) % DAY_ORDER.length;
  selectedDay = DAY_ORDER[nextIdx];
  renderDay();
  renderDetailPanel(null);
}

export function initTimetableLive() {
  const grid = document.querySelector(".tt-grid");
  if (!grid) return;

  selectedDay = defaultDay();
  renderDay();
  renderDetailPanel(null);

  const prevBtn = $("ttPrevDay");
  const nextBtn = $("ttNextDay");
  if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => step(1));

  grid.querySelectorAll(".tt-cell[data-subject]").forEach((cell) => {
    cell.addEventListener("click", () => renderDetailPanel(cell));
  });

  onAssignments((assignments) => {
    homeworkCache = Array.isArray(assignments) ? assignments : [];
    homeworkReady = true;
    applyHomeworkDots();
  });

  setInterval(() => {
    renderStatusBar();
    if (selectedDay === todayKey()) renderDay();
  }, 60000);
}
