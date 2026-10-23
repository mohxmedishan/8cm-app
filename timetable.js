// Timetable — rendered from timetable-data.js (the single source of truth), so there is no
// hand-written grid to keep in sync. Read-only: no day arrows, no popups, no announcements.
import { SCHEDULE, getDaySchedule, getLiveStatus, describeDay, describeNow, fmtShort, DAY_NAMES } from "./timetable-data.js";
import { esc } from "./util.js";

const DAYS = ["mon", "tue", "wed", "thu", "fri"];
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");   // "MSCS 1" -> "mscs1"

// Row order comes from Monday (the longest day); every day uses the same period keys.
const ROWS = SCHEDULE.mon.map((p) => p.period);
const rowNo = (period) => ROWS.indexOf(period) + 2;                      // grid row 1 is the day header

const bySubject = new Map();                                              // legend: one entry per subject
for (const d of DAYS) for (const p of SCHEDULE[d]) {
  if (p.category !== "break" && !bySubject.has(key(p.subject))) bySubject.set(key(p.subject), p);
}

// Contiguous runs of day columns, e.g. [mon,tue,wed,thu] for the second break.
function runs(days) {
  const out = [];
  for (const d of days) {
    const i = DAYS.indexOf(d), last = out[out.length - 1];
    if (last && DAYS.indexOf(last[last.length - 1]) === i - 1) last.push(d); else out.push([d]);
  }
  return out;
}

function build() {
  const sched = Object.fromEntries(DAYS.map((d) => [d, getDaySchedule(d)]));
  const monTimes = Object.fromEntries(sched.mon.map((p) => [p.period, p.start]));
  const firstCol = (d) => DAYS.indexOf(d) + 2;                            // grid col 1 is the time column
  const cells = [];

  // Header row
  cells.push(`<div class="tt-corner" style="grid-row:1;grid-column:1"></div>`);
  DAYS.forEach((d) => cells.push(
    `<div class="tt-dayhead" data-day="${d}" style="grid-row:1;grid-column:${firstCol(d)}">` +
    `<span class="long">${DAY_NAMES[d]}</span><span class="short">${DAY_NAMES[d].slice(0, 3)}</span></div>`));

  // Time column
  SCHEDULE.mon.forEach((p) => {
    const isBreak = p.category === "break";
    const fri = sched.fri.find((x) => x.period === p.period);
    const friDiffers = fri && fri.start !== monTimes[p.period];
    cells.push(
      `<div class="tt-time${isBreak ? " is-break" : ""}" style="grid-row:${rowNo(p.period)};grid-column:1">` +
      `<b>${isBreak ? "Break" : "P" + p.period.slice(1)}</b><span>${fmtShort(monTimes[p.period])}</span>` +
      (friDiffers ? `<span class="fri">Fri ${fmtShort(fri.start)}</span>` : "") + `</div>`);
  });

  // Subject cells
  for (const d of DAYS) for (const p of sched[d]) {
    if (p.category === "break") continue;
    const showFull = key(p.full) !== key(p.subject);
    cells.push(
      `<div class="tt-cell s-${key(p.subject)}" data-day="${d}" data-period="${p.period}" style="grid-row:${rowNo(p.period)};grid-column:${firstCol(d)}">` +
      `<span class="subj">${esc(p.subject)}</span>${showFull ? `<span class="full">${esc(p.full)}</span>` : ""}</div>`);
  }

  // Breaks: one cell across every consecutive day that has that break
  for (const brk of SCHEDULE.mon.filter((p) => p.category === "break")) {
    const days = DAYS.filter((d) => sched[d].some((p) => p.period === brk.period));
    for (const run of runs(days)) {
      const a = firstCol(run[0]), b = firstCol(run[run.length - 1]) + 1;
      cells.push(`<div class="tt-break" data-period="${brk.period}" data-days="${run.join(" ")}" style="grid-row:${rowNo(brk.period)};grid-column:${a} / ${b}">Break</div>`);
    }
  }

  // Short days: one "School ends" cell over the rows a day doesn't have
  for (const d of DAYS) {
    const have = new Set(sched[d].map((p) => p.period));
    const missing = ROWS.filter((r) => !have.has(r));
    if (!missing.length) continue;
    const end = sched[d][sched[d].length - 1].end;
    cells.push(`<div class="tt-tail" data-day="${d}" style="grid-row:${rowNo(missing[0])} / ${rowNo(missing[missing.length - 1]) + 1};grid-column:${firstCol(d)}">` +
      `<span>School ends<br><b>${fmtShort(end)}</b></span></div>`);
  }
  return cells.join("");
}

function legend() {
  return [...bySubject.entries()].map(([k, p]) =>
    `<li><span class="swatch s-${k}" aria-hidden="true"></span>${esc(p.subject)}${key(p.full) !== k ? ` <span class="muted">· ${esc(p.full)}</span>` : ""}</li>`).join("");
}

export function renderTimetable(mount) {
  mount.innerHTML = `
    <div class="tt-status" aria-live="polite">
      <div class="tt-chip" id="ttDay"><span class="tt-chip-label">Today</span><strong></strong><span class="tt-chip-note"></span></div>
      <div class="tt-chip" id="ttNow"><span class="tt-chip-label">Right now</span><strong></strong><span class="tt-chip-note"></span></div>
    </div>
    <div class="tt-grid" role="table" aria-label="Weekly timetable">${build()}</div>
    <ul class="tt-legend" aria-label="Subject colours">${legend()}</ul>`;

  const set = (id, title, note) => {
    const el = mount.querySelector(id);
    el.querySelector("strong").textContent = title;
    el.querySelector(".tt-chip-note").textContent = note;
  };

  function update() {
    const now = new Date(), day = describeDay(now), cur = describeNow(now), live = getLiveStatus(now);
    set("#ttDay", `${day.name} · ${day.type}`, day.detail);
    set("#ttNow", cur.title, cur.note);
    mount.querySelector("#ttNow").dataset.kind = cur.kind;

    mount.querySelectorAll(".is-today, .is-now").forEach((el) => { el.classList.remove("is-today", "is-now"); el.removeAttribute("aria-current"); });
    if (!live.isSchoolDay) return;
    mount.querySelectorAll(`[data-day="${live.dayKey}"]`).forEach((el) => el.classList.add("is-today"));
    if (live.current) {
      const hit = live.current.category === "break"
        ? [...mount.querySelectorAll(`.tt-break[data-period="${live.current.period}"]`)].find((el) => el.dataset.days.split(" ").includes(live.dayKey))
        : mount.querySelector(`.tt-cell[data-day="${live.dayKey}"][data-period="${live.current.period}"]`);
      if (hit) { hit.classList.add("is-now"); hit.setAttribute("aria-current", "time"); }
    }
  }
  update();
  setInterval(update, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) update(); });
}
