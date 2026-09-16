// ============================================
// 8CM — Announcements on the timetable
// ------------------------------------------------
// Renders a list of active announcements under the timetable grid,
// and marks up any day-row whose date matches an announcement's
// date so it can be highlighted. Clicking a highlighted row label
// pushes that day's announcements into the shared detail panel.
//
// Deliberately separate from homework dots — announcements aren't
// per-period, they're per-day, so mixing them into the grid would
// misrepresent them. This just adds an extra visual layer.
// ============================================
import { onAnnouncements, activeAnnouncements } from "./announcements.js";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri"];
const DAY_DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };

const $ = (id) => document.getElementById(id);

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateForDay(day) {
  const targetDow = DAY_DOW[day];
  if (targetDow === undefined) return null;
  const t = new Date();
  const diff = targetDow - t.getDay();
  t.setDate(t.getDate() + diff);
  return ymd(t);
}

function announcementDate(a) {
  if (a.date) return a.date;
  if (a.createdAtMs) return ymd(new Date(a.createdAtMs));
  return null;
}

function announcementsForDay(day) {
  const target = dateForDay(day);
  if (!target) return [];
  return activeAnnouncements().filter((a) => announcementDate(a) === target);
}

function renderDayHighlights() {
  document.querySelectorAll(".tt-day-label[data-day]").forEach((cell) => {
    const day = cell.dataset.day;
    const has = announcementsForDay(day).length > 0;
    cell.classList.toggle("tt-day-has-announcement", has);
  });
}

function renderAnnouncementList() {
  const list = $("timetableAnnouncementList");
  if (!list) return;

  const all = activeAnnouncements();
  if (all.length === 0) {
    list.innerHTML = `<p class="tt-ann-empty">No announcements right now.</p>`;
    return;
  }

  const sorted = [...all].sort((a, b) => {
    const da = announcementDate(a) || "";
    const db = announcementDate(b) || "";
    return db.localeCompare(da);
  });

  list.innerHTML = "";
  sorted.forEach((a) => {
    const dateStr = announcementDate(a);
    const dayKey = dateStr ? dayKeyForDate(dateStr) : null;
    const dayLabel = dayKey ? DAY_LABEL[dayKey] : dateStr || "";
    const row = document.createElement("div");
    row.className = `tt-ann-row${a.priority === "important" ? " is-important" : ""}`;
    row.innerHTML = `
      <div class="tt-ann-head">
        ${a.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : ""}
        <span class="task-tag announcement">${a.category || "General"}</span>
        ${dayLabel ? `<span class="tt-ann-day">${dayLabel}</span>` : ""}
      </div>
      <p class="tt-ann-title">${a.title}</p>
      <p class="tt-ann-body">${a.content}</p>
    `;
    list.appendChild(row);
  });
}

function dayKeyForDate(dateStr) {
  for (const day of DAY_ORDER) {
    if (dateForDay(day) === dateStr) return day;
  }
  return null;
}

export { announcementsForDay, DAY_LABEL };

export function initTimetableAnnouncements() {
  const host = $("timetableAnnouncementList");
  const grid = document.querySelector(".tt-grid");
  if (!host || !grid) return;

  onAnnouncements(() => {
    renderDayHighlights();
    renderAnnouncementList();
  });

  grid.querySelectorAll(".tt-day-label[data-day]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const day = cell.dataset.day;
      const anns = announcementsForDay(day);
      if (anns.length === 0) return;
      const panel = $("ttDetailPanel");
      if (!panel) return;
      panel.innerHTML = `
        <p class="tt-detail-subject">${DAY_LABEL[day]}</p>
        ${anns
          .map(
            (a) => `
          <div class="tt-detail-ann${a.priority === "important" ? " is-important" : ""}">
            ${a.pinned ? `<span class="pin-badge">📌</span>` : ""}
            <span class="task-tag announcement">${a.category || "General"}</span>
            <span class="tt-detail-ann-title">${a.title}</span>
            <span class="tt-detail-ann-body">${a.content}</span>
          </div>`
          )
          .join("")}
      `;
    });
  });
}
