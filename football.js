// ============================================
// 8CM — Pitch (public display)
// ------------------------------------------------
// Renders football.html: the match-history hero, the Red/Blue team
// cards, and the tap-to-open formation modal. Data lives in Firestore
// (pitchTeams/{red,blue}, pitchMatches/{id}) and is monitor-managed
// from manage.html via football-manage.js. See football-data.js for
// the shared constants + seed content both modules use.
// ============================================
import {
  collection, doc, onSnapshot, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { playOpen, playClose, playClick } from "./sound.js";
import {
  PITCH_POSITIONS, PITCH_ENDS, SEED_TEAMS, escapeHtml, formatMatchDate,
} from "./football-data.js";

const $ = (id) => document.getElementById(id);

let teams = { red: null, blue: null };
let matches = null; // null = loading, [] = loaded empty
let visibleCount = 5;
const PAGE_SIZE = 5;

// ------------------------------------------------
// Crest — a small colored shield with the team's initial. Stands in
// for a real logo until one's uploaded; the shape + tint stays
// consistent everywhere a team is referenced.
// ------------------------------------------------
function crestMarkup(teamId, name) {
  const initial = (name || teamId || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="pitch-crest pitch-crest-${escapeHtml(teamId)}" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M12 2.4 4.5 5.2v5.6c0 5.1 3.2 8.9 7.5 10.8 4.3-1.9 7.5-5.7 7.5-10.8V5.2L12 2.4z"/></svg>
    <span class="pitch-crest-letter">${escapeHtml(initial)}</span>
  </span>`;
}

function teamWithFallback(id) {
  return teams[id] || SEED_TEAMS[id];
}

// ------------------------------------------------
// Match history hero
// ------------------------------------------------
function matchRow(match, { latest = false } = {}) {
  const red = teamWithFallback("red");
  const blue = teamWithFallback("blue");
  const rWin = match.redScore > match.blueScore;
  const bWin = match.blueScore > match.redScore;
  return `
    <article class="match-card${latest ? " match-card--latest" : ""}" data-id="${escapeHtml(match.id)}">
      ${latest ? `<span class="match-latest-tag">Latest match</span>` : ""}
      <div class="match-row">
        <div class="match-side match-side-red${rWin ? " match-side--win" : ""}">
          ${crestMarkup("red", red.name)}
          <span class="match-team-name">${escapeHtml(red.name)}</span>
        </div>
        <div class="match-score">
          <span class="${rWin ? "is-winner" : ""}">${match.redScore}</span>
          <span class="match-score-sep">–</span>
          <span class="${bWin ? "is-winner" : ""}">${match.blueScore}</span>
        </div>
        <div class="match-side match-side-blue${bWin ? " match-side--win" : ""}">
          <span class="match-team-name">${escapeHtml(blue.name)}</span>
          ${crestMarkup("blue", blue.name)}
        </div>
      </div>
      <div class="match-meta">
        <span>${escapeHtml(formatMatchDate(match.date))}</span>
        ${match.note ? `<span class="match-note">${escapeHtml(match.note)}</span>` : ""}
      </div>
    </article>`;
}

function renderMatches() {
  const wrap = $("pitchMatchHistory");
  if (!wrap) return;

  if (matches === null) {
    wrap.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading matches…</span></div>`;
    return;
  }
  if (!matches.length) {
    wrap.innerHTML = `<p class="empty-body">No matches recorded yet. Once a monitor logs Friday's result, it'll show up here — latest one first.</p>`;
    return;
  }

  const [latest, ...rest] = matches;
  const shown = rest.slice(0, visibleCount);
  const more = rest.length > shown.length;

  wrap.innerHTML =
    matchRow(latest, { latest: true }) +
    (shown.length ? `<div class="match-history-prev">${shown.map((m) => matchRow(m)).join("")}</div>` : "") +
    (more ? `<button type="button" class="btn btn-ghost btn-small match-show-more" id="pitchShowMore">Show 5 more</button>` : "");

  const moreBtn = $("pitchShowMore");
  if (moreBtn) moreBtn.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    playClick();
    renderMatches();
  });
}

// ------------------------------------------------
// Team cards
// ------------------------------------------------
function playerRow(p) {
  return `<li class="pitch-player-row">
    <span class="pitch-pos-tag pitch-pos-${escapeHtml(p.position || "MF")}">${escapeHtml(p.position || "MF")}</span>
    <span class="pitch-player-name">${escapeHtml(p.name || "Unnamed")}</span>
  </li>`;
}

function teamCard(id) {
  const t = teamWithFallback(id);
  const players = t.players || [];
  return `
    <article class="team-card team-card-${id}" data-team="${id}" tabindex="0" role="button"
      aria-label="View ${escapeHtml(t.name)}'s formation">
      <div class="team-card-head">
        ${crestMarkup(id, t.name)}
        <div>
          <h3>${escapeHtml(t.name)}</h3>
          <p class="team-card-sub">${players.length} player${players.length === 1 ? "" : "s"} · ${escapeHtml(PITCH_ENDS[t.end] || "End not set")}</p>
        </div>
      </div>
      <ul class="pitch-player-list">
        ${players.length ? players.map(playerRow).join("") : `<li class="pitch-player-row pitch-player-row-empty">No players added yet.</li>`}
      </ul>
      <span class="team-card-cta">View formation →</span>
    </article>`;
}

function renderTeams() {
  const grid = $("pitchTeamGrid");
  if (!grid) return;
  grid.innerHTML = teamCard("red") + teamCard("blue");
  grid.querySelectorAll(".team-card").forEach((card) => {
    card.addEventListener("click", () => openFormation(card.dataset.team));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFormation(card.dataset.team); }
    });
  });
}

// ------------------------------------------------
// Formation modal — half-pitch view of one team's arrangement
// ------------------------------------------------
function formationDots(players) {
  return (players || []).map((p) => `
    <div class="pitch-dot" style="left:${Number(p.x) || 50}%; top:${Number(p.y) || 50}%" title="${escapeHtml(p.name || "Unnamed")} · ${escapeHtml(PITCH_POSITIONS[p.position] || p.position || "")}">
      <span class="pitch-dot-mark"></span>
      <span class="pitch-dot-label">${escapeHtml((p.name || "?").split(" ")[0])}</span>
    </div>`).join("");
}

function renderFormation(id) {
  const t = teamWithFallback(id);
  const titleEl = $("pitchFormationTitle");
  const subEl = $("pitchFormationSub");
  const diagram = $("pitchFormationDiagram");
  const list = $("pitchFormationList");
  if (!titleEl || !diagram) return;

  titleEl.textContent = `${t.name} — formation`;
  titleEl.style.setProperty("--team-color", `var(--team-${id})`);
  if (subEl) subEl.textContent = `Defending the ${(PITCH_ENDS[t.end] || "end not set").toLowerCase()}, half of the pitch shown.`;
  diagram.className = `pitch-half pitch-half-${id}`;
  diagram.innerHTML = `
    <div class="pitch-half-label">${escapeHtml(PITCH_ENDS[t.end] || "End not set")}</div>
    ${formationDots(t.players)}
    <div class="pitch-goal"></div>`;
  if (list) {
    const players = t.players || [];
    list.innerHTML = players.length
      ? players.map(playerRow).join("")
      : `<li class="pitch-player-row pitch-player-row-empty">No players added yet.</li>`;
  }
}

function openFormation(id) {
  const overlay = $("pitchFormationOverlay");
  if (!overlay) return;
  overlay.dataset.team = id;
  renderFormation(id);
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("open")));
}

function closeFormation() {
  const overlay = $("pitchFormationOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => { overlay.hidden = true; }, 200);
}

// ------------------------------------------------
// Init
// ------------------------------------------------
export function initFootball() {
  const needs = $("pitchMatchHistory") || $("pitchTeamGrid");
  if (!needs) return;

  ["red", "blue"].forEach((id) => {
    onSnapshot(doc(db, "pitchTeams", id), (snap) => {
      teams[id] = snap.exists() ? { ...SEED_TEAMS[id], ...snap.data(), id } : null;
      renderTeams();
      // Keep an open formation modal in sync if a monitor edits this
      // team's players while someone has it open.
      const overlay = $("pitchFormationOverlay");
      if (overlay && !overlay.hidden && overlay.dataset.team === id) renderFormation(id);
    }, (err) => {
      console.error("[8CM] Failed to load pitch team:", id, err);
      teams[id] = null;
      renderTeams();
    });
  });

  const q = query(collection(db, "pitchMatches"), orderBy("createdAtMs", "desc"));
  onSnapshot(q, (snap) => {
    matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMatches();
  }, (err) => {
    console.error("[8CM] Failed to load pitch matches:", err);
    if (matches === null) matches = [];
    renderMatches();
  });

  const overlay = $("pitchFormationOverlay");
  if (overlay) {
    const closeBtn = $("pitchFormationClose");
    if (closeBtn) closeBtn.addEventListener("click", closeFormation);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeFormation(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeFormation();
    });
  }
}
