import { getStudentsSync, onStudents, rollText } from "./students.js";
import { subscribeAuth } from "./auth.js";
import { getLiveStatus } from "./timetable-data.js";
import { onAssignments, getUpcomingForMe, dueBucket } from "./assignments.js";
import { onAnnouncements, pinnedAnnouncement } from "./notices.js";
import { onEvents, nextEvent, daysUntil } from "./events.js";

const $ = (id) => document.getElementById(id);
const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
const escapeHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
const firstName = (name) => (name || "").split(" ")[0] || "there";

function renderClassStatus() {
  const el = $("myDayClass");
  if (!el) return;
  const status = getLiveStatus();
  if (!status.isSchoolDay) {
    el.innerHTML = `<p class="my-day-class-line">No school today.</p>`;
    return;
  }
  const parts = [];
  parts.push(status.current
    ? `<span><strong>Now:</strong> ${escapeHtml(status.current.full)} — ${status.minutesLeftInCurrent}m left</span>`
    : `<span>No class right now</span>`
  );
  if (status.next) parts.push(`<span><strong>Next:</strong> ${escapeHtml(status.next.full)}</span>`);
  el.innerHTML = `<p class="my-day-class-line">${parts.join(" · ")}</p>`;
}

function renderTeasers() {
  const el = $("myDayTeasers");
  if (!el) return;
  const homework = getUpcomingForMe(1)[0];
  const announcement = pinnedAnnouncement();
  const event = nextEvent();
  const items = [];
  if (homework) {
    const bucket = dueBucket(homework);
    items.push(`<a class="my-day-teaser" href="#today"><span class="my-day-teaser-label">Homework</span><span class="my-day-teaser-body ${bucket === "overdue" ? "is-overdue" : ""}">${escapeHtml(homework.subject)}: ${escapeHtml(homework.title)}</span></a>`);
  }
  if (announcement) items.push(`<a class="my-day-teaser" href="#today"><span class="my-day-teaser-label">Announcement</span><span class="my-day-teaser-body">${escapeHtml(announcement.title)}</span></a>`);
  if (event) {
    const diff = daysUntil(event.date);
    const when = diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff}d`;
    items.push(`<a class="my-day-teaser" href="#events"><span class="my-day-teaser-label">Next event</span><span class="my-day-teaser-body">${escapeHtml(event.title)} — ${when}</span></a>`);
  }
  el.innerHTML = items.length ? items.join("") : `<p class="my-day-teaser-empty">Nothing new right now.</p>`;
}

let latestStudent = null;
function renderHeader() {
  const card = $("myDayCard"), greeting = $("myDayGreeting"), stats = $("myDayStats");
  if (!card || !greeting || !stats) return;
  if (!latestStudent) { card.hidden = true; return; }
  card.hidden = false;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  greeting.textContent = `${greetingWord()}, ${firstName(latestStudent.name)} — ${today}`;
  const house = escapeHtml(latestStudent.house);
  stats.innerHTML = `<span class="profile-stat-pill">${latestStudent.guest ? "Guest " : "Roll #"}${escapeHtml(rollText(latestStudent))}</span><span class="profile-stat-pill house-${house}"><span class="house-dot ${house}"></span>${escapeHtml(houseLabel(latestStudent.house))}</span>`;
}

export function initDashboard() {
  if (!$("myDayCard")) return;
  let claimedStudentId = null;
  const pickStudent = () => {
    latestStudent = claimedStudentId ? getStudentsSync().find((s) => s.id === claimedStudentId) || null : null;
    renderHeader();
  };
  subscribeAuth(({ profile }) => {
    claimedStudentId = profile?.claimedStudentId || null;
    pickStudent();
  });
  onStudents(() => pickStudent());
  renderClassStatus();
  setInterval(renderClassStatus, 60000);
  onAssignments(() => renderTeasers());
  onAnnouncements(() => renderTeasers());
  onEvents(() => renderTeasers());
}
