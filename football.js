// ============================================
// 8CM — Pitch (public display)
// ------------------------------------------------
// Renders football.html: the match-history card, the Barça / Madrid
// team cards, and the tap-to-open formation modal (a landscape pitch
// with the team's info beside it). Data lives in Firestore
// (pitchTeams/{red,blue}, pitchMatches/{id}); monitors edit it from
// this same page through football-manage.js — there is no Pitch tab in
// the Monitor panel any more. See football-data.js for the shared
// constants and the formation layout maths.
//
// This module owns everything that is drawn. football-manage.js only
// adds the monitor-only buttons and the editing dialogs, and talks to
// this file through the small API at the bottom (getPitchState,
// setMatchEditMode, pitchPreviewMarkup) plus one DOM event:
//   "pitch:match-action"  { action: "edit" | "delete", id }
// ============================================
import {
  collection, doc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { playOpen, playClose, playClick } from "./sound.js";
import {
  PITCH_ENDS, CLUBS, resolveTeam, escapeHtml, formatMatchDate,
  positionGroup, pitchPlacements, orderedPlayers,
  PITCH_POSITIONS, otherEnd, sortMatches,
} from "./football-data.js";

const $ = (id) => document.getElementById(id);

let teams = { red: null, blue: null };        // resolved team objects once loaded
let teamsLoaded = { red: false, blue: false };
let matches = null;                            // null = loading, [] = loaded empty
let visibleCount = 5;
let matchEditMode = false;
const PAGE_SIZE = 5;

const teamOf = (id) => teams[id] || resolveTeam(id, null);
const nameOf = (id) => teamOf(id).name;

// ------------------------------------------------
// Logos — BARCA.png / RAM.png, with the old shield as a safety net
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
    if (img.complete && img.naturalWidth === 0) fail(); // already failed before we listened
  });
}

// ------------------------------------------------
// Position chip
// ------------------------------------------------
function posChip(code) {
  const c = escapeHtml(code || "CM");
  return `<span class="pitch-pos pitch-pos-${positionGroup(code).toLowerCase()}" title="${escapeHtml(PITCH_POSITIONS[code] || "")}">${c}</span>`;
}

// ------------------------------------------------
// Match history
// ------------------------------------------------
const PENCIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

function matchRow(match, { latest = false } = {}) {
  const rWin = match.redScore > match.blueScore;
  const bWin = match.blueScore > match.redScore;
  const controls = matchEditMode ? `
      <div class="match-edit-actions">
        <button type="button" class="task-icon-btn" data-match-action="edit" data-id="${escapeHtml(match.id)}" aria-label="Edit this match" title="Edit">✎</button>
        <button type="button" class="task-icon-btn task-icon-btn-danger" data-match-action="delete" data-id="${escapeHtml(match.id)}" aria-label="Delete this match" title="Delete">✕</button>
      </div>` : "";
  return `
    <article class="match-card${latest ? " match-card--latest" : ""}${matchEditMode ? " is-editing" : ""}" data-id="${escapeHtml(match.id)}">
      ${latest ? `<span class="match-latest-tag">Latest match</span>` : ""}
      ${controls}
      <div class="match-row">
        <div class="match-side match-side-red${rWin ? " match-side--win" : ""}">
          ${crestMarkup("red")}
          <span class="match-team-name">${escapeHtml(nameOf("red"))}</span>
        </div>
        <div class="match-score">
          <span class="${rWin ? "is-winner" : ""}">${Number(match.redScore) || 0}</span>
          <span class="match-score-sep">–</span>
          <span class="${bWin ? "is-winner" : ""}">${Number(match.blueScore) || 0}</span>
        </div>
        <div class="match-side match-side-blue${bWin ? " match-side--win" : ""}">
          <span class="match-team-name">${escapeHtml(nameOf("blue"))}</span>
          ${crestMarkup("blue")}
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

  guardLogos(wrap);
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
function playerRow(p, showSub) {
  return `<li class="pitch-player-row">
    ${posChip(p.position)}
    <span class="pitch-player-name">${escapeHtml(p.name || "Unnamed")}</span>
    ${showSub && p.slot == null ? `<span class="pitch-sub-tag">Sub</span>` : ""}
  </li>`;
}

const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

// Cards remember open/closed across a re-render (a monitor saving the
// team, a live stat coming in) so the list doesn't snap shut on you.
const teamCardExpanded = { red: false, blue: false };

function teamCard(id) {
  const t = teamOf(id);
  const players = orderedPlayers(t);
  const expanded = teamCardExpanded[id];
  return `
    <article class="team-card team-card-${id}${expanded ? " is-expanded" : ""}" data-team="${id}">
      <div class="team-card-head" data-act="open" tabindex="0" role="button" aria-label="View ${escapeHtml(t.name)}'s formation">
        ${crestMarkup(id, "lg")}
        <div>
          <h3>${escapeHtml(t.name)}</h3>
          <p class="team-card-sub">${players.length} player${players.length === 1 ? "" : "s"} · ${escapeHtml(PITCH_ENDS[t.end] || "End not set")} · ${escapeHtml(t.formation)}</p>
        </div>
        <span class="team-card-cta">View formation →</span>
      </div>
      <button type="button" class="team-card-toggle" data-act="toggle" aria-expanded="${expanded}">
        <span>${expanded ? "Hide players" : "Show players"}</span>${CHEVRON}
      </button>
      <div class="team-card-players" ${expanded ? "" : "hidden"}>
        <ul class="pitch-player-list">
          ${players.length ? players.map((p) => playerRow(p, true)).join("") : `<li class="pitch-player-row pitch-player-row-empty">No players added yet.</li>`}
        </ul>
      </div>
    </article>`;
}

function renderTeams() {
  const grid = $("pitchTeamGrid");
  if (!grid) return;
  // Wait for both teams once, so a card never flashes "no players" and then fills in.
  if (!(teamsLoaded.red && teamsLoaded.blue)) return;
  grid.innerHTML = teamCard("red") + teamCard("blue");
  guardLogos(grid);
  grid.querySelectorAll(".team-card").forEach((card) => {
    const id = card.dataset.team;
    card.querySelector('[data-act="open"]').addEventListener("click", () => openFormation(id));
    card.querySelector('[data-act="open"]').addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFormation(id); }
    });
    card.querySelector('[data-act="toggle"]').addEventListener("click", (e) => {
      e.stopPropagation();
      teamCardExpanded[id] = !teamCardExpanded[id];
      playClick();
      renderTeams();
    });
  });
}

// ------------------------------------------------
// The pitch itself — landscape, drawn once as SVG, players on top
// ------------------------------------------------
const PITCH_SVG = (() => {
  const line = `fill="none" stroke="currentColor" stroke-width=".35" stroke-linejoin="round"`;
  const stripes = Array.from({ length: 10 }, (_, i) =>
    i % 2 ? "" : `<rect x="${i * 10.5}" y="0" width="10.5" height="68" class="pitch-mow"/>`).join("");
  return `<svg class="pitch-lines" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect width="105" height="68" class="pitch-grass"/>
    ${stripes}
    <g class="pitch-marks" color="rgba(255,255,255,.62)">
      <rect x="1.2" y="1.2" width="102.6" height="65.6" ${line}/>
      <line x1="52.5" y1="1.2" x2="52.5" y2="66.8" ${line}/>
      <circle cx="52.5" cy="34" r="8.6" ${line}/>
      <circle cx="52.5" cy="34" r=".55" fill="currentColor"/>
      <rect x="1.2" y="14" width="15.6" height="40" ${line}/>
      <rect x="1.2" y="24.4" width="5.2" height="19.2" ${line}/>
      <path d="M16.8 27.4a8.6 8.6 0 0 1 0 13.2" ${line}/>
      <circle cx="11.2" cy="34" r=".5" fill="currentColor"/>
      <rect x="88.2" y="14" width="15.6" height="40" ${line}/>
      <rect x="98.6" y="24.4" width="5.2" height="19.2" ${line}/>
      <path d="M88.2 27.4a8.6 8.6 0 0 0 0 13.2" ${line}/>
      <circle cx="93.8" cy="34" r=".5" fill="currentColor"/>
    </g>
    <rect x="-.1" y="29.6" width="1.3" height="8.8" class="pitch-goalmouth"/>
    <rect x="103.8" y="29.6" width="1.3" height="8.8" class="pitch-goalmouth"/>
  </svg>`;
})();

function shortName(p) {
  const parts = String(p.name || "").trim().split(/\s+/);
  return parts[0] || "?";
}

/**
 * The pitch for one team. Red attacks left (goal on the right), Blue
 * attacks right (goal on the left) so the two modals mirror each other.
 *  opts.ghosts — also draw the empty formation slots (editor preview)
 */
export function pitchMarkup(id, team, opts = {}) {
  const faceLeft = opts.flip ? id !== "red" : id === "red";
  const dots = pitchPlacements(team, { faceLeft }).map(({ player, x, y }, i) => `
      <div class="pitch-dot${player.position === "GK" ? " pitch-dot--gk" : ""}" style="left:${x.toFixed(2)}%; top:${y.toFixed(2)}%; --i:${i}"
        title="${escapeHtml(player.name)} · ${escapeHtml(PITCH_POSITIONS[player.position] || player.position)}">
        <span class="pitch-dot-mark">${escapeHtml(player.position)}</span>
        <span class="pitch-dot-name">${escapeHtml(shortName(player))}</span>
      </div>`).join("");

  const ownEnd = PITCH_ENDS[team.end] || "";
  const farEnd = PITCH_ENDS[otherEnd(team.end)] || "";
  const empty = !dots ? `<p class="pitch-empty">${orderedPlayers(team).length ? "Everyone is on the bench." : "No lineup yet."}</p>` : "";

  return `
    <div class="pitch-field pitch-field-${escapeHtml(id)}${opts.instant ? " pitch-field--instant" : ""}" data-team="${escapeHtml(id)}" data-face="${faceLeft ? "left" : "right"}">
      ${PITCH_SVG}
      <span class="pitch-end pitch-end-own">${escapeHtml(ownEnd)}</span>
      <span class="pitch-end pitch-end-far">${escapeHtml(farEnd)}</span>
      <div class="pitch-players">${dots}</div>
      ${empty}
    </div>`;
}

// ------------------------------------------------
// Formation modal — info on one side, pitch on the other.
// Red: info left, pitch right.  Blue: the opposite.
// ------------------------------------------------
function factsMarkup(t) {
  const shape = `<span class="formation-shape" aria-label="${escapeHtml(t.formation.replace(/-/g, " "))}">${
    t.formation.split("-").map((n) => `<b>${escapeHtml(n)}</b>`).join(`<i aria-hidden="true">–</i>`)
  }</span>`;
  return `
    <dl class="formation-facts">
      <div class="formation-fact">
        <dt>Defending</dt>
        <dd>${escapeHtml(PITCH_ENDS[t.end] || "End not set")}</dd>
      </div>
      <div class="formation-fact">
        <dt>Formation</dt>
        <dd>${shape}</dd>
      </div>
    </dl>`;
}

function listMarkup(t) {
  const players = orderedPlayers(t);
  const showSub = true;
  return `
    <h4 class="formation-list-title">${players.length ? `Players <span>${players.length}</span>` : "Players"}</h4>
    <ul class="formation-list">
      ${players.length
        ? players.map((p) => `<li class="formation-list-row">
            ${posChip(p.position)}
            <span class="formation-list-name">${escapeHtml(p.name)}</span>
            <span class="formation-list-role">${showSub && p.slot == null ? "Substitute" : escapeHtml(PITCH_POSITIONS[p.position] || "")}</span>
          </li>`).join("")
        : `<li class="formation-list-row formation-list-empty">No players added yet.</li>`}
    </ul>`;
}

let formationFlipped = false;

function renderFormation(id, flipRender = false) {
  const t = teamOf(id);
  const layout = $("pitchFormationLayout");
  const info = $("pitchFormationInfo");
  const field = $("pitchFormationField");
  const card = $("pitchFormationCard");
  if (!layout || !info || !field) return;

  layout.dataset.team = id;
  if (card) card.dataset.team = id;
  info.innerHTML = `
    <header class="formation-head">
      ${crestMarkup(id, "xl")}
      <div>
        <h3 id="pitchFormationTitle">${escapeHtml(t.name)}</h3>
        <p class="formation-sub">${escapeHtml(id === "red" ? "Red team" : "Blue team")}</p>
      </div>
    </header>
    ${factsMarkup(t)}
    ${listMarkup(t)}`;
  const toward = PITCH_ENDS[otherEnd(t.end)] || "";
  // Direction follows the (possibly flipped) pitch, not the team colour.
  const faceLeft = formationFlipped ? id !== "red" : id === "red";
  const arrow = faceLeft
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5"/><path d="m11 6-6 6 6 6"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>`;
  field.innerHTML = pitchMarkup(id, t, { flip: formationFlipped, instant: flipRender }) +
    `<p class="pitch-caption pitch-caption-${faceLeft ? "left" : "right"}">${faceLeft ? arrow : ""}<span>Attacking toward the ${escapeHtml(toward.toLowerCase())}</span>${faceLeft ? "" : arrow}</p>`;
  guardLogos(info);
  const flipBtn = $("pitchFormationFlip");
  if (flipBtn) flipBtn.setAttribute("aria-pressed", String(formationFlipped));
}

let lastFocus = null;

function openFormation(id) {
  const overlay = $("pitchFormationOverlay");
  if (!overlay) return;
  lastFocus = document.activeElement;
  overlay.dataset.team = id;
  formationFlipped = false;
  renderFormation(id);
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add("open");
    const closeBtn = $("pitchFormationClose");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }));
}

function closeFormation() {
  const overlay = $("pitchFormationOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  playClose();
  setTimeout(() => {
    if (overlay.classList.contains("open")) return; // reopened during the fade-out
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }, 220);
}

// ------------------------------------------------
// Small API for football-manage.js
// ------------------------------------------------
export function getPitchState() {
  return {
    teams: { red: teamOf("red"), blue: teamOf("blue") },
    matches: matches || [],
    loaded: { teams: teamsLoaded.red && teamsLoaded.blue, matches: matches !== null },
  };
}

export function setMatchEditMode(on) {
  matchEditMode = !!on;
  renderMatches();
}

// ------------------------------------------------
// Init
// ------------------------------------------------
export function initFootball() {
  const needs = $("pitchMatchHistory") || $("pitchTeamGrid");
  if (!needs) return;

  ["red", "blue"].forEach((id) => {
    onSnapshot(doc(db, "pitchTeams", id), (snap) => {
      teams[id] = resolveTeam(id, snap.exists() ? snap.data() : null);
      teamsLoaded[id] = true;
      renderTeams();
      renderMatches(); // team names appear in the match rows
      // Keep an open formation modal in sync if a monitor edits this team.
      const overlay = $("pitchFormationOverlay");
      if (overlay && !overlay.hidden && overlay.dataset.team === id) renderFormation(id);
    }, (err) => {
      console.error("[8CM] Failed to load pitch team:", id, err);
      teams[id] = resolveTeam(id, null);
      teamsLoaded[id] = true;
      renderTeams();
    });
  });

  onSnapshot(collection(db, "pitchMatches"), (snap) => {
    matches = sortMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderMatches();
  }, (err) => {
    console.error("[8CM] Failed to load pitch matches:", err);
    if (matches === null) matches = [];
    renderMatches();
  });

  // Edit / delete buttons on match cards (only rendered while a monitor is editing).
  const history = $("pitchMatchHistory");
  if (history) history.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-match-action]");
    if (!btn) return;
    document.dispatchEvent(new CustomEvent("pitch:match-action", {
      detail: { action: btn.dataset.matchAction, id: btn.dataset.id, button: btn },
    }));
  });

  const overlay = $("pitchFormationOverlay");
  if (overlay) {
    const closeBtn = $("pitchFormationClose");
    if (closeBtn) closeBtn.addEventListener("click", closeFormation);
    const flipBtn = $("pitchFormationFlip");
    if (flipBtn) flipBtn.addEventListener("click", () => {
      formationFlipped = !formationFlipped;
      playClick();
      renderFormation(overlay.dataset.team, true);
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeFormation(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeFormation();
    });
  }
}
