// ============================================
// 8CM — Announcements on the timetable
// ------------------------------------------------
// Only announcements that have a date ("Date of event") show up here,
// and only when asked for:
//   · a day in the grid whose date matches an announcement's date is
//     highlighted (tinted, with a dot)
//   · tapping a highlighted day opens the Announcements section under
//     the grid with that day's announcements; tapping it again (or
//     tapping a day with nothing on it) closes it again
//   · nothing is listed by default, and undated announcements never
//     appear on the timetable
//
// Which date a row stands for comes from dateForDayKey() in
// timetable-data.js (this week Mon–Fri; on a weekend, the coming
// week), the same helper the day label and homework dots use.
//
// Deliberately separate from homework dots — announcements aren't
// per-period, they're per-day, so mixing them into the grid would
// misrepresent them. This just adds an extra visual layer.
// ============================================
import { onAnnouncements, activeAnnouncements } from "./notices.js";
import { dateForDayKey } from "./timetable-data.js";

const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $ = (id) => document.getElementById(id);
let openDay = null;

function escapeHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function prettyDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Announcements dated on the calendar day this row stands for.
function announcementsForDay(day) {
  const target = dateForDayKey(day);
  if (!target) return [];
  return activeAnnouncements().filter((a) => a.eventDate === target);
}

function dayCells() {
  return [...document.querySelectorAll(".tt-day-label[data-day]")];
}

// Highlights every day that has something on it, and keeps the
// open section in step with the data (it closes itself if the day
// it was showing no longer has any announcements).
function renderDayHighlights() {
  let any = false;
  dayCells().forEach((cell) => {
    const count = announcementsForDay(cell.dataset.day).length;
    const has = count > 0;
    any = any || has;
    cell.classList.toggle("tt-day-has-announcement", has);
    if (has) {
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("title", `${count} announcement${count === 1 ? "" : "s"} — tap to read`);
    } else {
      cell.removeAttribute("role");
      cell.removeAttribute("tabindex");
      cell.removeAttribute("title");
      cell.removeAttribute("aria-expanded");
    }
  });

  const legend = $("ttLegendAnn");
  if (legend) legend.hidden = !any;

  if (openDay && announcementsForDay(openDay).length === 0) closeSection();
  else if (openDay) renderSection(openDay);
}

function renderSection(day) {
  const list = $("timetableAnnouncementList");
  if (!list) return;

  const anns = announcementsForDay(day);
  const heading = $("ttAnnHeading");
  const sub = $("ttAnnSub");
  if (heading) heading.textContent = `Announcements · ${DAY_LABEL[day]}`;
  if (sub) sub.textContent = prettyDate(dateForDayKey(day));

  list.innerHTML = anns
    .map(
      (a) => `
      <div class="tt-ann-row${a.priority === "important" ? " is-important" : ""}">
        <div class="tt-ann-head">
          ${a.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : ""}
          <span class="task-tag announcement">${escapeHtml(a.category || "General")}</span>
        </div>
        <p class="tt-ann-title">${escapeHtml(a.title)}</p>
        <p class="tt-ann-body">${escapeHtml(a.content)}</p>
      </div>`
    )
    .join("");
}

function openSection(day) {
  openDay = day;
  renderSection(day);
  const section = $("ttAnnSection");
  if (section) {
    section.hidden = false;
    section.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  dayCells().forEach((cell) => {
    const isOpen = cell.dataset.day === day;
    cell.classList.toggle("tt-day-open", isOpen);
    if (cell.classList.contains("tt-day-has-announcement")) cell.setAttribute("aria-expanded", String(isOpen));
  });
}

function closeSection() {
  openDay = null;
  const section = $("ttAnnSection");
  if (section) section.hidden = true;
  dayCells().forEach((cell) => {
    cell.classList.remove("tt-day-open");
    if (cell.hasAttribute("aria-expanded")) cell.setAttribute("aria-expanded", "false");
  });
}

function onDayActivate(cell) {
  const day = cell.dataset.day;
  if (announcementsForDay(day).length === 0) {
    closeSection();
    return;
  }
  if (openDay === day) closeSection();
  else openSection(day);
}

export { announcementsForDay, DAY_LABEL };

export function initTimetableAnnouncements() {
  const host = $("timetableAnnouncementList");
  const grid = document.querySelector(".tt-grid");
  if (!host || !grid) return;

  onAnnouncements(renderDayHighlights);

  dayCells().forEach((cell) => {
    cell.addEventListener("click", () => onDayActivate(cell));
    cell.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && cell.classList.contains("tt-day-has-announcement")) {
        e.preventDefault();
        onDayActivate(cell);
      }
    });
  });
}
