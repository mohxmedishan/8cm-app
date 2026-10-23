// ============================================
// 8CM — Timetable schedule data
// ------------------------------------------------
// The single source of truth for what period is what subject, and
// when each period starts/ends. This mirrors the static grid in
// timetable.html exactly (same subjects, same order) — it exists so
// timetable-live.js (current/next class, day highlighting) and the
// dashboard's "My Day" card can both compute against real times
// without parsing the DOM or duplicating the schedule.
//
// Times are minutes since midnight, in the school's local time (the
// device's local time — there's no timezone handling here because
// everyone using this is physically at the same school).
// ============================================

const MON_THU_PERIOD_LENGTH = 40;
const FRI_PERIOD_LENGTH = 35;

function toMinutes(hh, mm) {
  return hh * 60 + mm;
}

// Monday–Thursday period start times (from the tt-head-time values in
// timetable.html). P6 onward has no listed break beforehand other
// than the two named breaks.
const MON_THU_STARTS = {
  p1: toMinutes(8, 0),
  p2: toMinutes(8, 40),
  br1: toMinutes(9, 20),
  p3: toMinutes(9, 35),
  p4: toMinutes(10, 15),
  p5: toMinutes(10, 55),
  p6: toMinutes(11, 35),
  p7: toMinutes(12, 15),
  br2: toMinutes(12, 55),
  p8: toMinutes(13, 15),
  p9: toMinutes(13, 55),
};
const MON_THU_END = toMinutes(14, 35);

const FRI_STARTS = {
  p1: toMinutes(8, 0),
  p2: toMinutes(8, 35),
  br1: toMinutes(9, 10),
  p3: toMinutes(9, 25),
  p4: toMinutes(10, 0),
  p5: toMinutes(10, 35),
};
const FRI_END = toMinutes(11, 10);

// subject: short label as shown in the grid. full: expanded name (the
// existing `title` attribute text) for the info bar / homework match.
// category: matches the cat-* classes already in style.css.
export const SCHEDULE = {
  mon: [
    { period: "p1", subject: "Math", full: "Math", category: "math" },
    { period: "p2", subject: "Phys", full: "Physics", category: "science" },
    { period: "br1", subject: "Break", full: "Break", category: "break" },
    { period: "p3", subject: "Lib", full: "Library", category: "other" },
    { period: "p4", subject: "Math", full: "Math", category: "math" },
    { period: "p5", subject: "Eng", full: "English", category: "language" },
    { period: "p6", subject: "Arts", full: "Creative arts", category: "creative" },
    { period: "p7", subject: "L2", full: "Second language", category: "language" },
    { period: "br2", subject: "Break", full: "Break", category: "break" },
    { period: "p8", subject: "SST", full: "Social studies", category: "other" },
    { period: "p9", subject: "CS", full: "Computer science", category: "science" },
  ],
  tue: [
    { period: "p1", subject: "Arabic", full: "Arabic", category: "language" },
    { period: "p2", subject: "Eng", full: "English", category: "language" },
    { period: "br1", subject: "Break", full: "Break", category: "break" },
    { period: "p3", subject: "AI", full: "Artificial intelligence", category: "science" },
    { period: "p4", subject: "L2", full: "Second language", category: "language" },
    { period: "p5", subject: "Eng", full: "English", category: "language" },
    { period: "p6", subject: "Chem", full: "Chemistry", category: "science" },
    { period: "p7", subject: "Phys", full: "Physics", category: "science" },
    { period: "br2", subject: "Break", full: "Break", category: "break" },
    { period: "p8", subject: "MSCS1", full: "MSCS 1", category: "science" },
    { period: "p9", subject: "Math", full: "Math", category: "math" },
  ],
  wed: [
    { period: "p1", subject: "Math", full: "Math", category: "math" },
    { period: "p2", subject: "L2", full: "Second language", category: "language" },
    { period: "br1", subject: "Break", full: "Break", category: "break" },
    { period: "p3", subject: "Arabic", full: "Arabic", category: "language" },
    { period: "p4", subject: "Chem", full: "Chemistry", category: "science" },
    { period: "p5", subject: "Bio", full: "Biology", category: "science" },
    { period: "p6", subject: "IVE", full: "Islamic and value education", category: "other" },
    { period: "p7", subject: "SST", full: "Social studies", category: "other" },
    { period: "br2", subject: "Break", full: "Break", category: "break" },
    { period: "p8", subject: "Eng", full: "English", category: "language" },
    { period: "p9", subject: "L2", full: "Second language", category: "language" },
  ],
  thu: [
    { period: "p1", subject: "Bio", full: "Biology", category: "science" },
    { period: "p2", subject: "Eng", full: "English", category: "language" },
    { period: "br1", subject: "Break", full: "Break", category: "break" },
    { period: "p3", subject: "IVE", full: "Islamic and value education", category: "other" },
    { period: "p4", subject: "Math", full: "Math", category: "math" },
    { period: "p5", subject: "SST", full: "Social studies", category: "other" },
    { period: "p6", subject: "MSCS2", full: "MSCS 2", category: "science" },
    { period: "p7", subject: "Arabic", full: "Arabic", category: "language" },
    { period: "br2", subject: "Break", full: "Break", category: "break" },
    { period: "p8", subject: "Math", full: "Math", category: "math" },
    { period: "p9", subject: "L2", full: "Second language", category: "language" },
  ],
  fri: [
    { period: "p1", subject: "Arabic", full: "Arabic", category: "language" },
    { period: "p2", subject: "SST", full: "Social studies", category: "other" },
    { period: "br1", subject: "Break", full: "Break", category: "break" },
    { period: "p3", subject: "PE", full: "Physical education", category: "other" },
    { period: "p4", subject: "Math", full: "Math", category: "math" },
    { period: "p5", subject: "Chem", full: "Chemistry", category: "science" },
  ],
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function todayKey(date = new Date()) {
  return DAY_KEYS[date.getDay()];
}

export function isSchoolDay(dayKey) {
  return Object.prototype.hasOwnProperty.call(SCHEDULE, dayKey);
}

// The real calendar date (YYYY-MM-DD) that a Mon–Fri day key stands for
// right now. Monday–Friday map onto the current week; on Saturday and
// Sunday the grid is showing the coming week (there's no weekend row),
// so they map onto the Monday–Friday that's about to start. Shared by
// the timetable's homework dots, its day label and its announcements so
// they can never disagree about which date a row means.
const WEEKDAY_NUMBER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
export function dateForDayKey(dayKey, now = new Date()) {
  const dow = WEEKDAY_NUMBER[dayKey];
  if (dow === undefined) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = d.getDay(); // 0 = Sunday … 6 = Saturday
  const toMonday = today === 0 ? 1 : today === 6 ? 2 : 1 - today;
  d.setDate(d.getDate() + toMonday + (dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Returns the same period list, but each entry stamped with its
// absolute start/end (minutes since midnight) and length, so callers
// don't need to know Mon–Thu vs Friday timing rules themselves.
export function getDaySchedule(dayKey) {
  if (!isSchoolDay(dayKey)) return [];
  const isFriday = dayKey === "fri";
  const starts = isFriday ? FRI_STARTS : MON_THU_STARTS;
  const dayEnd = isFriday ? FRI_END : MON_THU_END;
  const length = isFriday ? FRI_PERIOD_LENGTH : MON_THU_PERIOD_LENGTH;
  const periods = SCHEDULE[dayKey];

  return periods.map((p, i) => {
    const start = starts[p.period];
    const next = periods[i + 1];
    const end = next ? starts[next.period] : dayEnd;
    return { ...p, start, end, length: end - start };
  });
}

function nowMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// The main entry point for "what's happening right now": returns
// { dayKey, isSchoolDay, current, next, minutesUntilNext, minutesLeftInCurrent }
// `current`/`next` are period entries from getDaySchedule (or null —
// e.g. `current` is null before school starts or during a day with no
// school; `next` is null after the last period of the day/week).
export function getLiveStatus(date = new Date()) {
  const dayKey = todayKey(date);
  if (!isSchoolDay(dayKey)) {
    return { dayKey, isSchoolDay: false, current: null, next: null, minutesUntilNext: null, minutesLeftInCurrent: null };
  }

  const schedule = getDaySchedule(dayKey);
  const nowMin = nowMinutes(date);

  let current = null;
  let next = null;
  for (let i = 0; i < schedule.length; i++) {
    const p = schedule[i];
    if (nowMin >= p.start && nowMin < p.end) {
      current = p;
      next = schedule[i + 1] || null;
      break;
    }
    if (nowMin < p.start) {
      next = p;
      break;
    }
  }

  return {
    dayKey,
    isSchoolDay: true,
    current,
    next,
    minutesUntilNext: next ? next.start - nowMin : null,
    minutesLeftInCurrent: current ? current.end - nowMin : null,
  };
}

// All non-break subjects that appear anywhere in the week, for
// populating homework-subject dropdowns with names that actually
// match the timetable (so "Homework linked to timetable" works by
// exact string match, not guesswork).
export function allSubjects() {
  const set = new Set();
  Object.values(SCHEDULE).forEach((day) => {
    day.forEach((p) => {
      if (p.category !== "break") set.add(p.subject);
    });
  });
  return [...set].sort();
}


// ------------------------------------------------
// Shared display helpers (Home "Right now" + Timetable status strip)
// ------------------------------------------------
export const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

// 8:05 AM style
export function fmtClock(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
// 8:05 style (no AM/PM) for compact table headers
export function fmtShort(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

const periodNo = (p) => parseInt(String(p.period).slice(1), 10);
const periodName = (p) => (p.category === "break" ? "Break" : `P${periodNo(p)} ${p.full}`);

// Which kind of day is it, for the "day" indicator.
export function describeDay(now = new Date()) {
  const key = todayKey(now);
  if (!isSchoolDay(key)) {
    const first = getDaySchedule("mon")[0];
    return { key, name: DAY_NAMES[key], school: false, type: "Weekend", detail: `School resumes Monday at ${fmtClock(first.start)}` };
  }
  const sched = getDaySchedule(key);
  const start = sched[0].start, end = sched[sched.length - 1].end;
  return {
    key, name: DAY_NAMES[key], school: true,
    type: key === "fri" ? "Short day" : "Normal day",
    detail: `${fmtClock(start)} – ${fmtClock(end)}`,
  };
}

// What is happening right now, as display text.
export function describeNow(now = new Date()) {
  const s = getLiveStatus(now);
  if (!s.isSchoolDay) {
    const first = getDaySchedule("mon")[0];
    return { kind: "weekend", title: "No school today", note: `Back Monday at ${fmtClock(first.start)}` };
  }
  if (s.current) {
    const c = s.current;
    const isBreak = c.category === "break";
    const left = `${s.minutesLeftInCurrent} min left`;
    return {
      kind: isBreak ? "break" : "class",
      title: isBreak ? "Break" : `Period ${periodNo(c)} · ${c.full}`,
      note: s.next ? `${left} · Next: ${periodName(s.next)}` : `${left} · Last period of the day`,
    };
  }
  if (s.next) return { kind: "before", title: "School hasn’t started", note: `First up: ${s.next.full} at ${fmtClock(s.next.start)}` };
  return { kind: "after", title: "School’s out for today", note: s.dayKey === "fri" ? "See you Monday" : "See you tomorrow" };
}
