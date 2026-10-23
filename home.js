// Home page — read-only. Homework, announcements, resources, hero tiles, current period.
import { db } from "./firebase.js";
import { collection, query, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { describeNow } from "./timetable-data.js";
import { esc, readLinks } from "./util.js";

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function watch(name, field, onData, onError) {
  try {
    return onSnapshot(
      query(collection(db, name), orderBy(field, field === "dueDate" ? "asc" : "desc")),
      (snap) => onData(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, createdAtMs: data.createdAt?.toMillis?.() ?? 0 };
      })),
      onError
    );
  } catch (err) { onError(err); }
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function daysUntil(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y) return NaN;
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
function dueLabel(dateStr) {
  const n = daysUntil(dateStr);
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  if (n < 7) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `Due ${new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" })}`;
  }
  return `Due in ${n} days`;
}

// pinned → important → manual sortOrder → newest
const num = (v) => (Number.isFinite(v) ? v : Infinity);
function sortItems(items) {
  return [...items].sort((a, b) =>
    (!!b.pinned - !!a.pinned) ||
    ((b.priority === "important") - (a.priority === "important")) ||
    (num(a.sortOrder) - num(b.sortOrder)) ||
    (b.createdAtMs - a.createdAtMs));
}

function chips(item) {
  const links = readLinks(item);
  return links.length
    ? `<p class="chips">${links.map((l) => `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join("")}</p>`
    : "";
}

// Native <details>: expands with no JS and no animation. Plain <div> when there's nothing to expand.
function itemHtml({ tag, title, meta, body, item, important, pinned }) {
  const head = `${pinned ? `<span class="pin" title="Pinned" aria-label="Pinned">●</span>` : ""}` +
    `<span class="tag">${esc(tag)}</span><span class="item-title">${esc(title)}</span>` +
    `${meta ? `<span class="item-meta">${esc(meta)}</span>` : ""}`;
  const links = chips(item);
  const cls = `item${important ? " is-important" : ""}`;
  if (!body && !links) return `<div class="${cls}"><div class="item-head">${head}</div></div>`;
  return `<details class="${cls}"><summary class="item-head">${head}</summary>` +
    `<div class="item-body">${body ? `<p>${esc(body)}</p>` : ""}${links}</div></details>`;
}

function fill(id, html) { const el = $(id); if (el) el.innerHTML = html; }
const failed = (id, what) => (err) => {
  console.error(`[8CM] ${what}:`, err);
  fill(id, `<p class="empty">Couldn’t load ${what} right now.</p>`);
};

// ---------- hero: date + current period ----------
function renderDate() {
  const el = $("glanceDate");
  if (el) el.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function renderPeriod() {
  const p = describeNow();
  const t = $("periodTitle"), n = $("periodNote");
  if (t) t.textContent = p.title;
  if (n) n.textContent = p.note;
}

// ---------- homework ----------
function initHomework() {
  fill("homeworkList", `<p class="empty">Loading…</p>`);
  watch("assignments", "dueDate", (all) => {
    const today = ymd(new Date());
    // No sign-in means no per-student "done" state, so show what is still due (today onward).
    const open = all.filter((a) => a.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    fill("homeworkList", open.length
      ? open.map((a) => itemHtml({
          tag: a.subject || "Homework", title: a.title, meta: dueLabel(a.dueDate),
          body: a.description, item: a, important: a.priority === "important",
        })).join("")
      : `<p class="empty">No homework due. Nice.</p>`);
    const n = $("glanceHomework"), note = $("glanceHomeworkNote");
    if (n) n.textContent = String(open.length);
    if (note) note.textContent = open.length ? `Next: ${open[0].subject || "Homework"} · ${dueLabel(open[0].dueDate).replace("Due ", "").toLowerCase()}` : "All clear";
  }, (e) => { failed("homeworkList", "homework")(e); const n = $("glanceHomeworkNote"); if (n) n.textContent = "Unavailable"; });
}

// ---------- announcements ----------
function initAnnouncements() {
  fill("noticeList", `<p class="empty">Loading…</p>`);
  watch("notices", "createdAt", (all) => {
    const list = sortItems(all);
    fill("noticeList", list.length
      ? list.map((a) => itemHtml({
          tag: a.category || "General", title: a.title, body: a.content,
          item: a, important: a.priority === "important", pinned: !!a.pinned,
        })).join("")
      : `<p class="empty">No announcements right now.</p>`);
    const n = $("glanceNotices"), note = $("glanceNoticesNote");
    if (n) n.textContent = String(list.length);
    if (note) note.textContent = list.length ? list[0].title : "Nothing new";
  }, (e) => { failed("noticeList", "announcements")(e); const n = $("glanceNoticesNote"); if (n) n.textContent = "Unavailable"; });
}

// ---------- resources (stored in the legacy "announcements" collection) ----------
function initResources() {
  fill("resourceList", `<p class="empty">Loading…</p>`);
  watch("announcements", "createdAt", (all) => {
    const list = sortItems(all);
    fill("resourceList", list.length
      ? list.map((r) => itemHtml({ tag: "Resource", title: r.title, body: r.content, item: r, pinned: !!r.pinned })).join("")
      : `<p class="empty">No resources yet.</p>`);
  }, failed("resourceList", "resources"));
}

// ---------- boot (each section fails soft on its own) ----------
for (const fn of [renderDate, renderPeriod, initHomework, initAnnouncements, initResources]) {
  try { fn(); } catch (err) { console.error("[8CM] home init failed:", err); }
}
setInterval(renderPeriod, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderPeriod(); renderDate(); } });
