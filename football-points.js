// ============================================
// 8CM — Pitch points (public.js)
// ------------------------------------------------
// Two independent pieces on football.html, both filled in here:
//
//   #pitchLastMatch  — PUBLIC. Top 3 + a dedicated MVP card and a
//                       "Clowned" (own goal) card, all for the most
//                       recent match only. Tap any card for that
//                       player's full stat breakdown. The full season
//                       leaderboard lives on the Rankings page, not
//                       here — this is just "how did last match go".
//
//   #performance      — MONITOR-ONLY, the whole section stays
//                       `hidden` for everyone else. Lists the players
//                       on each team; tapping one opens a stat editor.
//                       Saving writes straight to Firestore and counts
//                       immediately — there's no approval step, since
//                       only a monitor can write here at all.
//
// Scoring lives in football-data.js (SCORING / scorePerformance /
// matchBoard) — nothing here decides what a goal is worth.
// ============================================
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { describeWriteError } from "./error-utils.js";
import { playOpen, playClose, playSuccess, playError, playClick, playToggleOn, playToggleOff } from "./sound.js";
import {
  CLUBS, PITCH_POSITIONS, escapeHtml, formatMatchDate, resolveTeam, orderedPlayers, positionGroup,
  SCORING, STAT_LIMITS, emptyStats, normalizeStats, scorePerformance, matchBoard, performanceId, matchKey, sortMatches,
} from "./football-data.js";

const $ = (id) => document.getElementById(id);

// ------------------------------------------------
// State — this module keeps its own small subscriptions rather than
// reaching into football.js, so it works even if that module fails.
// ------------------------------------------------
let teams = { red: null, blue: null };
let teamsLoaded = { red: false, blue: false };
let matches = null;          // null = loading, [] = loaded empty, else desc by date
let performances = null;     // null = loading, else every pitchPerformances doc
let me = { user: null, monitor: false };

const teamOf = (id) => teams[id] || resolveTeam(id, null);
// The match being shown: whichever the person picked in the strip above the
// podium, else the newest one.
let selectedMatchId = null;
const lastMatch = () => {
  if (!matches || !matches.length) return null;
  return matches.find((m) => m.id === selectedMatchId) || matches[0];
};

// ------------------------------------------------
// Small shared bits (mirrors football.js's crest/position chip so
// this module doesn't depend on football.js being loaded first)
// ------------------------------------------------
const SHIELD = `<svg class="pitch-crest-shield" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4 4.5 5.2v5.6c0 5.1 3.2 8.9 7.5 10.8 4.3-1.9 7.5-5.7 7.5-10.8V5.2L12 2.4z"/></svg>`;
function crestMarkup(id, size = "") {
  const club = CLUBS[id] || CLUBS.red;
  return `<span class="pitch-crest pitch-crest-${escapeHtml(id)}${size ? ` pitch-crest-${size}` : ""}" aria-hidden="true">
    <img class="pitch-logo" src="${escapeHtml(club.logo)}" alt="" width="64" height="64" decoding="async">
    ${SHIELD}
  </span>`;
}
function guardLogos(root) {
  root.querySelectorAll(".pitch-crest").forEach((crest) => {
    const img = crest.querySelector(".pitch-logo");
    if (!img) return;
    const fail = () => crest.classList.add("is-fallback");
    img.addEventListener("error", fail, { once: true });
    if (img.complete && img.naturalWidth === 0) fail();
  });
}
function posChip(code) {
  return `<span class="pitch-pos pitch-pos-${positionGroup(code).toLowerCase()}" title="${escapeHtml(PITCH_POSITIONS[code] || "")}">${escapeHtml(code || "CM")}</span>`;
}
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

// ------------------------------------------------
// Toast (tiny, reused for both the public and monitor sides)
// ------------------------------------------------
let toastTimer = null;
function toast(html, tone = "ok") {
  const el = $("perfToast");
  if (!el) return;
  el.innerHTML = html;
  el.dataset.tone = tone;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

// ============================================================
// PUBLIC: #pitchLastMatch — top 3 + MVP + Clowned
// ============================================================
function statLine(row) {
  const bits = [];
  if (row.stats.goals) bits.push(`<span class="lb-bit" title="Goals"><b>${row.stats.goals}</b> G</span>`);
  if (row.stats.assists) bits.push(`<span class="lb-bit" title="Assists"><b>${row.stats.assists}</b> A</span>`);
  if (row.stats.saves) bits.push(`<span class="lb-bit" title="Saves"><b>${row.stats.saves}</b> S</span>`);
  return bits.join("");
}

function podiumSlot(row, rank) {
  const medal = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  if (!row) {
    return `<div class="podium-slot podium-${rank} is-empty" data-medal="${medal}">
      <div class="podium-card"><div class="podium-avatar">?</div><p class="podium-name">Nobody yet</p></div>
      <div class="podium-plinth"><span>${rank}</span></div>
    </div>`;
  }
  return `<button type="button" class="podium-slot podium-${rank}" data-medal="${medal}" data-pid="${escapeHtml(row.id)}">
    ${rank === 1 ? `<svg class="podium-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19h18l-1.5-9-4.5 4-3-7-3 7-4.5-4L3 19z"/></svg>` : ""}
    <div class="podium-card">
      <div class="podium-avatar podium-avatar-${row.team}">${initials(row.name)}</div>
      <p class="podium-name">${escapeHtml(row.name)}</p>
      <span class="podium-meta">${crestMarkup(row.team)}${posChip(row.position)}</span>
      <span class="podium-points"><b>${row.points}</b><i>pts</i></span>
      <span class="podium-bits">${statLine(row)}</span>
    </div>
    <div class="podium-plinth"><span>${rank}</span></div>
  </button>`;
}

function sideCard(kind, row) {
  const cfg = kind === "mvp"
    ? { cls: "side-card-mvp", icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 9.2 8.6 2 9.3l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.7-7.2-.7z"/></svg>`, title: "MVP", empty: "No MVP picked yet" }
    : { cls: "side-card-clown", icon: "🤡", title: "The Clown", empty: "Nobody's been clowned — yet" };
  if (!row) {
    return `<div class="side-card ${cfg.cls} is-empty"><span class="side-card-icon">${cfg.icon}</span><p class="side-card-title">${cfg.title}</p><p class="side-card-empty">${cfg.empty}</p></div>`;
  }
  return `<button type="button" class="side-card ${cfg.cls}" data-pid="${escapeHtml(row.id)}">
    <span class="side-card-icon">${cfg.icon}</span>
    <p class="side-card-title">${cfg.title}</p>
    <div class="side-card-avatar side-card-avatar-${row.team}">${initials(row.name)}</div>
    <p class="side-card-name">${escapeHtml(row.name)}</p>
    <span class="side-card-meta">${crestMarkup(row.team)}${posChip(row.position)}</span>
    ${kind === "mvp" ? `<span class="side-card-points"><b>${row.points}</b><i>pts</i></span>` : `<span class="side-card-tag">Own goal</span>`}
  </button>`;
}

const scoreOf = (m) => `${Number(m.redScore) || 0}–${Number(m.blueScore) || 0}`;

// The result of one match, always shown — even before anyone has logged a stat.
function scoreCard(m) {
  const r = Number(m.redScore) || 0;
  const b = Number(m.blueScore) || 0;
  const verdict = r === b ? "Draw" : `${teamOf(r > b ? "red" : "blue").name} won`;
  return `<article class="lm-score" data-match-breakdown="${escapeHtml(m.id)}" role="button" tabindex="0" aria-label="Open full breakdown for ${escapeHtml(formatMatchDate(m.date))}">
    <div class="lm-side lm-side-red${r > b ? " is-win" : ""}">${crestMarkup("red")}<span class="lm-team">${escapeHtml(teamOf("red").name)}</span></div>
    <div class="lm-result"><span class="lm-nums"><b class="${r > b ? "is-winner" : ""}">${r}</b><i>–</i><b class="${b > r ? "is-winner" : ""}">${b}</b></span><span class="lm-meta">${escapeHtml(formatMatchDate(m.date))} · ${escapeHtml(verdict)}</span></div>
    <div class="lm-side lm-side-blue${b > r ? " is-win" : ""}">${crestMarkup("blue")}<span class="lm-team">${escapeHtml(teamOf("blue").name)}</span></div>
    ${m.note ? `<p class="lm-note">${escapeHtml(m.note)}</p>` : ""}
  </article>`;
}

// Pick which match to look at. Only drawn when there is more than one.
function matchPicker(current) {
  if (!matches || matches.length < 2) return "";
  return `<div class="lm-picker" role="group" aria-label="Choose a match">
    ${matches.slice(0, 8).map((m, i) => `<button type="button" class="lm-chip${m.id === current.id ? " is-active" : ""}" data-match="${escapeHtml(m.id)}" aria-pressed="${m.id === current.id}">
      <span>${i === 0 ? "Latest" : escapeHtml(formatMatchDate(m.date))}</span><b>${scoreOf(m)}</b></button>`).join("")}
  </div>`;
}

function openMatchBreakdown(match) {
  const overlay = $("perfViewOverlay");
  const body = $("perfViewBody");
  if (!overlay || !body || !match) return;

  const key = matchKey(match);
  const board = matchBoard(performances || [], key);
  const r = Number(match.redScore) || 0;
  const b = Number(match.blueScore) || 0;
  const verdict = r === b ? "Draw" : `${teamOf(r > b ? "red" : "blue").name} won`;

  const playerRows = board.all.length
    ? board.all.map((row) => {
        const stats = [
          row.stats.goals ? `${row.stats.goals} G` : "",
          row.stats.assists ? `${row.stats.assists} A` : "",
          row.stats.saves ? `${row.stats.saves} S` : "",
          row.stats.mvp ? "★ MVP" : "",
          row.stats.ownGoal ? "🤡 Own goal" : "",
        ].filter(Boolean).join(" · ");
        return `<button type="button" class="match-break-player" data-pid="${escapeHtml(row.id)}">
          <span class="match-break-player-main">
            <span class="match-break-player-name">${escapeHtml(row.name)}</span>
            <span class="match-break-player-meta">${escapeHtml(teamOf(row.team).name)} · ${escapeHtml(row.position || "CM")}${stats ? ` · ${escapeHtml(stats)}` : ""}</span>
          </span>
          <b>${row.points} pts</b>
        </button>`;
      }).join("")
    : `<p class="perf-break-empty">No player stats have been logged for this match yet.</p>`;

  body.innerHTML = `
    <div class="perf-edit-head match-break-head">
      ${crestMarkup("red", "lg")}
      <div>
        <h3>Match breakdown</h3>
        <p class="perf-edit-sub"><span>${escapeHtml(formatMatchDate(match.date))} · ${escapeHtml(verdict)}</span></p>
      </div>
      ${crestMarkup("blue", "lg")}
    </div>
    <div class="match-break-score"><b>${r}</b><span>–</span><b>${b}</b></div>
    <div class="match-break-list">${playerRows}</div>`;

  lastFocus = document.activeElement;
  overlay.hidden = false;
  playOpen();
  guardLogos(body);
  body.querySelectorAll("[data-pid]").forEach((el) => {
    el.addEventListener("click", () => openStatsView(el.dataset.pid, match));
  });
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

function renderLastMatch() {
  const box = $("pitchLastMatch");
  if (!box) return;
  const sub = $("pitchLastMatchSub");
  // Only the matches and the teams are needed to show a result; stats fill in when they arrive.
  if (matches === null || !(teamsLoaded.red && teamsLoaded.blue)) {
    box.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading…</span></div>`;
    return;
  }
  const match = lastMatch();
  if (!match) {
    box.innerHTML = `<p class="empty-body">No matches recorded yet. Once one's logged, this fills in with the result and who had the best game.</p>`;
    return;
  }
  if (sub) sub.textContent = `${formatMatchDate(match.date)} · ${teamOf("red").name} vs ${teamOf("blue").name}. Tap a card for the full breakdown.`;

  const head = matchPicker(match) + scoreCard(match);
  if (performances === null) {
    box.innerHTML = head + `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading player stats…</span></div>`;
    wirePicker(box);
    box.querySelectorAll("[data-match-breakdown]").forEach((el) => {
      el.addEventListener("click", () => openMatchBreakdown(match));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openMatchBreakdown(match);
        }
      });
    });
    return;
  }

  const key = matchKey(match);
  const board = matchBoard(performances, key);
  if (!board.all.length) {
    box.innerHTML = head + `<p class="empty-body lm-empty">No player stats logged for this match yet. Tap the match card for the full breakdown.</p>`;
    wirePicker(box);
    box.querySelectorAll("[data-match-breakdown]").forEach((el) => {
      el.addEventListener("click", () => openMatchBreakdown(match));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openMatchBreakdown(match);
        }
      });
    });
    return;
  }

  box.innerHTML = head + `
    <div class="lastmatch-row">
      <div class="podium">
        ${podiumSlot(board.top[1], 2)}
        ${podiumSlot(board.top[0], 1)}
        ${podiumSlot(board.top[2], 3)}
      </div>
      <div class="side-cards">
        ${sideCard("mvp", board.mvp)}
        ${sideCard("clown", board.clown)}
      </div>
    </div>`;
  guardLogos(box);
  wirePicker(box);
  box.querySelectorAll("[data-match-breakdown]").forEach((el) => {
    el.addEventListener("click", () => openMatchBreakdown(match));
  });
  box.querySelectorAll("[data-pid]").forEach((el) => {
    el.addEventListener("click", () => openStatsView(el.dataset.pid, match));
  });
}

function wirePicker(box) {
  guardLogos(box);
  box.querySelectorAll(".lm-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedMatchId = chip.dataset.match;
      playClick();
      renderLastMatch();
      if (me.monitor) renderPerformance();
    });
  });
}

// ------------------------------------------------
// Read-only stats modal — shared by every card above
// ------------------------------------------------
function breakdownRows(rows) {
  if (!rows.length) return `<p class="perf-break-empty">No points logged.</p>`;
  return rows.map((r) => `<div class="perf-break-row"><span>${escapeHtml(r.label)}${r.detail ? `<small>${escapeHtml(r.detail)}</small>` : ""}</span><b>+${r.points}</b></div>`).join("");
}

let lastFocus = null;

function openStatsView(playerId, match) {
  const overlay = $("perfViewOverlay");
  if (!overlay) return;
  const key = matchKey(match);
  const perf = (performances || []).find((p) => p.date === key && p.playerId === playerId);
  if (!perf) return;
  const s = normalizeStats(perf.stats);
  const { total, rows } = scorePerformance(s);
  $("perfViewBody").innerHTML = `
    <div class="perf-edit-head">
      ${crestMarkup(perf.team, "lg")}
      <div>
        <h3>${escapeHtml(perf.playerName)}</h3>
        <p class="perf-edit-sub">${posChip(perf.position)}<span>${escapeHtml(teamOf(perf.team).name)} · ${escapeHtml(formatMatchDate(match.date))}</span></p>
      </div>
      <div class="perf-total"><b>${total}</b><i>pts</i></div>
    </div>
    ${s.mvp || s.ownGoal ? `<div class="perf-view-badges">${s.mvp ? `<span class="perf-flag perf-flag-mvp">★ MVP</span>` : ""}${s.ownGoal ? `<span class="perf-flag perf-flag-clown">🤡 Clowned</span>` : ""}</div>` : ""}
    <div class="perf-break">${breakdownRows(rows)}</div>`;
  lastFocus = document.activeElement;
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

function closeStatsView() {
  const overlay = $("perfViewOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => {
    if (overlay.classList.contains("open")) return; // reopened during the fade-out
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }, 220);
}

// ============================================================
// MONITOR-ONLY: #performance — list + editor, direct save
// ============================================================
function perfFor(date, playerId) {
  return (performances || []).find((p) => p.date === date && p.playerId === playerId) || null;
}

function playerRow(p, team, date) {
  const perf = perfFor(date, p.id); // `date` here is the match key
  const pts = perf ? scorePerformance(normalizeStats(perf.stats)).total : null;
  return `<button type="button" class="perf-player" data-pid="${escapeHtml(p.id)}" data-team="${escapeHtml(team)}">
    ${posChip(p.position)}
    <span class="perf-player-name">${escapeHtml(p.name)}</span>
    ${perf ? `<span class="perf-badge is-logged">${pts} pts</span>` : `<span class="perf-badge">Not logged</span>`}
  </button>`;
}

function teamBlock(id, date) {
  const t = teamOf(id);
  const players = orderedPlayers(t);
  return `<div class="perf-team perf-team-${id}">
    <header>${crestMarkup(id)}<h4>${escapeHtml(t.name)}</h4><span>${players.length} player${players.length === 1 ? "" : "s"}</span></header>
    <div class="perf-players">
      ${players.length ? players.map((p) => playerRow(p, id, date)).join("") : `<p class="perf-player-empty">No players added yet.</p>`}
    </div>
  </div>`;
}

function renderPerformance() {
  const box = $("pitchPerformance");
  if (!box || !me.monitor) return;
  if (matches === null || performances === null || !(teamsLoaded.red && teamsLoaded.blue)) {
    box.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading…</span></div>`;
    return;
  }
  const match = lastMatch();
  if (!match) {
    box.innerHTML = `<p class="empty-body">Add a match in Match history above first — performances are logged against a match.</p>`;
    return;
  }
  const key = matchKey(match);
  box.innerHTML = `
    <p class="perf-for">Logging for <b>${escapeHtml(formatMatchDate(match.date))}</b> — ${escapeHtml(teamOf("red").name)} vs ${escapeHtml(teamOf("blue").name)}.</p>
    <div class="perf-teams">${teamBlock("red", key)}${teamBlock("blue", key)}</div>`;
  guardLogos(box);
  box.querySelectorAll(".perf-player").forEach((btn) => {
    btn.addEventListener("click", () => openEditor(btn.dataset.pid, btn.dataset.team, match));
  });
}

// ------------------------------------------------
// Editor — steppers for goals/assists/saves, toggles for MVP/own goal
// ------------------------------------------------
let ed = null; // { playerId, playerName, team, position, date (match key), label, stats, existing }

function editorTotal() {
  return scorePerformance(ed.stats).total;
}

function stepperField(key, label, hint) {
  const v = ed.stats[key];
  const max = STAT_LIMITS[key];
  return `<div class="perf-field" data-stat="${key}">
    <span class="perf-field-label">${label}</span>
    <div class="perf-stepper">
      <button type="button" data-step="-1" aria-label="Fewer ${label.toLowerCase()}" ${v <= 0 ? "disabled" : ""}>−</button>
      <output>${v}</output>
      <button type="button" data-step="1" aria-label="More ${label.toLowerCase()}" ${v >= max ? "disabled" : ""}>+</button>
    </div>
    <span class="perf-field-hint">${hint}</span>
  </div>`;
}

function paintEditor() {
  const total = editorTotal();
  const totalEl = $("perfTotal");
  if (totalEl) {
    const b = totalEl.querySelector("b");
    if (b) { b.textContent = total; b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }
  const { rows } = scorePerformance(ed.stats);
  const breakEl = $("perfBreak");
  if (breakEl) breakEl.innerHTML = breakdownRows(rows);

  ["goals", "assists", "saves"].forEach((key) => {
    const field = document.querySelector(`.perf-field[data-stat="${key}"]`);
    if (!field) return;
    field.querySelector("output").textContent = ed.stats[key];
    field.querySelector('[data-step="-1"]').disabled = ed.stats[key] <= 0;
    field.querySelector('[data-step="1"]').disabled = ed.stats[key] >= STAT_LIMITS[key];
  });
  const mvpBtn = $("perfMvp");
  if (mvpBtn) mvpBtn.setAttribute("aria-pressed", String(ed.stats.mvp));
  const ogBtn = $("perfOwnGoal");
  if (ogBtn) ogBtn.setAttribute("aria-pressed", String(ed.stats.ownGoal));
}

function editorMarkup() {
  return `
    <div class="perf-edit-head">
      ${crestMarkup(ed.team, "lg")}
      <div>
        <h3 id="perfEditTitle">${escapeHtml(ed.playerName)}</h3>
        <p class="perf-edit-sub">${posChip(ed.position)}<span>${escapeHtml(teamOf(ed.team).name)} · ${escapeHtml(ed.label)}</span></p>
      </div>
      <div class="perf-total" id="perfTotal"><b>${editorTotal()}</b><i>pts</i></div>
    </div>
    <p class="auth-error" id="perfError" hidden></p>
    <div class="perf-fields">
      ${stepperField("goals", "Goals", `+${SCORING.goal} each · hat-trick +${SCORING.hatTrick} · 5+ another +${SCORING.bigHaul}`)}
      ${stepperField("assists", "Assists", `+${SCORING.assist} each`)}
      ${stepperField("saves", "Saves", `+${SCORING.save} each`)}
    </div>
    <div class="perf-toggles">
      <button type="button" class="perf-toggle" id="perfMvp" data-toggle="mvp" aria-pressed="${ed.stats.mvp}">
        <span class="perf-toggle-label">MVP</span><span class="perf-toggle-hint">+${SCORING.mvp}</span>
      </button>
      <button type="button" class="perf-toggle" id="perfOwnGoal" data-toggle="ownGoal" aria-pressed="${ed.stats.ownGoal}">
        <span class="perf-toggle-label">🤡 Own goal</span><span class="perf-toggle-hint">no points — takes the Clown spot</span>
      </button>
    </div>
    <div class="perf-break" id="perfBreak">${breakdownRows(scorePerformance(ed.stats).rows)}</div>
    <div class="perf-actions">
      ${ed.existing ? `<button type="button" class="btn btn-ghost btn-small" data-act="clear">Clear stats</button>` : ""}
      <span class="perf-spacer"></span>
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-act="save"><span class="btn-label">Save</span></button>
    </div>`;
}

function openEditor(playerId, team, match) {
  const date = matchKey(match);
  const t = teamOf(team);
  const p = (t.players || []).find((x) => x.id === playerId);
  if (!p) return;
  const existing = perfFor(date, playerId);
  ed = {
    playerId, playerName: p.name, team, position: p.position, date, label: formatMatchDate(match.date),
    stats: existing ? normalizeStats(existing.stats) : emptyStats(),
    existing: !!existing,
  };
  const overlay = $("perfEditOverlay");
  if (!overlay) return;
  $("perfEditBody").innerHTML = editorMarkup();
  lastFocus = document.activeElement;
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

function closeEditor() {
  const overlay = $("perfEditOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => {
    if (overlay.classList.contains("open")) return; // reopened during the fade-out
    overlay.hidden = true;
    ed = null;
  }, 220);
}

function setEditorError(msg) {
  const el = $("perfError");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

async function saveEditor(btn) {
  if (!ed) return;
  const label = btn.querySelector(".btn-label");
  const before = label ? label.textContent : "";
  btn.disabled = true;
  if (label) label.textContent = "Saving…";
  setEditorError(null);
  try {
    const total = editorTotal();
    const data = {
      playerId: ed.playerId, playerName: ed.playerName, team: ed.team, position: ed.position,
      date: ed.date, stats: ed.stats, points: total,
      loggedBy: me.user.uid, loggedByName: me.user.displayName || me.user.email || "A monitor",
      updatedAtMs: Date.now(),
    };
    if (!ed.existing) data.createdAtMs = Date.now();
    await setDoc(doc(db, "pitchPerformances", performanceId(ed.date, ed.playerId)), data, { merge: true });
    playSuccess();
    toast(`Saved — <b>${escapeHtml(ed.playerName)}</b>: ${total} pts.`, "ok");
    closeEditor();
  } catch (err) {
    console.error("[8CM] Save performance failed:", err);
    playError();
    setEditorError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false;
    if (label) label.textContent = before;
  }
}

async function clearEditor(btn) {
  if (!ed || !ed.existing) return;
  if (!confirm(`Clear ${ed.playerName}'s stats for this match?`)) return;
  btn.disabled = true;
  setEditorError(null);
  try {
    await deleteDoc(doc(db, "pitchPerformances", performanceId(ed.date, ed.playerId)));
    playSuccess();
    toast(`Cleared — <b>${escapeHtml(ed.playerName)}</b>'s stats for this match.`, "ok");
    closeEditor();
  } catch (err) {
    console.error("[8CM] Clear performance failed:", err);
    playError();
    setEditorError(describeWriteError(err, "clear"));
  } finally {
    btn.disabled = false;
  }
}

function onEditorClick(e) {
  if (!ed) return;
  const step = e.target.closest("[data-step]");
  if (step) {
    const field = step.closest(".perf-field");
    const key = field.dataset.stat;
    const delta = Number(step.dataset.step);
    const next = Math.max(0, Math.min(STAT_LIMITS[key], ed.stats[key] + delta));
    if (next === ed.stats[key]) return;
    ed.stats[key] = next;
    playClick();
    paintEditor();
    return;
  }
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) {
    const key = toggle.dataset.toggle;
    ed.stats[key] = !ed.stats[key];
    ed.stats[key] ? playToggleOn() : playToggleOff();
    paintEditor();
    return;
  }
  if (e.target.closest("[data-close]")) { closeEditor(); return; }
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "save") saveEditor(act);
  else if (act.dataset.act === "clear") clearEditor(act);
}

// ============================================================
// Init
// ============================================================
export function initFootballPoints() {
  const lastMatchBox = $("pitchLastMatch");
  const perfBox = $("pitchPerformance");
  if (!lastMatchBox && !perfBox) return; // not the Pitch page

  const viewOverlay = $("perfViewOverlay");
  if (viewOverlay) {
    const closeBtn = $("perfViewClose");
    if (closeBtn) closeBtn.addEventListener("click", closeStatsView);
    viewOverlay.addEventListener("click", (e) => { if (e.target === viewOverlay) closeStatsView(); });
  }
  const editOverlay = $("perfEditOverlay");
  if (editOverlay) {
    const editCloseBtn = $("perfEditClose");
    if (editCloseBtn) editCloseBtn.addEventListener("click", closeEditor);
    editOverlay.addEventListener("click", (e) => { if (e.target === editOverlay) closeEditor(); });
    $("perfEditBody").addEventListener("click", onEditorClick);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (editOverlay && !editOverlay.hidden) closeEditor();
    else if (viewOverlay && !viewOverlay.hidden) closeStatsView();
  });

  subscribeAuth((info) => {
    me = { user: info.user || null, monitor: !!info.monitor };
    const section = $("performance");
    const navLink = $("pitchPerfNavLink");
    if (section) section.hidden = !me.monitor;
    if (navLink) navLink.hidden = !me.monitor;
    if (me.monitor) renderPerformance();
  });

  ["red", "blue"].forEach((id) => {
    onSnapshot(doc(db, "pitchTeams", id), (snap) => {
      teams[id] = resolveTeam(id, snap.exists() ? snap.data() : null);
      teamsLoaded[id] = true;
      renderLastMatch();
      if (me.monitor) renderPerformance();
    }, (err) => {
      console.error("[8CM] Pitch points: failed to load team", id, err);
      teams[id] = resolveTeam(id, null);
      teamsLoaded[id] = true;
      renderLastMatch();
      if (me.monitor) renderPerformance();
    });
  });

  onSnapshot(collection(db, "pitchMatches"), (snap) => {
    matches = sortMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderLastMatch();
    if (me.monitor) renderPerformance();
  }, (err) => {
    console.error("[8CM] Pitch points: failed to load matches", err);
    if (matches === null) matches = [];
    renderLastMatch();
    if (me.monitor) renderPerformance();
  });

  onSnapshot(collection(db, "pitchPerformances"), (snap) => {
    performances = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLastMatch();
    if (me.monitor) renderPerformance();
  }, (err) => {
    console.error("[8CM] Pitch points: failed to load performances", err);
    if (performances === null) performances = [];
    renderLastMatch();
    if (me.monitor) renderPerformance();
  });
}
