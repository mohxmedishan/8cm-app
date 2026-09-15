import { getStudentsSync, onStudents } from "./students.js";
import { subscribeAuth } from "./auth.js";
import { getLiveStatus } from "./timetable-data.js";
import { onAssignments, getUpcomingForMe, dueBucket } from "./assignments.js";
import { onAnnouncements, pinnedAnnouncement } from "./announcements.js";
import { onEvents, nextEvent, daysUntil } from "./events.js";

const $ = (id) => document.getElementById(id);

const houseLabel = (h) => h.charAt(0).toUpperCase() + h.slice(1);
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
el.innerHTML = <p class="my-day-class-line">No school today.</p>;
return;
}
const parts = [];
parts.push(
status.current
? <span><strong>Now:</strong> ${status.current.full} — ${status.minutesLeftInCurrent}m left</span>
: <span>No class right now</span>
);
if (status.next) parts.push(<span><strong>Next:</strong> ${status.next.full}</span>);
el.innerHTML = <p class="my-day-class-line">${parts.join(" · ")}</p>;
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
items.push(
<a class="my-day-teaser" href="#today"><span class="my-day-teaser-label">Homework</span><span class="my-day-teaser-body ${bucket === "overdue" ? "is-overdue" : ""}">${homework.subject}: ${homework.title}</span></a>
);
}
if (announcement) {
items.push(
<a class="my-day-teaser" href="#today"><span class="my-day-teaser-label">Announcement</span><span class="my-day-teaser-body">${announcement.title}</span></a>
);
}
if (event) {
const diff = daysUntil(event.date);
const when = diff === 0 ? "today" : diff === 1 ? "tomorrow" : in ${diff}d;
items.push(
<a class="my-day-teaser" href="events.html"><span class="my-day-teaser-label">Next event</span><span class="my-day-teaser-body">${event.title} — ${when}</span></a>
);
}
el.innerHTML = items.length ? items.join("") : <p class="my-day-teaser-empty">Nothing new right now.</p>;
}

let latestStudent = null;

function renderHeader() {
const card = $("myDayCard");
const greeting = $("myDayGreeting");
const stats = $("myDayStats");
if (!card || !greeting || !stats) return;
if (!latestStudent) { card.hidden = true; return; }

card.hidden = false;
const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
greeting.textContent = ${greetingWord()}, ${firstName(latestStudent.name)} — ${today};
stats.innerHTML = <span class="profile-stat-pill">Roll #${latestStudent.rollNumber}</span> <span class="profile-stat-pill house-${latestStudent.house}"><span class="house-dot ${latestStudent.house}"></span>${houseLabel(latestStudent.house)}</span> ;
}

export function initDashboard() {
if (!$("myDayCard")) return;

let claimedStudentId = null;

function pickStudent() {
latestStudent = claimedStudentId
? getStudentsSync().find((s) => s.id === claimedStudentId) || null
: null;
renderHeader();
}

subscribeAuth(({ profile }) => {
claimedStudentId = profile && profile.claimedStudentId ? profile.claimedStudentId : null;
pickStudent();
});

// Re-pick on student list updates (name/roll edits made by a monitor).
onStudents(() => pickStudent());

renderClassStatus();
setInterval(renderClassStatus, 60000);

onAssignments(() => renderTeasers());
onAnnouncements(() => renderTeasers());
onEvents(() => renderTeasers());}
