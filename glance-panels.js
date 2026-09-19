// ============================================
// 8CM — "At a glance" hero panels (Beta 17)
// ------------------------------------------------
// Home and Archives used to both show the house headcount chart in
// their hero. Now that Houses is its own destination with that
// chart, each page gets a small panel of its own — built from data
// that's already live elsewhere on the site (homework, events,
// achievements for Home; the student/teacher/gallery/materials
// counts for Archives), not invented numbers. Each initializer
// no-ops if its container isn't on the current page.
// ============================================

// Values go in via textContent, so no HTML escaping is needed (and
// escaping first would show a literal "&amp;" for a title with an &).
// "2026-09-24" -> "Thu 24 Sep" (parsed as a local date, not UTC).
function shortDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function setRow(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const empty = !text;
  el.textContent = text || "Nothing yet";
  el.classList.toggle("is-empty", empty);
}

export function initHomeGlance() {
  const panel = document.getElementById("homeGlance");
  if (!panel) return;

  import("./assignments.js")
    .then((m) => {
      m.onAssignments((list) => {
        const pending = list.filter((a) => m.dueBucket(a) !== "completed").length;
        setRow("glanceHomework", pending ? `${pending} pending` : "");
      });
    })
    .catch(() => {});

  import("./events.js")
    .then((m) => {
      m.onEvents(() => {
        const next = m.nextEvent();
        setRow("glanceEvent", next ? `${next.title} · ${shortDate(next.date)}` : "");
      });
    })
    .catch(() => {});

  import("./achievements.js")
    .then((m) => {
      m.onAchievements((list) => {
        const latest = list[0];
        setRow("glanceAchievement", latest ? latest.title : "");
      });
    })
    .catch(() => {});
}

export function initArchivesGlance() {
  const panel = document.getElementById("archivesGlance");
  if (!panel) return;

  import("./students.js")
    .then((m) => {
      m.onStudents((list) => setRow("glanceStudents", list.length ? `${list.length} in the class` : ""));
      m.loadStudents().catch(() => {});
    })
    .catch(() => {});

  import("./teachers-data.js")
    .then((m) => {
      m.onTeachers((list) => setRow("glanceTeachers", list.length ? `${list.length} teaching 8CM` : ""));
      m.loadTeachers().catch(() => {});
    })
    .catch(() => {});

  import("./gallery.js")
    .then((m) => {
      m.onGallery((list) => setRow("glanceGallery", list.length ? `${list.length} photo${list.length === 1 ? "" : "s"}` : ""));
    })
    .catch(() => {});

  import("./archive-materials.js")
    .then((m) => {
      m.onArchiveMaterials((list) => setRow("glanceMaterials", list.length ? `${list.length} filed` : ""));
    })
    .catch(() => {});
}
