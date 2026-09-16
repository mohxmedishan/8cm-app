// ============================================
// 8CM — Timetable: live behavior
// ------------------------------------------------
// The grid itself stays exactly as it was (static HTML, same visual
// design) — this only reads data-day/data-period attributes already
// on each .tt-cell and layers behavior on top: which day is
// "selected" (defaults to today), current/next class + time
// remaining, and a tap-for-detail panel that pulls in any homework
// linked to that subject via assignments.js's shared cache (no extra
// Firestore read — see the comment at the top of assignments.js).
//
// V10 changes:
//   · Day nav shows relative labels ("Wednesday · Today",
//     "Thursday · Tomorrow", "Tuesday · Yesterday").
//   · Homework dots respect the homework's dueDate — a period only
//     gets a dot if the homework was due on or before that day.
//   · "School's over for today" appears once the last period of the
//     day has ended, instead of silently showing "No class right now".
//   · Homework rows in the detail panel are real links that jump to
//     index.html#today.
// ============================================
import { getDaySchedule, getLiveStatus, todayKey, isSchoolDay } from "./timetable-data.js";
import { onAssignments, getHomeworkForSubject } from "./assignments.js";

const $ = (id) => document.getElementById(id);
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri"];
const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };

let selectedDay = null;
let homeworkReady = false;

function defaultDay() {
  const today = todayKey();
  return isSchoolDay(today) ? today : "mon";
}

function clearHighlights() {
  document.querySelectorAll(".tt-cell").forEach((cell) => {
    cell.classList.remove("tt-row-selected", "tt-cell-current", "tt-cell-next", "tt-cell-has-homework");
  });
}

function minutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ------------------------------------------------
// Day nav — "Wednesday · Today" / "Thursday · Tomorrow"
// ------------------------------------------------
function relativeDayLabel(day) {
  const today = todayKey();
  const name = DAY_LABEL[day];
  const todayIdx = DAY_ORDER.indexOf(today);
  if (todayIdx === -1) return name; // weekend

  const idx = DAY_ORDER.indexOf(day);
  const diff = idx - todayIdx;
  if (diff === 0) return `${name} · Today`;
  if (diff === 1) return `${name} · Tomorrow`;
  if (diff === -1) return `${name} · Yesterday`;
  if (diff > 1) return `${name} · in ${diff} days`;
  return `${name} · ${Math.abs(diff)} days ago`;
}

// ------------------------------------------------
// "School's over" helper
// ------------------------------------------------
function schoolDayEndMinutes(day) {
  return day === "fri" ? 11 * 60 + 10 : 14 * 60 + 35;
}

function renderStatusBar() {
  const bar = $("ttNowBar");
  if (!bar) return;

  const status = getLiveStatus();
  const isToday = selectedDay === status.dayKey;

  if (isToday && status.isSchoolDay) {
    const d = new Date();
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const schoolOver = nowMin >= schoolDayEndMinutes(selectedDay);

    if (status.current) {
      let html = `<span class="tt-now-item"><strong>Now:</strong> ${status.current.full} — ${status.minutesLeftInCurrent}m left</span>`;
      html += status.next
        ? `<span class="tt-now-item"><strong>Next:</strong> ${status.next.full} at ${minutesToClock(status.next.start)}</span>`
        : `<span class="tt-now-item">Last period of the day</span>`;
      bar.innerHTML = html;
      return;
    }
    if (status.next) {
      bar.innerHTML = `<span class="tt-now-item">Before school · <strong>First up:</strong> ${status.next.full} at ${minutesToClock(status.next.start)}</span>`;
      return;
    }
    bar.innerHTML = schoolOver
      ? `<span class="tt-now-item">School's over for today.</span>`
      : `<span class="tt-now-item">No class right now</span>`;
    return;
  }

  if (isToday && !status.isSchoolDay) {
    bar.innerHTML = `<span class="tt-now-item">No school today</span>`;
    return;
  }

  bar.innerHTML = `<span class="tt-now-item">Viewing ${relativeDayLabel(selectedDay)}</span>`;
}

// ------------------------------------------------
// Homework dots — date-aware
// ------------------------------------------------
// Convert a day key ("mon" … "fri") to a YYYY-MM-DD string for the
// CURRENT calendar week (relative to today). Used to compare against
// each homework item's dueDate.
function dateForDay(day) {
  const today = new Date();
  const todayDow = today.getDay(); // 0 = Sun
  const targetDow = DAY_ORDER.indexOf(day) + 1; // Mon=1 … Fri=5
  const offset = targetDow - todayDow;
  const target = new Date(today);
  target.setDate(today.getDate() + offset);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

// A period gets a dot only if homework for its subject is due on or
// before that day — i.e. the class period we're looking at is the one
// that actually needs it. Homework due tomorrow does NOT dot today's
// period (that was V9's bug).
function homeworkAppliesToDay(hw, day) {
  if (!hw.dueDate) return false;
  return hw.dueDate <= dateForDay(day);
}

function applyHomeworkDots() {
  if (!homeworkReady) return;
  document.querySelectorAll(".tt-cell").forEach((cell) => {
    const day = cell.dataset.day;
    const subject = cell.dataset.subject;
    if (!day || !subject) return;
    const pending = getHomeworkForSubject(subject);
    const applies = pending.some((hw) => homeworkAppliesToDay(hw, day));
    cell.classList.toggle("tt-cell-has-homework", applies);
  });
}

// ------------------------------------------------
// Detail panel — homework rows are links to Today
// ------------------------------------------------
function renderDetailPanel(subject, full, dayLabel) {
  const panel = $("ttDetailPanel");
  if (!panel) return;
  if (!subject) {
    panel.innerHTML = `<p class="tt-detail-hint">Tap any period for its full name and linked homework.</p>`;
    return;
  }

  const homework = homeworkReady ? getHomeworkForSubject(subject) : [];
  panel.innerHTML = `
    <p class="tt-detail-subject">${full}${dayLabel ? " · " + dayLabel : ""}</p>
    ${
      homework.length
        ? homework
            .map(
              (h) =>
                `<a class="tt-detail-hw" href="index.html#today">Homework: ${h.title}<span class="tt-detail-due">Due ${h.dueDate}</span></a>`
            )
            .join("")
        : `<p class="tt-detail-hw tt-detail-hw-none">No homework linked to this subject right now.</p>`
    }
  `;
}

function renderDay() {
  clearHighlights();

  document.querySelectorAll(`.tt-cell[data-day="${selectedDay}"]`).forEach((cell) => {
    cell.classList.add("tt-row-selected");
  });

  const status = getLiveStatus();
  if (selectedDay === status.dayKey && status.isSchoolDay) {
    if (status.current) {
      document
        .querySelectorAll(`.tt-cell[data-day="${selectedDay}"][data-period="${status.current.period}"]`)
        .forEach((cell) => cell.classList.add("tt-cell-current"));
    }
    if (status.next) {
      document
        .querySelectorAll(`.tt-cell[data-day="${selectedDay}"][data-period="${status.next.period}"]`)
        .forEach((cell) => cell.classList.add("tt-cell-next"));
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
  if (!grid) return; // not the timetable page

  selectedDay = defaultDay();
  renderDay();
  renderDetailPanel(null);

  const prevBtn = $("ttPrevDay");
  const nextBtn = $("ttNextDay");
  if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => step(1));

  const todayBtn = $("ttTodayBtn");
  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      selectedDay = defaultDay();
      renderDay();
      renderDetailPanel(null);
    });
  }

  // Clicking any cell shows that cell's own day in the header — not
  // whatever day happens to be "selected" — so the panel never lies.
  grid.querySelectorAll(".tt-cell[data-subject]").forEach((cell) => {
    cell.addEventListener("click", () => {
      renderDetailPanel(
        cell.dataset.subject,
        cell.dataset.full || cell.dataset.subject,
        DAY_LABEL[cell.dataset.day]
      );
    });
  });

  onAssignments(() => {
    homeworkReady = true;
    applyHomeworkDots();
  });

  // Keep "time remaining" honest without a full re-render loop.
  setInterval(() => {
    renderStatusBar();
    if (selectedDay === todayKey()) renderDay();
  }, 60000);
}
