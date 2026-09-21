// ============================================
// 8CM — Pitch points (leaderboard + Friday performance)
// ------------------------------------------------
// Three things on football.html, all driven by Firestore:
//
//  1. LEADERBOARD  (#pitchLeaderboard)
//     Podium (gold / silver / bronze) and a ranked list under it.
//     Built from the players who are on the teams right now, plus the
//     APPROVED docs in pitchPerformances. Points are re-scored from the
//     stat lines each time (football-data.js → scorePerformance), so the
//     scoring table can be tuned without touching any stored data.
//
//  2. PERFORMANCE GATE  (#pitchPerformance)
//     Locked until Friday. On Friday it opens and lists the players who
//     are ON THE TEAMS (not the student directory). Tap a player and
//     their row grows into a full editor: goals, assists, saves, own
//     goals, cards, clean sheet, MVP and the team result, with the
//     points adding up live. Submit → everything closes and the entry
//     waits, "pending", until a monitor approves it.
//
//  3. MONITOR APPROVALS  (same section, monitors only)
//     A queue of pending entries. Approve as-is, edit then approve, or
//     reject. A monitor's own entries are approved straight away.
//     Monitors can also open the form on any day (for a missed Friday).
//
// Data: pitchPerformances/{YYYY-MM-DD_playerId}
//   { playerId, playerName, team, position, date, stats, points,
//     status: "pending" | "approved", submittedBy, submittedByName,
//     createdAtMs, approvedBy?, approvedByName?, approvedAtMs? }
// Firestore rules: see pitchPerformances in firestore.rules — anyone
// signed in may create a *pending* entry under their own uid; only
// monitors approve. (Republish firestore.rules after updating!)
// ============================================
import {
  collection, doc, onSnapshot, query, orderBy, setDoc, updateDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { describeWriteError } from "./error-utils.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playClick } from "./sound.js";
import {
  CLUBS, PITCH_POSITIONS, SCORING, STAT_LIMITS, resolveTeam, escapeHtml, positionGroup,
  emptyStats, normalizeStats, scorePerformance, buildLeaderboard, isoDate, isFriday,
  daysUntilFriday, lastFriday, performanceId, resultFor, formatMatchDate,
} from "./football-data.js";

const $ = (id) => document.getElementById(id);
const REDUCED = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let teams = { red: null, blue: null };
let teamsLoaded = { red: false, blue: false };
let matches = [];
let perfs = null; // null = loading
let me = { user: null, name: "", monitor: false };
let firstBoardPaint = true;

const teamOf = (id) => teams[id] || resolveTeam(id, null);

// ------------------------------------------------
// Small helpers
// ------------------------------------------------
function teamPlayers() {
  const out = [];
  ["red", "blue"].forEach((id) => {
    teamOf(id).players.forEach((p) => {
      if (String(p.name || "").trim()) out.push({ ...p, team: id });
    });
  });
  return out;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function crest(id, size = "") {
  const club = CLUBS[id] || CLUBS.red;
  return `<span class="pitch-crest pitch-crest-${id}${size ? ` pitch-crest-${size}` : ""}" aria-hidden="true">
    <img class="pitch-logo" src="${escapeHtml(club.logo)}" alt="" width="64" height="64" decoding="async">
    <svg class="pitch-crest-shield" viewBox="0 0 24 24"><path d="M12 2.4 4.5 5.2v5.6c0 5.1 3.2 8.9 7.5 10.8 4.3-1.9 7.5-5.7 7.5-10.8V5.2L12 2.4z"/></svg>
  </span>`;
}
function guardLogos(root) {
  root.querySelectorAll(".pitch-crest").forEach((c) => {
    const img = c.querySelector(".pitch-logo");
    if (!img) return;
    const fail = () => c.classList.add("is-fallback");
    img.addEventListener("error", fail, { once: true });
    if (img.complete && img.naturalWidth === 0) fail();
  });
}

function posChip(code) {
  return `<span class="pitch-pos pitch-pos-${positionGroup(code).toLowerCase()}" title="${escapeHtml(PITCH_POSITIONS[code] || "")}">${escapeHtml(code || "CM")}</span>`;
}

const pts = (n) => (n > 0 ? `+${n}` : String(n));
const perfPoints = (p) => scorePerformance(p.stats, p.position).total;

function countUp(el, to) {
  if (!el) return;
  if (REDUCED() || to === 0) { el.textContent = String(to); return; }
  const start = performance.now();
  const dur = 900;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(to * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ------------------------------------------------
// Toast (for "waiting for a monitor")
// ------------------------------------------------
let toastTimer = null;
function toast(html, tone = "info") {
  let el = $("perfToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "perfToast";
    el.className = "perf-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.dataset.tone = tone;
  el.innerHTML = html;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 9000);
}

// ============================================================
// 1. LEADERBOARD
// ============================================================
const CROWN = `<svg class="podium-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>`;
const MEDALS = { 1: "gold", 2: "silver", 3: "bronze" };

function podiumSlot(row, rank) {
  const medal = MEDALS[rank];
  if (!row) {
    return `<div class="podium-slot podium-${rank} is-empty">
      <div class="podium-card"><span class="podium-avatar">?</span><span class="podium-name">Up for grabs</span></div>
      <div class="podium-plinth"><span>${rank}</span></div></div>`;
  }
  return `<div class="podium-slot podium-${rank}" data-medal="${medal}" style="--rise:${rank === 1 ? 0 : rank === 2 ? 1 : 2}">
    <div class="podium-card">
      ${rank === 1 ? CROWN : ""}
      <span class="podium-avatar podium-avatar-${row.team}">${escapeHtml(initials(row.name))}</span>
      <span class="podium-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
      <span class="podium-meta">${crest(row.team)}${posChip(row.position)}</span>
      <span class="podium-points"><b data-count="${row.points}">${row.points}</b><i>pts</i></span>
      <span class="podium-bits">${statBits(row)}</span>
    </div>
    <div class="podium-plinth"><span>${rank}</span></div>
  </div>`;
}

// Small stat chips (plain text, so they look the same on every device).
function statBits(row) {
  const bits = [];
  if (row.goals) bits.push(`<span class="lb-bit" title="Goals"><b>${row.goals}</b> G</span>`);
  if (row.assists) bits.push(`<span class="lb-bit" title="Assists"><b>${row.assists}</b> A</span>`);
  if (row.saves) bits.push(`<span class="lb-bit" title="Saves"><b>${row.saves}</b> S</span>`);
  if (row.mvps) bits.push(`<span class="lb-bit lb-bit-mvp" title="MVP awards"><b>${row.mvps}</b> ★</span>`);
  return bits.join("");
}

function boardRow(row, rank) {
  const bits = [statBits(row)];
  if (row.played) bits.push(`<span class="lb-bit lb-bit-played" title="Matches played"><b>${row.played}</b> ${row.played === 1 ? "match" : "matches"}</span>`);
  return `<li class="lb-row" data-team="${row.team}">
    <span class="lb-rank">${rank || "–"}</span>
    <span class="lb-who">
      <span class="lb-dot lb-dot-${row.team}" aria-hidden="true"></span>
      <span class="lb-name">${escapeHtml(row.name)}</span>
      ${posChip(row.position)}
      ${row.current ? "" : `<span class="pitch-sub-tag">Left the team</span>`}
    </span>
    <span class="lb-bits">${bits.join("")}</span>
    <span class="lb-points"><b>${row.points}</b><i>pts</i></span>
  </li>`;
}

function rulesMarkup() {
  const g = SCORING.goal;
  const cs = SCORING.cleanSheet;
  return `<details class="points-rules">
    <summary>How points work</summary>
    <div class="points-rules-grid">
      <div><h4>Scoring</h4><ul>
        <li><span>Playing</span><b>+${SCORING.appearance}</b></li>
        <li><span>Goal — forward</span><b>+${g.FWD}</b></li>
        <li><span>Goal — midfielder</span><b>+${g.MID}</b></li>
        <li><span>Goal — defender</span><b>+${g.DEF}</b></li>
        <li><span>Goal — goalkeeper</span><b>+${g.GK}</b></li>
        <li><span>Assist</span><b>+${SCORING.assist}</b></li>
        <li><span>Hat-trick (3+ goals)</span><b>+${SCORING.hatTrick}</b></li>
        <li><span>Five-goal haul (on top)</span><b>+${SCORING.bigHaul}</b></li>
      </ul></div>
      <div><h4>Keeping it out</h4><ul>
        <li><span>Save (max ${SCORING.saveCap} a match)</span><b>+${SCORING.save}</b></li>
        <li><span>Clean sheet — goalkeeper</span><b>+${cs.GK}</b></li>
        <li><span>Clean sheet — defender</span><b>+${cs.DEF}</b></li>
        <li><span>Clean sheet — midfielder</span><b>+${cs.MID}</b></li>
        <li><span>MVP</span><b>+${SCORING.mvp}</b></li>
        <li><span>Team won / drew</span><b>+${SCORING.win} / +${SCORING.draw}</b></li>
      </ul></div>
      <div><h4>Fair play</h4><ul>
        <li><span>Own goal</span><b>${SCORING.ownGoal}</b></li>
        <li><span>Yellow card</span><b>${SCORING.yellow}</b></li>
        <li><span>Red card</span><b>${SCORING.red}</b></li>
      </ul>
      <p class="points-rules-note">Goals are worth more the harder they are to get from that position. A match can't score below 0. Nothing counts until a monitor approves it.</p></div>
    </div>
  </details>`;
}

function renderLeaderboard() {
  const wrap = $("pitchLeaderboard");
  if (!wrap) return;
  if (!(teamsLoaded.red && teamsLoaded.blue) || perfs === null) return;

  const rows = buildLeaderboard({ red: teamOf("red"), blue: teamOf("blue") }, perfs);
  if (!rows.length) {
    wrap.innerHTML = `<p class="empty-body">The leaderboard appears once a monitor has added players to the teams.</p>${rulesMarkup()}`;
    return;
  }
  const ranked = rows.filter((r) => r.points > 0);
  const unranked = rows.filter((r) => r.points <= 0);
  const podium = [ranked[1], ranked[0], ranked[2]]; // visual order: 2 · 1 · 3
  const ranks = [2, 1, 3];
  const rest = ranked.slice(3);

  wrap.innerHTML = `
    <div class="podium${ranked.length ? "" : " podium-none"}" role="list" aria-label="Top three">
      ${podium.map((r, i) => podiumSlot(r, ranks[i])).join("")}
    </div>
    ${ranked.length ? "" : `<p class="podium-note">No points yet. The first approved performance takes the top spot.</p>`}
    <ol class="lb-list" start="4">
      ${rest.map((r, i) => boardRow(r, i + 4)).join("")}
      ${unranked.length && ranked.length ? `<li class="lb-divider">Yet to score</li>` : ""}
      ${unranked.map((r) => boardRow(r, null)).join("")}
    </ol>
    ${rulesMarkup()}`;
  guardLogos(wrap);

  if (firstBoardPaint) {
    firstBoardPaint = false;
    wrap.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count)));
  }
}

// ============================================================
// 2. PERFORMANCE GATE
// ============================================================
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>`;
const UNLOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/></svg>`;

function performanceDate() {
  const now = new Date();
  return isFriday(now) ? isoDate(now) : isoDate(lastFriday(now));
}

function gateState() {
  const now = new Date();
  const friday = isFriday(now);
  const anyPlayers = teamPlayers().length > 0;
  if (!anyPlayers) return { open: false, pill: "No players yet", text: "A monitor needs to add players to the teams first." };
  if (!me.user) {
    return { open: false, signIn: friday, pill: friday ? "Open today" : "Locked",
      text: friday ? "Friday's form is open. Sign in to log a performance." : "Sign in, then come back on Friday to log a performance." };
  }
  if (friday) return { open: true, pill: "Open today", text: "Friday PE is on. Pick a player and log how they did." };
  if (me.monitor) return { open: true, pill: "Monitor access", text: `Locked for everyone else until Friday. You can log for ${formatMatchDate(performanceDate())}.` };
  const d = daysUntilFriday(now);
  return { open: false, pill: d === 1 ? "Opens tomorrow" : `Opens in ${d} days`, text: "Opens on Friday, when the match is played." };
}

function pendingList() { return (perfs || []).filter((p) => p.status === "pending"); }

function renderPerformance() {
  const wrap = $("pitchPerformance");
  if (!wrap) return;
  const g = gateState();
  const pending = pendingList();
  const mine = me.user ? pending.filter((p) => p.submittedBy === me.user.uid && !me.monitor) : [];
  const recent = (perfs || []).filter((p) => p.status === "approved")
    .sort((a, b) => (b.approvedAtMs || b.createdAtMs || 0) - (a.approvedAtMs || a.createdAtMs || 0)).slice(0, 5);

  wrap.innerHTML = `
    <button type="button" class="perf-gate ${g.open ? "is-open" : "is-locked"}" id="perfGate" ${g.open ? "" : 'aria-disabled="true"'}>
      <span class="perf-gate-icon">${g.open ? UNLOCK : LOCK}</span>
      <span class="perf-gate-body">
        <strong>Player performance</strong>
        <span>${escapeHtml(g.text)}</span>
      </span>
      <span class="perf-gate-pill">${escapeHtml(g.pill)}</span>
    </button>

    ${mine.length ? `<div class="perf-notice" role="status">
      <span class="perf-notice-dot"></span>
      <p><b>Waiting for a monitor to approve:</b> ${mine.map((p) => `${escapeHtml(p.playerName)} (${pts(perfPoints(p))} pts)`).join(", ")}. It won't count on the leaderboard until it's approved.</p>
    </div>` : ""}

    ${me.monitor ? queueMarkup(pending) : (pending.length ? `<p class="perf-waiting">${pending.length} performance${pending.length === 1 ? "" : "s"} waiting for a monitor.</p>` : "")}

    ${recent.length ? `<div class="perf-recent"><h3>Recently approved</h3><ul>${recent.map((p) => `
      <li><span class="lb-dot lb-dot-${p.team}"></span><span class="perf-recent-name">${escapeHtml(p.playerName)}</span>
      <span class="perf-recent-date">${escapeHtml(formatMatchDate(p.date))}</span><b>${pts(perfPoints(p))}</b></li>`).join("")}</ul></div>` : ""}`;

  const gate = $("perfGate");
  gate.addEventListener("click", () => {
    if (!g.open) {
      const signInBtn = g.signIn && document.getElementById("signInTriggerBtn");
      if (signInBtn) { playClick(); signInBtn.click(); return; }
      gate.classList.remove("is-shaking"); void gate.offsetWidth; gate.classList.add("is-shaking");
      playError();
      return;
    }
    openList();
  });
  wrap.querySelectorAll("[data-q]").forEach((btn) => btn.addEventListener("click", onQueueClick));
}

// ---- monitor approval queue ----
function summaryBits(s) {
  const bits = [];
  if (s.goals) bits.push(`${s.goals} goal${s.goals === 1 ? "" : "s"}`);
  if (s.assists) bits.push(`${s.assists} assist${s.assists === 1 ? "" : "s"}`);
  if (s.saves) bits.push(`${s.saves} save${s.saves === 1 ? "" : "s"}`);
  if (s.cleanSheet) bits.push("clean sheet");
  if (s.mvp) bits.push("MVP");
  if (s.ownGoals) bits.push(`${s.ownGoals} own goal${s.ownGoals === 1 ? "" : "s"}`);
  if (s.yellows) bits.push(`${s.yellows} yellow`);
  if (s.red) bits.push("red card");
  bits.push(s.result === "win" ? "team won" : s.result === "draw" ? "team drew" : s.result === "loss" ? "team lost" : "no result picked");
  return bits.join(" · ");
}

function queueMarkup(pending) {
  if (!pending.length) return `<div class="perf-queue is-empty"><h3>Waiting for approval</h3><p class="empty-body">Nothing waiting. All caught up.</p></div>`;
  const mvpsOn = (date) => (perfs || []).filter((x) => x.date === date && normalizeStats(x.stats).mvp).length;
  return `<div class="perf-queue"><div class="perf-queue-head"><h3>Waiting for approval <span class="perf-count">${pending.length}</span></h3>
    ${pending.length > 1 ? `<button type="button" class="btn btn-ghost btn-small" data-q="approve-all">Approve all</button>` : ""}</div>
    <ul>${pending.map((p) => {
      const s = normalizeStats(p.stats);
      const twoMvps = s.mvp && mvpsOn(p.date) > 1;
      return `<li class="perf-queue-item" data-id="${escapeHtml(p.id)}">
        <div class="perf-queue-main">
          <span class="lb-dot lb-dot-${p.team}"></span>
          <div><b>${escapeHtml(p.playerName)}</b> ${posChip(p.position)}
            <p>${escapeHtml(summaryBits(s))}</p>
            ${twoMvps ? `<p class="perf-queue-warn">Another MVP is already logged for this Friday.</p>` : ""}
            <p class="perf-queue-by">${escapeHtml(formatMatchDate(p.date))} · from ${escapeHtml(p.submittedByName || "a student")}</p></div>
          <span class="perf-queue-points">${pts(perfPoints(p))}<i>pts</i></span>
        </div>
        <div class="perf-queue-actions">
          <button type="button" class="btn btn-primary btn-small" data-q="approve" data-id="${escapeHtml(p.id)}">Approve</button>
          <button type="button" class="btn btn-ghost btn-small" data-q="edit" data-id="${escapeHtml(p.id)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-small perf-reject" data-q="reject" data-id="${escapeHtml(p.id)}">Reject</button>
        </div>
      </li>`;
    }).join("")}</ul></div>`;
}

let rejectArm = null;
let approveAllArm = null;
async function approveAll(btn) {
  const list = pendingList();
  if (!list.length) return;
  if (!approveAllArm) {
    btn.textContent = `Sure? Approve ${list.length}`;
    approveAllArm = setTimeout(() => { approveAllArm = null; if (btn.isConnected) btn.textContent = "Approve all"; }, 3500);
    playClick();
    return;
  }
  clearTimeout(approveAllArm); approveAllArm = null;
  btn.disabled = true; btn.textContent = "Approving…";
  let done = 0;
  try {
    for (const perf of list) { await approve(perf); done += 1; }
    playSuccess();
    toast(`<b>${done}</b> performance${done === 1 ? "" : "s"} approved. The leaderboard is updated.`, "ok");
  } catch (err) {
    console.error("[8CM] Approve all failed:", err);
    playError();
    if (btn.isConnected) { btn.disabled = false; btn.textContent = "Approve all"; }
    toast(escapeHtml(`${done} approved before it stopped. ${pointsError(err, "approve")}`), "error");
  }
}

async function onQueueClick(e) {
  if (!me.monitor) return;
  const btn = e.currentTarget;
  if (btn.dataset.q === "approve-all") { await approveAll(btn); return; }
  const perf = (perfs || []).find((p) => p.id === btn.dataset.id);
  if (!perf) return;
  const act = btn.dataset.q;

  if (act === "edit") { playClick(); openEditor({ perf }, btn.closest(".perf-queue-item")); return; }

  if (act === "approve") {
    btn.disabled = true; btn.textContent = "Approving…";
    try {
      await approve(perf);
      playSuccess();
    } catch (err) {
      console.error("[8CM] Approve failed:", err);
      playError();
      btn.disabled = false; btn.textContent = "Approve";
      toast(escapeHtml(pointsError(err, "approve")), "error");
    }
    return;
  }

  if (act === "reject") {
    if (!rejectArm || rejectArm.id !== perf.id) {
      if (rejectArm) { rejectArm.btn.textContent = "Reject"; clearTimeout(rejectArm.timer); }
      btn.textContent = "Sure?";
      rejectArm = { id: perf.id, btn, timer: setTimeout(() => { btn.textContent = "Reject"; rejectArm = null; }, 3500) };
      playClick();
      return;
    }
    clearTimeout(rejectArm.timer); rejectArm = null;
    try {
      await deleteDoc(doc(db, "pitchPerformances", perf.id));
      await logAction("deleted", { resourceType: "pitchPerformance", resourceId: perf.id, summary: `Rejected ${perf.playerName}'s stats for ${perf.date}` });
      playDelete();
    } catch (err) {
      console.error("[8CM] Reject failed:", err);
      playError();
      toast(escapeHtml(pointsError(err, "reject")), "error");
    }
  }
}

async function approve(perf) {
  const total = perfPoints(perf);
  await updateDoc(doc(db, "pitchPerformances", perf.id), {
    status: "approved", points: total,
    approvedBy: me.user.uid, approvedByName: me.name, approvedAtMs: Date.now(),
  });
  await logAction("updated", { resourceType: "pitchPerformance", resourceId: perf.id, summary: `Approved ${perf.playerName}: ${pts(total)} pts (${perf.date})` });
}

function pointsError(err, verb) {
  if (err && err.code === "permission-denied") {
    return `Couldn't ${verb} that — Firestore blocked it. If everything else saves for you, the new pitchPerformances rules haven't been published yet: paste the latest firestore.rules into Firebase console → Firestore → Rules and Publish.`;
  }
  return describeWriteError(err, verb);
}

// ============================================================
// Dialog plumbing
// ============================================================
let listOverlay = null;
let editOverlay = null;
let lastFocus = null;

function makeOverlay(id, cls, cardClass) {
  const o = document.createElement("div");
  o.className = `modal-overlay perf-overlay ${cls}`;
  o.id = id;
  o.hidden = true;
  o.setAttribute("role", "dialog");
  o.setAttribute("aria-modal", "true");
  o.innerHTML = `<div class="modal-card ${cardClass}"></div>`;
  document.body.appendChild(o);
  return o;
}
function show(o, focusSel) {
  o.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    o.classList.add("open");
    const f = focusSel && o.querySelector(focusSel);
    if (f) f.focus({ preventScroll: true });
  }));
}
function hide(o) {
  if (!o || o.hidden) return;
  o.classList.remove("open");
  setTimeout(() => { o.hidden = true; }, 240);
}

// ------------------------------------------------
// The player list
// ------------------------------------------------
function perfFor(date, playerId) {
  return (perfs || []).find((p) => p.id === performanceId(date, playerId)) || null;
}

function listMarkup() {
  const date = performanceDate();
  const col = (id) => {
    const t = teamOf(id);
    const players = t.players.filter((p) => String(p.name || "").trim());
    return `<section class="perf-team perf-team-${id}">
      <header>${crest(id)}<h4>${escapeHtml(t.name)}</h4><span>${players.length} player${players.length === 1 ? "" : "s"}</span></header>
      <ul class="perf-players">
        ${players.length ? players.map((p) => {
          const rec = perfFor(date, p.id);
          const badge = !rec ? `<span class="perf-badge">Log</span>`
            : rec.status === "pending" ? `<span class="perf-badge is-pending">Pending</span>`
            : `<span class="perf-badge is-approved">${pts(perfPoints(rec))} pts</span>`;
          return `<li><button type="button" class="perf-player" data-pid="${escapeHtml(p.id)}" data-team="${id}">
            ${posChip(p.position)}<span class="perf-player-name">${escapeHtml(p.name)}</span>${badge}
          </button></li>`;
        }).join("") : `<li class="perf-player-empty">No players yet.</li>`}
      </ul></section>`;
  };
  return `
    <button class="modal-close" type="button" data-close aria-label="Close">✕</button>
    <h3 id="perfListTitle">Player performance</h3>
    <p class="modal-sub">${me.monitor && !isFriday() ? "Monitor access · " : ""}${escapeHtml(formatMatchDate(date))}. Tap a player to log how they did. Only players on the teams are listed.</p>
    <div class="perf-teams">${col("red")}${col("blue")}</div>`;
}

function openList() {
  if (!listOverlay) {
    listOverlay = makeOverlay("perfListOverlay", "perf-list-overlay", "perf-list-card");
    listOverlay.setAttribute("aria-labelledby", "perfListTitle");
    listOverlay.addEventListener("click", (e) => {
      if (e.target === listOverlay || e.target.closest("[data-close]")) closeAll();
      const btn = e.target.closest(".perf-player");
      if (btn) {
        const p = teamOf(btn.dataset.team).players.find((x) => x.id === btn.dataset.pid);
        if (p) { playClick(); openEditor({ player: { ...p, team: btn.dataset.team } }, btn); }
      }
    });
  }
  lastFocus = document.activeElement;
  listOverlay.querySelector(".modal-card").innerHTML = listMarkup();
  guardLogos(listOverlay);
  playOpen();
  show(listOverlay, ".modal-close");
}

function refreshList() {
  if (!listOverlay || listOverlay.hidden) return;
  const card = listOverlay.querySelector(".modal-card");
  const top = card.scrollTop;
  card.innerHTML = listMarkup();
  guardLogos(card);
  card.scrollTop = top;
}

function closeAll() {
  if (editOverlay && !editOverlay.hidden) hide(editOverlay);
  hide(listOverlay);
  playClose();
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

// ------------------------------------------------
// The editor — grows out of the row that was tapped
// ------------------------------------------------
let ed = null; // { perf, player, team, date, stats, readOnly, isNew }

function stepper(key, label, hint) {
  return `<div class="perf-field" data-stat="${key}">
    <span class="perf-field-label">${label}</span>
    <div class="perf-stepper">
      <button type="button" data-step="-1" aria-label="Fewer ${label.toLowerCase()}">−</button>
      <output aria-live="polite">0</output>
      <button type="button" data-step="1" aria-label="More ${label.toLowerCase()}">+</button>
    </div>
    <span class="perf-field-hint">${hint}</span>
  </div>`;
}

function toggle(key, label, hint) {
  return `<button type="button" class="perf-toggle" data-toggle="${key}" aria-pressed="false">
    <span class="perf-toggle-label">${label}</span><span class="perf-field-hint">${hint}</span>
  </button>`;
}

function editorMarkup() {
  const g = positionGroup(ed.player.position);
  const t = teamOf(ed.team);
  const csHint = SCORING.cleanSheet[g] ? `+${SCORING.cleanSheet[g]}` : "no points for forwards";
  let action = "";
  if (ed.readOnly) {
    action = `<p class="perf-lock-note">${ed.perf && ed.perf.status === "approved" ? "Approved — this is locked in." : "Waiting for a monitor to approve this."}</p>
      <button type="button" class="btn btn-ghost" data-close-edit>Close</button>`;
  } else if (me.monitor) {
    const pend = ed.perf && ed.perf.status === "pending";
    action = `${ed.perf ? `<button type="button" class="btn btn-ghost perf-reject" data-act="remove">${pend ? "Reject" : "Remove record"}</button>` : ""}
      <span class="perf-spacer"></span>
      <button type="button" class="btn btn-ghost" data-close-edit>Cancel</button>
      <button type="button" class="btn btn-primary" data-act="save"><span class="btn-label">${pend ? "Save & approve" : "Save"}</span></button>`;
  } else {
    action = `<span class="perf-spacer"></span>
      <button type="button" class="btn btn-ghost" data-close-edit>Cancel</button>
      <button type="button" class="btn btn-primary" data-act="save"><span class="btn-label">Submit for approval</span></button>`;
  }

  return `
    <button class="modal-close" type="button" data-close-edit aria-label="Close">✕</button>
    <header class="perf-edit-head">
      ${crest(ed.team, "lg")}
      <div>
        <h3 id="perfEditTitle">${escapeHtml(ed.player.name)}</h3>
        <p class="perf-edit-sub">${posChip(ed.player.position)} <span>${escapeHtml(t.name)} · ${escapeHtml(formatMatchDate(ed.date))}</span></p>
      </div>
      <div class="perf-total" aria-live="polite"><b id="perfTotal">0</b><i>pts</i></div>
    </header>
    ${ed.suggested ? `<p class="perf-suggest">Result${ed.stats.cleanSheet ? " and clean sheet" : ""} filled in from the match logged for this Friday.</p>` : ""}
    <div class="perf-fields">
      ${stepper("goals", "Goals", `+${SCORING.goal[g]} each`)}
      ${stepper("assists", "Assists", `+${SCORING.assist} each`)}
      ${stepper("saves", "Saves", `+${SCORING.save} each, max ${SCORING.saveCap}`)}
      ${stepper("ownGoals", "Own goals", `${SCORING.ownGoal} each`)}
      ${stepper("yellows", "Yellow cards", `${SCORING.yellow} each`)}
    </div>
    <div class="perf-toggles">
      ${toggle("mvp", "MVP", `+${SCORING.mvp}`)}
      ${toggle("cleanSheet", "Clean sheet", csHint)}
      ${toggle("red", "Red card", `${SCORING.red}`)}
    </div>
    <div class="perf-result" id="perfResult" role="radiogroup" aria-label="Team result">
      <span class="perf-field-label">Team result</span>
      <div class="perf-seg">
        <button type="button" role="radio" data-result="win">Won <i>+${SCORING.win}</i></button>
        <button type="button" role="radio" data-result="draw">Drew <i>+${SCORING.draw}</i></button>
        <button type="button" role="radio" data-result="loss">Lost <i>0</i></button>
      </div>
    </div>
    <div class="perf-break" id="perfBreak" aria-label="Points breakdown"></div>
    <p class="auth-error" id="perfError" hidden></p>
    <div class="perf-actions">${action}</div>`;
}

function paintEditor() {
  const card = editOverlay.querySelector(".modal-card");
  const s = ed.stats;
  card.querySelectorAll(".perf-field").forEach((f) => {
    const key = f.dataset.stat;
    f.querySelector("output").textContent = String(s[key]);
    const [minus, plus] = f.querySelectorAll("button");
    minus.disabled = ed.readOnly || s[key] <= 0;
    plus.disabled = ed.readOnly || s[key] >= STAT_LIMITS[key];
  });
  card.querySelectorAll(".perf-toggle").forEach((b) => {
    b.setAttribute("aria-pressed", String(!!s[b.dataset.toggle]));
    b.disabled = ed.readOnly;
  });
  card.querySelectorAll("[data-result]").forEach((b) => {
    const on = s.result === b.dataset.result;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-checked", String(on));
    b.disabled = ed.readOnly;
  });

  const { total, rows } = scorePerformance(s, ed.player.position);
  const totalEl = $("perfTotal");
  const prev = Number(totalEl.dataset.v || 0);
  totalEl.dataset.v = String(total);
  if (prev !== total) {
    totalEl.classList.remove("bump"); void totalEl.offsetWidth; totalEl.classList.add("bump");
    if (REDUCED()) totalEl.textContent = String(total);
    else {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 260);
        totalEl.textContent = String(Math.round(prev + (total - prev) * t));
        if (t < 1) requestAnimationFrame(step); else totalEl.textContent = String(total);
      };
      requestAnimationFrame(step);
    }
  } else totalEl.textContent = String(total);

  $("perfBreak").innerHTML = rows.map((r) => `<div class="perf-break-row${r.points < 0 ? " is-neg" : ""}">
    <span>${escapeHtml(r.label)}${r.detail ? ` <small>${escapeHtml(r.detail)}</small>` : ""}</span><b>${pts(r.points)}</b></div>`).join("");
}

function setEditorError(msg) {
  const el = $("perfError");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function openEditor({ player, perf }, fromEl) {
  const date = perf ? perf.date : performanceDate();
  let team, p;
  if (perf) {
    team = perf.team;
    p = teamOf(team).players.find((x) => x.id === perf.playerId) || { id: perf.playerId, name: perf.playerName, position: perf.position };
    p = { ...p, position: perf.position || p.position };
  } else { team = player.team; p = player; }

  const existing = perf || perfFor(date, p.id);
  const mineAndPending = existing && existing.status === "pending" && me.user && existing.submittedBy === me.user.uid;
  const readOnly = !!existing && !me.monitor && !mineAndPending;

  let stats = existing ? normalizeStats(existing.stats) : emptyStats();
  let suggested = false;
  if (!existing) {
    const m = matches.find((x) => x.date === date);
    if (m) {
      stats.result = resultFor(m, team);
      const conceded = team === "red" ? m.blueScore : m.redScore;
      stats.cleanSheet = conceded === 0 && positionGroup(p.position) !== "FWD";
      suggested = true;
    }
  }
  ed = { perf: existing, player: p, team, date, stats, readOnly, suggested };

  if (!editOverlay) {
    editOverlay = makeOverlay("perfEditOverlay", "perf-edit-overlay", "perf-edit-card");
    editOverlay.setAttribute("aria-labelledby", "perfEditTitle");
    editOverlay.addEventListener("click", onEditorClick);
  }
  const card = editOverlay.querySelector(".modal-card");
  card.innerHTML = editorMarkup();
  guardLogos(card);
  const totalEl = $("perfTotal");
  totalEl.dataset.v = "0";
  paintEditor();

  // Grow from the tapped row to the full editor.
  editOverlay.hidden = false;
  card.style.transition = "none";
  card.style.transform = "";
  card.style.opacity = "";
  if (fromEl && !REDUCED()) {
    const from = fromEl.getBoundingClientRect();
    const to = card.getBoundingClientRect();
    card.style.transformOrigin = "top left";
    card.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${Math.max(0.05, from.width / to.width)}, ${Math.max(0.05, from.height / to.height)})`;
    card.style.opacity = "0.2";
    void card.offsetWidth;
    card.style.transition = "transform .46s cubic-bezier(.22,1,.36,1), opacity .25s ease-out";
    card.style.transform = "none";
    card.style.opacity = "1";
  } else {
    card.style.opacity = "1";
  }
  requestAnimationFrame(() => editOverlay.classList.add("open"));
  setTimeout(() => { const f = card.querySelector(".perf-stepper button:not(:disabled), [data-close-edit]"); if (f) f.focus({ preventScroll: true }); }, 60);
}

function closeEditor() {
  if (!editOverlay || editOverlay.hidden) return;
  hide(editOverlay);
  playClose();
}

async function onEditorClick(e) {
  if (e.target === editOverlay || e.target.closest("[data-close-edit]")) { closeEditor(); return; }
  if (ed.readOnly) return;

  const stepBtn = e.target.closest("[data-step]");
  if (stepBtn) {
    const key = stepBtn.closest(".perf-field").dataset.stat;
    ed.stats[key] = Math.min(STAT_LIMITS[key], Math.max(0, ed.stats[key] + Number(stepBtn.dataset.step)));
    if (key === "goals" && ed.stats.goals >= 3 && Number(stepBtn.dataset.step) > 0 && ed.stats.goals === 3) playSuccess(); else playClick();
    paintEditor();
    return;
  }
  const tog = e.target.closest("[data-toggle]");
  if (tog) { ed.stats[tog.dataset.toggle] = !ed.stats[tog.dataset.toggle]; playClick(); paintEditor(); return; }
  const res = e.target.closest("[data-result]");
  if (res) { ed.stats.result = res.dataset.result; setEditorError(null); { const seg = $("perfResult"); if (seg) seg.classList.remove("is-missing"); } playClick(); paintEditor(); return; }

  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "save") await saveEditor(act);
  if (act.dataset.act === "remove") await removeRecord(act);
}

async function saveEditor(btn) {
  if (!me.user) { setEditorError("Sign in first. Your name goes on the submission."); return; }
  if (!normalizeStats(ed.stats).result) {
    setEditorError("Pick the team result first: won, drew or lost.");
    const seg = $("perfResult");
    if (seg) { seg.classList.remove("is-missing"); void seg.offsetWidth; seg.classList.add("is-missing"); }
    playError();
    return;
  }
  const label = btn.querySelector(".btn-label");
  const before = label.textContent;
  btn.disabled = true; label.textContent = "Saving…";
  setEditorError(null);

  const stats = normalizeStats(ed.stats);
  const total = scorePerformance(stats, ed.player.position).total;
  const id = performanceId(ed.date, ed.player.id);
  const ref = doc(db, "pitchPerformances", id);
  const base = {
    playerId: ed.player.id, playerName: ed.player.name, team: ed.team, position: ed.player.position,
    date: ed.date, stats, points: total,
  };

  try {
    if (me.monitor) {
      await setDoc(ref, {
        ...base, status: "approved",
        ...(ed.perf ? {} : { submittedBy: me.user.uid, submittedByName: me.name, createdAtMs: Date.now() }),
        approvedBy: me.user.uid, approvedByName: me.name, approvedAtMs: Date.now(),
      }, { merge: true });
      await logAction(ed.perf ? "updated" : "created", { resourceType: "pitchPerformance", resourceId: id, summary: `${ed.perf ? "Updated" : "Logged"} ${ed.player.name}: ${pts(total)} pts (${ed.date})` });
      playSuccess();
      closeEditor(); hide(listOverlay);
      toast(`<b>${escapeHtml(ed.player.name)}</b> approved · ${pts(total)} pts. The leaderboard is updated.`, "ok");
    } else {
      await setDoc(ref, {
        ...base, status: "pending", submittedBy: me.user.uid, submittedByName: me.name,
        createdAtMs: ed.perf ? ed.perf.createdAtMs : Date.now(),
      });
      playSuccess();
      // Everything closes; the entry now waits for a monitor.
      closeEditor(); hide(listOverlay);
      toast(`<b>Submitted for ${escapeHtml(ed.player.name)}.</b> Wait until a monitor approves it — the leaderboard updates once they do.`, "wait");
      const gate = $("perfGate");
      if (gate) gate.scrollIntoView({ behavior: REDUCED() ? "auto" : "smooth", block: "center" });
    }
  } catch (err) {
    console.error("[8CM] Save performance failed:", err);
    playError();
    setEditorError(pointsError(err, "save"));
    btn.disabled = false; label.textContent = before;
  }
}

let removeArmed = null;
async function removeRecord(btn) {
  if (!ed.perf) return;
  if (!removeArmed) {
    const before = btn.textContent;
    btn.textContent = "Tap again to confirm";
    removeArmed = setTimeout(() => { btn.textContent = before; removeArmed = null; }, 3500);
    playClick();
    return;
  }
  clearTimeout(removeArmed); removeArmed = null;
  try {
    await deleteDoc(doc(db, "pitchPerformances", ed.perf.id));
    await logAction("deleted", { resourceType: "pitchPerformance", resourceId: ed.perf.id, summary: `Removed ${ed.player.name}'s stats for ${ed.date}` });
    playDelete();
    closeEditor();
  } catch (err) {
    console.error("[8CM] Remove performance failed:", err);
    playError();
    setEditorError(pointsError(err, "remove"));
  }
}

// ============================================================
// Init
// ============================================================
export function initFootballPoints() {
  if (!$("pitchLeaderboard") && !$("pitchPerformance")) return;

  const rerender = () => { renderLeaderboard(); renderPerformance(); refreshList(); };

  ["red", "blue"].forEach((id) => {
    onSnapshot(doc(db, "pitchTeams", id), (snap) => {
      teams[id] = resolveTeam(id, snap.exists() ? snap.data() : null);
      teamsLoaded[id] = true;
      rerender();
    }, (err) => {
      console.error("[8CM] points: team load failed", id, err);
      teams[id] = resolveTeam(id, null); teamsLoaded[id] = true; rerender();
    });
  });

  onSnapshot(query(collection(db, "pitchMatches"), orderBy("createdAtMs", "desc")), (snap) => {
    matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }, () => {});

  onSnapshot(query(collection(db, "pitchPerformances"), orderBy("createdAtMs", "asc")), (snap) => {
    perfs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rerender();
  }, (err) => {
    console.error("[8CM] points: performances load failed", err);
    if (perfs === null) perfs = [];
    rerender();
  });

  subscribeAuth((state) => {
    const user = state.user || null;
    const profile = state.profile || {};
    me = {
      user,
      monitor: !!state.monitor,
      name: (profile.claimedStudentName || (user && user.displayName) || (user && user.email) || "").toString(),
    };
    renderPerformance();
    refreshList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (editOverlay && !editOverlay.hidden) closeEditor();
    else if (listOverlay && !listOverlay.hidden) closeAll();
  });

  // The gate flips from "Opens in 1 day" to open at midnight without a reload.
  setInterval(() => { if (!document.hidden) renderPerformance(); }, 60 * 1000);
}
