// ============================================
// 8CM — Hero "glance" panels (V17.1)
// ------------------------------------------------
// Home and Archives each get a live panel in their hero. Every number
// in them comes from data already live elsewhere on the site — nothing
// is typed in.
//
//   Home      "This week"  — a Mon–Fri strip (today marked; dots for
//             homework due / events / dated announcements — tap a day
//             to jump to the item, or pick from a small list when there
//             are several), a homework tile, a next-event countdown
//             tile, and the latest achievement.
//   Archives  "Archive snapshot" — subjects / periods / photos /
//             materials counts, each a shortcut to its section.
//   Directory "Directory snapshot" — students / teachers / houses /
//             guests counts, each a shortcut to its section.
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
  let notices = [];
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

  // ---- what's on each day ----
  // hw = homework due, ev = event, an = announcement with a date.
  const KIND = {
    hw: { dot: "glance-dot-hw", meta: "Homework due" },
    ev: { dot: "glance-dot-ev", meta: "Event" },
    an: { dot: "glance-dot-an", meta: "Announcement" },
  };
  function itemsFor(iso) {
    const out = [];
    if (assignmentsApi) {
      assignments.forEach((a) => {
        if (a.dueDate === iso && assignmentsApi.dueBucket(a) !== "completed") {
          out.push({ kind: "hw", id: a.id, label: [a.subject, a.title].filter(Boolean).join(" · ") });
        }
      });
    }
    events.forEach((e) => { if (e.date === iso) out.push({ kind: "ev", id: e.id, label: e.title, extra: e.time }); });
    notices.forEach((n) => { if (n.eventDate === iso) out.push({ kind: "an", id: n.id, label: n.title }); });
    return out;
  }

  // ---- jumping to the real thing ----
  const cssEscape = (v) => (window.CSS && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/"/g, '\\"'));
  function findTarget(item) {
    const sel = {
      hw: `.hw-row[data-id="${cssEscape(item.id)}"]`,
      ev: `.event-card[data-id="${cssEscape(item.id)}"]`,
      an: `.announcement-row[data-id="${cssEscape(item.id)}"]`,
    }[item.kind];
    return sel ? document.querySelector(sel) : null;
  }
  function flash(el) {
    el.classList.remove("is-flashed");
    void el.offsetWidth; // restart the animation on repeat taps
    el.classList.add("is-flashed");
    window.setTimeout(() => el.classList.remove("is-flashed"), 2400);
  }
  function jumpTo(item) {
    closeTray();
    let el = findTarget(item);
    const go = (target) => {
      if (!target) {
        // Not on the page (filtered out, still loading): at least land in the right section.
        const sec = document.getElementById(item.kind === "ev" ? "events" : "today");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      window.setTimeout(() => flash(target), reduceMotion() ? 0 : 450);
    };
    if (!el && item.kind === "hw") {
      // The homework list may be filtered (Pending / Due soon…): show everything and retry.
      const all = document.querySelector('#homeworkFilters [data-filter="all"]');
      if (all) { all.click(); window.setTimeout(() => go(findTarget(item)), 80); return; }
    }
    go(el);
  }

  // ---- small list for days with more than one thing ----
  let tray = $("glanceTray");
  let openIso = null;
  function ensureTray() {
    if (tray) return tray;
    tray = document.createElement("div");
    tray.className = "glance-tray";
    tray.id = "glanceTray";
    tray.hidden = true;
    const week = $("glanceWeek");
    week.insertAdjacentElement("afterend", tray);
    tray.addEventListener("click", (e) => {
      if (e.target.closest(".glance-tray-close")) { closeTray(); return; }
      const btn = e.target.closest(".glance-tray-item");
      if (btn) jumpTo({ kind: btn.dataset.kind, id: btn.dataset.id });
    });
    return tray;
  }
  function closeTray() {
    openIso = null;
    if (tray) tray.hidden = true;
    panel.querySelectorAll(".glance-day.is-open").forEach((b) => { b.classList.remove("is-open"); b.setAttribute("aria-expanded", "false"); });
  }
  const ARROW = '<svg class="glance-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function fillTray(iso) {
    ensureTray();
    const items = itemsFor(iso);
    if (!items.length) { closeTray(); return; }
    tray.innerHTML = `
      <div class="glance-tray-head"><span>${esc(shortDate(iso))}</span><button type="button" class="glance-tray-close" aria-label="Close list">×</button></div>
      <ul class="glance-tray-list">${items.map((it) => `
        <li><button type="button" class="glance-tray-item" data-kind="${it.kind}" data-id="${esc(it.id)}">
          <i class="glance-dot ${KIND[it.kind].dot}" aria-hidden="true"></i>
          <span class="glance-tray-text"><span class="glance-tray-label">${esc(it.label)}</span><span class="glance-tray-meta">${KIND[it.kind].meta}${it.extra ? " · " + esc(it.extra) : ""}</span></span>
          ${ARROW}
        </button></li>`).join("")}</ul>`;
    tray.hidden = false;
  }
  function onDayTap(iso, btn) {
    const items = itemsFor(iso);
    if (!items.length) return;
    if (items.length === 1) { jumpTo(items[0]); return; }
    if (openIso === iso) { closeTray(); return; }
    closeTray();
    openIso = iso;
    btn.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    fillTray(iso);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openIso) closeTray(); });
  document.addEventListener("click", (e) => { if (openIso && !e.target.closest("#homeGlance")) closeTray(); });

  function renderWeek() {
    const today = todayIso();
    panel.querySelectorAll(".glance-day-wrap").forEach((li) => {
      const btn = li.querySelector(".glance-day");
      const iso = dayDate[li.dataset.day];
      if (!btn || !iso) return;
      const [y, m, d] = iso.split("-").map(Number);
      li.querySelector(".glance-day-num").textContent = String(d);
      btn.classList.toggle("is-today", iso === today);
      btn.classList.toggle("is-past", iso < today);

      const items = itemsFor(iso);
      const kinds = ["hw", "ev", "an"].filter((k) => items.some((it) => it.kind === k));
      li.querySelector(".glance-day-dots").innerHTML = kinds.map((k) => `<i class="glance-dot ${KIND[k].dot}"></i>`).join("");
      btn.disabled = items.length === 0;
      btn.classList.toggle("has-items", items.length > 0);
      btn.onclick = () => onDayTap(iso, btn);
      if (items.length > 1) btn.setAttribute("aria-expanded", openIso === iso ? "true" : "false");
      else btn.removeAttribute("aria-expanded");

      const bits = [new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })];
      if (iso === today) bits.push("today");
      if (items.length) bits.push(items.length === 1 ? `${items[0].label} — tap to jump to it` : `${items.length} items — tap to see them`);
      btn.setAttribute("aria-label", bits.join(", "));
      if (iso === today) btn.setAttribute("aria-current", "date");
      else btn.removeAttribute("aria-current");
    });
    if (openIso) fillTray(openIso); // keep an open list in step with live data
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

  // ---- Dated announcements (only those with a "date of event") ----
  import("./notices.js")
    .then((m) => {
      m.onNotices((list) => {
        notices = list || [];
        renderWeek();
      });
    })
    .catch(() => {});

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

  // Subjects taught across the week, and how many periods are on
  // today's grid — both read straight from the schedule in
  // timetable-data.js, never typed in here.
  import("./timetable-data.js")
    .then((m) => {
      setCount($("glanceSubjects"), m.allSubjects().length);
      const today = m.todayKey();
      const periods = m.isSchoolDay(today)
        ? m.getDaySchedule(today).filter((p) => p.category !== "break").length
        : 0;
      setCount($("glancePeriods"), periods);
    })
    .catch(() => {
      setWord($("glanceSubjects"), "–", { empty: true });
      setWord($("glancePeriods"), "–", { empty: true });
    });

  import("./gallery.js")
    .then((m) => m.onGallery(count("glanceGallery")))
    .catch(() => setWord($("glanceGallery"), "–", { empty: true }));

  import("./archive-materials.js")
    .then((m) => m.onArchiveMaterials(count("glanceMaterials")))
    .catch(() => setWord($("glanceMaterials"), "–", { empty: true }));
}

// ============================================
// Directory (houses.html) — "Directory snapshot"
// ============================================
export function initHousesGlance() {
  const panel = $("housesGlance");
  if (!panel) return;
  panel.querySelectorAll(".glance-tile:not(.is-static)").forEach((t) => t.classList.add("is-loading"));

  const count = (id) => (list) => setCount($(id), Array.isArray(list) ? list.length : 0);

  import("./students.js")
    .then((m) => {
      m.onLiveStudents((list) => {
        const students = Array.isArray(list) ? list : [];
        setCount($("glanceDirStudents"), students.length);
        setCount($("glanceDirGuests"), students.filter((s) => s.guest).length);
      });
      m.loadStudents().catch(() => {});
    })
    .catch(() => {
      setWord($("glanceDirStudents"), "–", { empty: true });
      setWord($("glanceDirGuests"), "–", { empty: true });
    });

  import("./teachers-data.js")
    .then((m) => {
      m.onTeachers(count("glanceDirTeachers"));
      m.loadTeachers().catch(() => {});
    })
    .catch(() => setWord($("glanceDirTeachers"), "–", { empty: true }));
}
