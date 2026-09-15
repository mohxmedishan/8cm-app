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

function renderStatusBar() {
  const bar = $("ttNowBar");
  if (!bar) return;

  const status = getLiveStatus();
  const isToday = selectedDay === status.dayKey;

  let html = "";
  if (isToday && status.isSchoolDay) {
    if (status.current) {
      html += `<span class="tt-now-item"><strong>Now:</strong> ${status.current.full} — ${status.minutesLeftInCurrent}m left</span>`;
    } else {
      html += `<span class="tt-now-item">No class right now</span>`;
    }
    if (status.next) {
      html += `<span class="tt-now-item"><strong>Next:</strong> ${status.next.full} at ${minutesToClock(status.next.start)}</span>`;
    } else if (status.current) {
      html += `<span class="tt-now-item">Last period of the day</span>`;
    }
  } else if (isToday && !status.isSchoolDay) {
    html = `<span class="tt-now-item">No school today</span>`;
  } else {
    html = `<span class="tt-now-item">Viewing ${DAY_LABEL[selectedDay]}</span>`;
  }
  bar.innerHTML = html;
}

function renderDetailPanel(subject, full) {
  const panel = $("ttDetailPanel");
  if (!panel) return;
  if (!subject) {
    panel.innerHTML = `<p class="tt-detail-hint">Tap any period for its full name and linked homework.</p>`;
    return;
  }

  const homework = homeworkReady ? getHomeworkForSubject(subject) : [];
  panel.innerHTML = `
    <p class="tt-detail-subject">${full}</p>
    ${
      homework.length
        ? homework
            .map(
              (h) => `<p class="tt-detail-hw">Homework: ${h.title} <span class="tt-detail-due">Due ${h.dueDate}</span></p>`
            )
            .join("")
        : `<p class="tt-detail-hw tt-detail-hw-none">No homework linked to this subject right now.</p>`
    }
  `;
}

function applyHomeworkDots() {
  if (!homeworkReady) return;
  document.querySelectorAll(`.tt-cell[data-day="${selectedDay}"]`).forEach((cell) => {
    const subject = cell.dataset.subject;
    if (!subject) return;
    const hasHomework = getHomeworkForSubject(subject).length > 0;
    cell.classList.toggle("tt-cell-has-homework", hasHomework);
  });
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
  if (label) label.textContent = DAY_LABEL[selectedDay];
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

  grid.querySelectorAll(".tt-cell[data-subject]").forEach((cell) => {
    cell.addEventListener("click", () => {
      renderDetailPanel(cell.dataset.subject, cell.dataset.full || cell.dataset.subject);
    });
  });

  // Live data from assignments.js's shared cache — see module comment.
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
