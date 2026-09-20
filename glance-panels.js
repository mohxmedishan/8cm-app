// ============================================
// 8CM — Hero "glance" panels (V17.1)
// ------------------------------------------------
// Home and Archives each get a live panel in their hero. Every number
// in them comes from data already live elsewhere on the site — nothing
// is typed in.
//
//   Home      "This week"  — a Mon–Fri strip (today marked, dots for
//             homework due / events), a homework tile, a next-event
//             countdown tile, and the latest achievement.
//   Archives  "Archive snapshot" — students / teachers / photos /
//             materials counts, each a shortcut to its section.
//
// Markup lives in index.html / archives.html; styling in style.css
// (V17.1 section, ".glance-*"). Each initializer no-ops if its
// container isn't on the current page, and every data source is
// imported dynamically so one failing module can't blank the panel.
// See DESIGN.md → "Glance panel".
// ============================================

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());

// "2026-09-24" -> "Thu 24 Sep" (parsed as a LOCAL date, not UTC).
function shortDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ---------- small helpers ----------
function markReady(el) {
  if (el) el.classList.remove("is-loading");
}

// Counts an integer up to `value` (or straight to it when motion is
// reduced / the number hasn't changed). Remembers the last value so a
// live snapshot update animates from the old number, not from zero.
function setCount(el, value) {
  if (!el) return;
  const target = Number.isFinite(value) ? value : 0;
  const from = el.dataset.value === undefined ? 0 : Number(el.dataset.value);
  el.dataset.value = String(target);
  el.classList.remove("is-word");
  el.classList.toggle("is-empty", target === 0);
  markReady(el.closest(".glance-tile"));
  if (reduceMotion() || from === target) {
    el.textContent = String(target);
    return;
  }
  const t0 = performance.now();
  const dur = 650;
  const step = (now) => {
    if (el.dataset.value !== String(target)) return; // a newer value took over
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (target - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setWord(el, text, { empty = false } = {}) {
  if (!el) return;
  delete el.dataset.value;
  el.textContent = text;
  el.classList.add("is-word");
  el.classList.toggle("is-empty", empty);
  markReady(el.closest(".glance-tile"));
}

function setText(id, text, { empty = false } = {}) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-empty", empty);
  markReady(el.closest(".glance-tile, .glance-strip"));
}

// ============================================
// Home — "This week"
// ============================================
export function initHomeGlance() {
  const panel = $("homeGlance");
  if (!panel) return;
  panel.querySelectorAll(".glance-tile, .glance-strip").forEach((t) => t.classList.add("is-loading"));

  const now = new Date();
  const dow = now.getDay();
  const weekend = dow === 0 || dow === 6;
  setText("glanceKicker", weekend ? "Next week" : "This week");
  setText("glanceDate", now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }));

  let assignments = [];
  let assignmentsApi = null;
  let events = [];
  let dayDate = {}; // "mon" -> "2026-09-21"

  // The date each Mon–Fri chip stands for. Same rule as the timetable
  // (weekend => the coming week), so the two can't disagree.
  const computeDates = (dateForDayKey) => {
    ["mon", "tue", "wed", "thu", "fri"].forEach((k) => {
      dayDate[k] = dateForDayKey ? dateForDayKey(k, now) : null;
    });
  };
  const fallbackDateForDayKey = (key) => {
    const idx = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }[key];
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
    d.setDate(d.getDate() + toMonday + (idx - 1));
    return isoOf(d);
  };
  computeDates(fallbackDateForDayKey);

  function renderWeek() {
    const today = todayIso();
    panel.querySelectorAll(".glance-day").forEach((li) => {
      const iso = dayDate[li.dataset.day];
      if (!iso) return;
      const [y, m, d] = iso.split("-").map(Number);
      li.querySelector(".glance-day-num").textContent = String(d);
      li.classList.toggle("is-today", iso === today);
      li.classList.toggle("is-past", iso < today);

      const hw = assignmentsApi
        ? assignments.filter((a) => a.dueDate === iso && assignmentsApi.dueBucket(a) !== "completed").length
        : 0;
      const ev = events.filter((e) => e.date === iso).length;
      const dots = li.querySelector(".glance-day-dots");
      dots.innerHTML = `${hw ? '<i class="glance-dot glance-dot-hw"></i>' : ""}${ev ? '<i class="glance-dot glance-dot-ev"></i>' : ""}`;

      const bits = [new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })];
      if (iso === today) bits.push("today");
      if (hw) bits.push(`${hw} homework due`);
      if (ev) bits.push(`${ev} event${ev === 1 ? "" : "s"}`);
      li.setAttribute("aria-label", bits.join(", "));
      if (iso === today) li.setAttribute("aria-current", "date");
      else li.removeAttribute("aria-current");
    });
  }

  import("./timetable-data.js")
    .then((m) => {
      if (m.dateForDayKey) { computeDates(m.dateForDayKey); renderWeek(); }
    })
    .catch(() => {});
  renderWeek();

  // ---- Homework ----
  import("./assignments.js")
    .then((m) => {
      assignmentsApi = m;
      m.onAssignments((list) => {
        assignments = list || [];
        const open = assignments.filter((a) => m.dueBucket(a) !== "completed");
        const overdue = open.filter((a) => m.dueBucket(a) === "overdue").length;
        const soon = open.filter((a) => m.dueBucket(a) === "due-soon").length;
        const tile = $("glanceHomeworkTile");
        if (tile) tile.dataset.state = overdue ? "alert" : soon ? "warn" : "";
        setCount($("glanceHomework"), open.length);
                if (!open.length) setText("glanceHomeworkNote", "All clear — nothing due", { empty: true });
        else if (overdue) setText("glanceHomeworkNote", `${overdue} overdue`);
        else if (soon) setText("glanceHomeworkNote", `${soon} due in the next 3 days`);
        else setText("glanceHomeworkNote", "Nothing due soon");
        renderWeek();
      });
    })
    .catch(() => {
      setWord($("glanceHomework"), "–", { empty: true });
      setText("glanceHomeworkNote", "Unavailable right now", { empty: true });
    });

  // ---- Next event ----
  import("./events.js")
    .then((m) => {
      m.onEvents((upcoming) => {
        events = upcoming || [];
        const next = m.nextEvent();
        const num = $("glanceEventNum");
        if (!next) {
          setWord(num, "–", { empty: true });
          setText("glanceEventLabel", "No events yet");
          setText("glanceEvent", "Nothing on the calendar", { empty: true });
        } else {
          const days = m.daysUntil(next.date);
          if (days <= 0) setWord(num, "Today");
          else if (days === 1) setWord(num, "Tomorrow");
          else setCount(num, days);
          setText("glanceEventLabel", days > 1 ? "Days to go" : "Next event");
          setText("glanceEvent", `${next.title} · ${shortDate(next.date)}`);
        }
        renderWeek();
      });
    })
    .catch(() => {
      setWord($("glanceEventNum"), "–", { empty: true });
      setText("glanceEvent", "Unavailable right now", { empty: true });
    });

  // ---- Latest achievement ----
  import("./achievements.js")
    .then((m) => {
      m.onAchievements((list) => {
        const latest = list && list[0];
        setText("glanceAchievement", latest ? latest.title : "Nothing logged yet", { empty: !latest });
      });
    })
    .catch(() => setText("glanceAchievement", "Unavailable right now", { empty: true }));
}

// ============================================
// Archives — "Archive snapshot"
// ============================================
export function initArchivesGlance() {
  const panel = $("archivesGlance");
  if (!panel) return;
  panel.querySelectorAll(".glance-tile").forEach((t) => t.classList.add("is-loading"));

  const count = (id) => (list) => setCount($(id), Array.isArray(list) ? list.length : 0);

  import("./students.js")
    .then((m) => {
      m.onStudents(count("glanceStudents"));
      m.loadStudents().catch(() => {});
    })
    .catch(() => setWord($("glanceStudents"), "–", { empty: true }));

  import("./teachers-data.js")
    .then((m) => {
      m.onTeachers(count("glanceTeachers"));
      m.loadTeachers().catch(() => {});
    })
    .catch(() => setWord($("glanceTeachers"), "–", { empty: true }));

  import("./gallery.js")
    .then((m) => m.onGallery(count("glanceGallery")))
    .catch(() => setWord($("glanceGallery"), "–", { empty: true }));

  import("./archive-materials.js")
    .then((m) => m.onArchiveMaterials(count("glanceMaterials")))
    .catch(() => setWord($("glanceMaterials"), "–", { empty: true }));
}
