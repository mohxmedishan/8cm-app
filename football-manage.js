// ============================================
// 8CM — Pitch editing (monitor-only, on football.html)
// ------------------------------------------------
// The Pitch used to have its own tab in the Monitor panel. It doesn't
// any more: monitors edit it where everyone else reads it.
//
//   • Match history card, top right:  ✎ (edit / delete on each match)
//                                     + Add match
//   • Teams heading, top right:       ✎ Edit teams (name, end, formation,
//                                     line-up — everything in one dialog)
//
// The buttons live in football.html, hidden until the signed-in account
// is a monitor (subscribeAuth). Firestore rules are the real gate — see
// pitchMatches / pitchTeams in firestore.rules. The dialogs are built
// here, on first use, so students never download their markup.
//
// Drawing is football.js's job. This file gets the current data from
// getPitchState(), asks football.js to show edit controls with
// setMatchEditMode(), and reuses pitchMarkup() for the live preview.
// ============================================
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { describeWriteError } from "./error-utils.js";
import {
  playOpen, playClose, playSuccess, playError, playDelete, playClick,
  playToggleOn, playToggleOff,
} from "./sound.js";
import {
  PITCH_POSITIONS, POSITION_GROUPS, PITCH_ENDS, CLUBS, DEFAULT_FORMATION,
  escapeHtml, otherEnd, newPlayerId, parseFormation, isValidFormation, formationSlots,
  defaultCodeForSlot, retargetFormation, normalizePosition, OUTFIELD,
} from "./football-data.js";
import { getPitchState, setMatchEditMode, pitchMarkup } from "./football.js";

const $ = (id) => document.getElementById(id);
const MAX_PLAYERS = 16;

let isMonitor = false;
let matchEditing = false;

// ------------------------------------------------
// Errors
// ------------------------------------------------
// A permission error on the Pitch has one very likely cause that the
// shared message can't know about: the Pitch rules were added to
// firestore.rules after the rules were last published.
function pitchWriteError(err, verb) {
  if (err && err.code === "permission-denied") {
    return `Couldn't ${verb} that — Firestore blocked it. If homework and announcements still save for you, the Pitch rules haven't been published yet: paste the latest firestore.rules into Firebase console → Firestore → Rules and Publish. Otherwise sign out and back in.`;
  }
  return describeWriteError(err, verb);
}

// ------------------------------------------------
// Dialog plumbing
// ------------------------------------------------
function openOverlay(overlay, focusEl) {
  overlay.hidden = false;
  playOpen();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    overlay.classList.add("open");
    if (focusEl) focusEl.focus({ preventScroll: true });
  }));
}
function closeOverlay(overlay, { silent = false } = {}) {
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("open");
  if (!silent) playClose();
  setTimeout(() => { overlay.hidden = true; }, 220);
}

function makeOverlay(id, cardClass, inner) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay pitch-dialog";
  overlay.id = id;
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `<div class="modal-card ${cardClass}">
    <button class="modal-close" type="button" data-close aria-label="Close">✕</button>
    ${inner}
  </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

// ============================================================
// MATCHES
// ============================================================
let matchOverlay = null;
let editingMatchId = null;

function lastFridayISO() {
  const d = new Date();
  const back = (d.getDay() + 2) % 7; // Fri → 0, Sat → 1, … Thu → 6
  d.setDate(d.getDate() - back);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildMatchDialog() {
  if (matchOverlay) return matchOverlay;
  const { teams } = getPitchState();
  matchOverlay = makeOverlay("pitchMatchOverlay", "pitch-match-card", `
    <h3 id="pmTitle">Add match</h3>
    <p class="modal-sub" id="pmSub">Friday PE result.</p>
    <form id="pitchMatchForm" novalidate>
      <div class="pm-score">
        <label class="field pm-score-field pm-score-red">
          <span class="pm-team"><i class="pm-dot pm-dot-red"></i><b data-team-name="red">${escapeHtml(teams.red.name)}</b></span>
          <input type="number" name="redScore" inputmode="numeric" min="0" max="99" step="1" required>
        </label>
        <span class="pm-sep" aria-hidden="true">–</span>
        <label class="field pm-score-field pm-score-blue">
          <span class="pm-team"><i class="pm-dot pm-dot-blue"></i><b data-team-name="blue">${escapeHtml(teams.blue.name)}</b></span>
          <input type="number" name="blueScore" inputmode="numeric" min="0" max="99" step="1" required>
        </label>
      </div>
      <div class="task-form-grid pm-grid">
        <label class="field"><span>Date (optional)</span><input type="date" name="date"></label>
        <label class="field"><span>Note (optional)</span><input type="text" name="note" maxlength="80" placeholder="Injury-time winner, rematch, etc."></label>
      </div>
      <p class="auth-error" id="pmError" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary" id="pmSubmit"><span class="btn-label">Add match</span></button>
      </div>
    </form>`);

  matchOverlay.addEventListener("click", (e) => {
    if (e.target === matchOverlay || e.target.closest("[data-close]")) closeOverlay(matchOverlay);
  });
  matchOverlay.querySelector("form").addEventListener("submit", submitMatch);
  return matchOverlay;
}

function setMatchError(msg) {
  const el = $("pmError");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function openMatchDialog(match) {
  const overlay = buildMatchDialog();
  const { teams } = getPitchState();
  const f = overlay.querySelector("form");
  editingMatchId = match ? match.id : null;

  overlay.querySelectorAll("[data-team-name]").forEach((n) => { n.textContent = teams[n.dataset.teamName].name; });
  $("pmTitle").textContent = match ? "Edit match" : "Add match";
  $("pmSub").textContent = `${teams.red.name} vs ${teams.blue.name}, Friday PE.`;
  overlay.querySelector(".btn-label").textContent = match ? "Save changes" : "Add match";
  f.redScore.value = match ? match.redScore : 0;
  f.blueScore.value = match ? match.blueScore : 0;
  f.date.value = match ? (match.date || "") : lastFridayISO();
  f.note.value = match ? (match.note || "") : "";
  setMatchError(null);
  openOverlay(overlay, f.redScore);
  f.redScore.select();
}

async function submitMatch(e) {
  e.preventDefault();
  const f = e.target;
  const clamp = (v) => Math.min(99, Math.max(0, parseInt(v, 10) || 0));
  const payload = {
    redScore: clamp(f.redScore.value),
    blueScore: clamp(f.blueScore.value),
    date: f.date.value || null,
    note: f.note.value.trim(),
  };
  const { teams } = getPitchState();
  const label = `${teams.red.name} ${payload.redScore}–${payload.blueScore} ${teams.blue.name}`;
  const btn = $("pmSubmit");
  const labelEl = btn.querySelector(".btn-label");
  const original = labelEl.textContent;
  btn.disabled = true; labelEl.textContent = "Saving…";
  setMatchError(null);
  try {
    if (editingMatchId) {
      await updateDoc(doc(db, "pitchMatches", editingMatchId), payload);
      await logAction("updated", { resourceType: "pitchMatch", resourceId: editingMatchId, summary: `Updated match: ${label}` });
    } else {
      const ref = await addDoc(collection(db, "pitchMatches"), { ...payload, createdAtMs: Date.now(), createdAt: serverTimestamp() });
      await logAction("created", { resourceType: "pitchMatch", resourceId: ref.id, summary: `Logged match: ${label}` });
    }
    playSuccess();
    closeOverlay(matchOverlay, { silent: true });
  } catch (err) {
    console.error("[8CM] Save match failed:", err);
    playError();
    setMatchError(pitchWriteError(err, "save"));
  } finally {
    btn.disabled = false; labelEl.textContent = original;
  }
}

// Two taps to delete: the first arms the button, the second does it.
let armed = null;
function disarm() {
  if (!armed) return;
  clearTimeout(armed.timer);
  armed.btn.classList.remove("is-armed");
  armed.btn.textContent = "✕";
  armed.btn.setAttribute("aria-label", "Delete this match");
  armed = null;
}

async function onMatchAction(e) {
  if (!isMonitor) return;
  const { action, id, button } = e.detail || {};
  const match = getPitchState().matches.find((m) => m.id === id);
  if (!match) return;

  if (action === "edit") { disarm(); playClick(); openMatchDialog(match); return; }
  if (action !== "delete") return;

  if (!armed || armed.id !== id) {
    disarm();
    button.classList.add("is-armed");
    button.textContent = "Delete?";
    button.setAttribute("aria-label", "Tap again to delete this match");
    armed = { id, btn: button, timer: setTimeout(disarm, 3500) };
    playClick();
    return;
  }
  disarm();
  const { teams } = getPitchState();
  const label = `${teams.red.name} ${match.redScore}–${match.blueScore} ${teams.blue.name}`;
  try {
    await deleteDoc(doc(db, "pitchMatches", id));
    await logAction("deleted", { resourceType: "pitchMatch", resourceId: id, summary: `Deleted match: ${label}` });
    playDelete();
  } catch (err) {
    console.error("[8CM] Delete match failed:", err);
    playError();
    alert(pitchWriteError(err, "delete"));
  }
}

function toggleMatchEdit() {
  matchEditing = !matchEditing;
  disarm();
  const btn = $("pitchMatchEditBtn");
  if (btn) {
    btn.classList.toggle("is-on", matchEditing);
    btn.setAttribute("aria-pressed", String(matchEditing));
    btn.setAttribute("title", matchEditing ? "Done editing" : "Edit matches");
  }
  setMatchEditMode(matchEditing);
  if (matchEditing) playToggleOn(); else playToggleOff();
}

// ============================================================
// TEAMS
// ============================================================
let teamOverlay = null;
let draft = null;      // { red, blue } working copies
let original = null;   // JSON of each team as loaded, to spot changes
let activeTeam = "red";

const clone = (o) => JSON.parse(JSON.stringify(o));

function cleanTeam(t) {
  const players = (t.players || [])
    .map((p) => ({ ...p, name: String(p.name || "").trim().slice(0, 30) }))
    .filter((p) => p.name);
  const formation = isValidFormation(t.formation) ? t.formation : DEFAULT_FORMATION;
  const validSlots = new Set(formationSlots(formation).map((sl) => sl.slot));
  return {
    name: String(t.name || "").trim().slice(0, 24) || CLUBS[t.id].name,
    end: t.end,
    formation,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      position: normalizePosition(p.position),
      slot: p.slot != null && validSlots.has(Number(p.slot)) ? Number(p.slot) : null,
    })),
  };
}

const snapshotOf = (t) => JSON.stringify(cleanTeam(t));
const isDirty = () => ["red", "blue"].some((id) => snapshotOf(draft[id]) !== original[id]);

function positionOptions(selected) {
  const sel = normalizePosition(selected);
  return POSITION_GROUPS.map((g) => `<optgroup label="${escapeHtml(g.label)}">${
    g.codes.map((c) => `<option value="${c}"${c === sel ? " selected" : ""}>${c} · ${escapeHtml(PITCH_POSITIONS[c])}</option>`).join("")
  }</optgroup>`).join("");
}

const FLIP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h9a5 5 0 0 1 5 5v1"/><path d="M16 21l4-4-4-4"/><path d="M20 17h-9a5 5 0 0 1-5-5v-1"/></svg>`;

let previewFlipped = false;

function slotPlayer(team, slot) {
  return (team.players || []).find((p) => p.slot === slot) || null;
}

// Heading for each line of the formation in the line-up list.
function lineHeadings(formation) {
  const lines = parseFormation(formation) || [];
  const mids = lines.length - 2;
  return lines.map((n, i) => {
    if (i === 0) return `Defence · ${n}`;
    if (i === lines.length - 1) return `Attack · ${n}`;
    if (mids >= 2) return `${i === 1 ? "Defensive midfield" : "Attacking midfield"} · ${n}`;
    return `Midfield · ${n}`;
  });
}

function playerRowsFormation(t) {
  const slots = formationSlots(t.formation);
  const headings = lineHeadings(t.formation);
  let html = "";
  let lastLine = -2;
  slots.forEach((s) => {
    if (s.line !== lastLine) {
      lastLine = s.line;
      html += `<li class="pe-line">${s.line < 0 ? "Goalkeeper" : escapeHtml(headings[s.line])}</li>`;
    }
    const p = slotPlayer(t, s.slot);
    html += `<li class="pe-row" data-slot="${s.slot}">
      <input type="text" class="pe-name" data-f="name" maxlength="30" autocomplete="off" placeholder="Player name"
        aria-label="${escapeHtml(s.code)} player name" value="${escapeHtml(p ? p.name : "")}">
      <select class="pe-pos" data-f="pos" aria-label="Position">${positionOptions(p ? p.position : s.code)}</select>
    </li>`;
  });
  return html;
}

function extraRow(p) {
  return `<li class="pe-row pe-row-extra" data-pid="${escapeHtml(p.id)}">
    <input type="text" class="pe-name" data-f="name" maxlength="30" autocomplete="off" placeholder="Player name" aria-label="Player name" value="${escapeHtml(p.name)}">
    <select class="pe-pos" data-f="pos" aria-label="Position">${positionOptions(p.position)}</select>
    <button type="button" class="task-icon-btn task-icon-btn-danger pe-remove" data-act="remove" aria-label="Remove player">✕</button>
  </li>`;
}

function playersSection(t) {
  const total = (t.players || []).length;
  const full = total >= MAX_PLAYERS;
  const subs = (t.players || []).filter((p) => p.slot == null);
  return `
    <p class="pe-label">Line-up <span class="pe-hint">Leave a spot empty if nobody is playing there.</span></p>
    <ul class="pe-rows" id="peRows">${playerRowsFormation(t)}</ul>
    <p class="pe-label pe-label-subs">Substitutes</p>
    <ul class="pe-rows" id="peSubs">${subs.map(extraRow).join("")}</ul>
    <button type="button" class="btn btn-ghost btn-small pe-add" data-act="add-sub"${full ? " disabled" : ""}>+ Add substitute</button>`;
}

// The monitor types "D-M-F" or "D-M-M-F" (2 to 4 numbers, GK not
// included) and it's validated live against OUTFIELD (10) below.
function formationFieldMarkup(t) {
  const ok = isValidFormation(t.formation);
  return `
    <div class="pe-formation-field">
      <input type="text" class="pe-formation-input" id="peFormationInput" inputmode="numeric"
        autocomplete="off" maxlength="9" placeholder="e.g. 4-3-3" value="${escapeHtml(t.formation)}"
        aria-label="Formation" aria-invalid="${ok ? "false" : "true"}">
      <span class="pe-formation-status${ok ? " is-ok" : " is-bad"}">${ok ? "✓" : `Add up to ${OUTFIELD}`}</span>
    </div>
    <p class="pe-hint pe-formation-hint">2–4 numbers (defence first, attack last), keeper not counted, adding up to ${OUTFIELD}. Positions — CB, CDM, CAM, CF and so on — fill in on their own from the shape.</p>`;
}

function renderTeamBody() {
  previewFlipped = false;
  const t = draft[activeTeam];
  $("peTabs").querySelectorAll(".pe-tab").forEach((b) => {
    const on = b.dataset.team === activeTeam;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", String(on));
    const nameEl = b.querySelector(".pe-tab-name");
    if (nameEl) nameEl.textContent = String(draft[b.dataset.team].name || "").trim() || CLUBS[b.dataset.team].name;
  });
  $("peBody").dataset.team = activeTeam;
  $("peBody").innerHTML = `
    <div class="pe-grid">
      <label class="field"><span>Team name</span><input type="text" data-f="teamName" maxlength="24" autocomplete="off" value="${escapeHtml(t.name)}"></label>
      <label class="field"><span>Defending</span>
        <select data-f="end">${Object.entries(PITCH_ENDS).map(([k, l]) => `<option value="${k}"${k === t.end ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
      </label>
    </div>
    <p class="pe-label">Formation</p>
    ${formationFieldMarkup(t)}
    <div class="pe-preview-head">
      <button type="button" class="task-icon-btn pe-flip" id="peFlip" aria-pressed="false" aria-label="Flip the field view" title="Flip the field view">${FLIP_ICON}</button>
    </div>
    <div class="pe-preview" id="pePreview">${pitchMarkup(activeTeam, cleanTeam2(t), { flip: previewFlipped })}</div>
    <div class="pe-players" id="pePlayers">${playersSection(t)}</div>`;
  updateFooter();
}

// pitchMarkup wants a full team object
const cleanTeam2 = (t) => ({ ...t, ...cleanTeam(t) });

function refreshPreview() {
  const box = $("pePreview");
  if (box) box.innerHTML = pitchMarkup(activeTeam, cleanTeam2(draft[activeTeam]), { flip: previewFlipped });
  updateFooter();
}

function updateFooter() {
  const dirty = isDirty();
  const flag = $("peDirty");
  if (flag) flag.hidden = !dirty;
  const save = $("peSave");
  if (save) save.disabled = !dirty;
}

function setTeamError(msg) {
  const el = $("peError");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function buildTeamDialog() {
  if (teamOverlay) return teamOverlay;
  teamOverlay = makeOverlay("pitchEditorOverlay", "pitch-editor-card", `
    <h3 id="peTitle">Edit teams</h3>
    <p class="modal-sub">Names, ends, formations and line-ups for both teams. Nothing changes for everyone else until you save.</p>
    <div class="pe-tabs" id="peTabs" role="tablist" aria-label="Team">
      <button type="button" class="pe-tab" role="tab" data-team="red"><i class="pm-dot pm-dot-red"></i><span class="pe-tab-name"></span></button>
      <button type="button" class="pe-tab" role="tab" data-team="blue"><i class="pm-dot pm-dot-blue"></i><span class="pe-tab-name"></span></button>
    </div>
    <div class="pe-body" id="peBody"></div>
    <p class="auth-error" id="peError" hidden></p>
    <div class="pe-footer">
      <span class="pe-dirty" id="peDirty" hidden>Unsaved changes</span>
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" id="peSave" disabled><span class="btn-label">Save teams</span></button>
    </div>`);
  teamOverlay.setAttribute("aria-labelledby", "peTitle");

  teamOverlay.addEventListener("click", (e) => {
    if (e.target === teamOverlay || e.target.closest("[data-close]")) requestCloseTeams();
  });

  $("peTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".pe-tab");
    if (!tab || tab.dataset.team === activeTeam) return;
    activeTeam = tab.dataset.team;
    playClick();
    renderTeamBody();
  });

  const body = $("peBody");
  body.addEventListener("input", onBodyInput);
  body.addEventListener("change", onBodyChange);
  body.addEventListener("click", onBodyClick);
  $("peSave").addEventListener("click", saveTeams);

  return teamOverlay;
}

function rowContext(el) {
  const row = el.closest(".pe-row");
  if (!row) return null;
  const t = draft[activeTeam];
  if (row.dataset.slot !== undefined) {
    const slot = Number(row.dataset.slot);
    let p = slotPlayer(t, slot);
    return { row, get: () => p, ensure: () => {
      if (!p) {
        p = { id: newPlayerId(), name: "", position: defaultCodeForSlot(t.formation, slot), slot };
        t.players.push(p);
      }
      return p;
    } };
  }
  const p = t.players.find((x) => x.id === row.dataset.pid);
  return p ? { row, get: () => p, ensure: () => p } : null;
}

function onBodyInput(e) {
  const t = draft[activeTeam];
  const f = e.target.dataset.f;
  if (f === "teamName") {
    t.name = e.target.value;
    const tabName = $("peTabs").querySelector(`.pe-tab[data-team="${activeTeam}"] .pe-tab-name`);
    if (tabName) tabName.textContent = t.name.trim() || CLUBS[activeTeam].name;
    updateFooter();
    return;
  }
  if (f === "name") {
    const ctx = rowContext(e.target);
    if (!ctx) return;
    const p = ctx.get();
    if (!p && !e.target.value.trim()) return;
    ctx.ensure().name = e.target.value;
    refreshPreview();
    return;
  }
  if (e.target.id === "peFormationInput") {
    const ok = isValidFormation(e.target.value);
    e.target.setAttribute("aria-invalid", ok ? "false" : "true");
    const status = $("peBody").querySelector(".pe-formation-status");
    if (status) {
      status.classList.toggle("is-ok", ok);
      status.classList.toggle("is-bad", !ok);
      status.textContent = ok ? "✓" : `Add up to ${OUTFIELD}`;
    }
  }
}

function onBodyChange(e) {
  const t = draft[activeTeam];
  const f = e.target.dataset.f;
  if (f === "end") {
    t.end = e.target.value;
    // Two teams can't defend the same end — flip the other one.
    const other = draft[activeTeam === "red" ? "blue" : "red"];
    if (other.end === t.end) other.end = otherEnd(t.end);
    refreshPreview();
    return;
  }
  if (f === "pos") {
    const ctx = rowContext(e.target);
    if (!ctx) return;
    ctx.ensure().position = e.target.value;
    refreshPreview();
    return;
  }
  if (e.target.id === "peFormationInput") {
    const val = e.target.value.trim();
    if (isValidFormation(val)) setFormation(val);
    else e.target.value = t.formation; // snap back to the last valid shape
  }
}

function setFormation(next) {
  const t = draft[activeTeam];
  if (next === t.formation) return;
  const named = t.players.filter((p) => String(p.name || "").trim());
  t.players = retargetFormation(named, t.formation, next);
  t.formation = next;
  playClick();
  const keepFlip = previewFlipped;
  renderTeamBody();
  previewFlipped = keepFlip;
  refreshPreview();
}

function onBodyClick(e) {
  const t = draft[activeTeam];
  if (e.target.closest("#peFlip")) {
    previewFlipped = !previewFlipped;
    $("peFlip").setAttribute("aria-pressed", String(previewFlipped));
    playClick();
    refreshPreview();
    return;
  }

  const act = e.target.closest("[data-act]");
  if (!act) return;
  const kind = act.dataset.act;

  if (kind === "add" || kind === "add-sub") {
    if (t.players.length >= MAX_PLAYERS) return;
    t.players.push({ id: newPlayerId(), name: "", position: "CM", slot: null });
    playClick();
    $("pePlayers").innerHTML = playersSection(t);
    const rows = $("pePlayers").querySelectorAll(".pe-row-extra .pe-name");
    if (rows.length) rows[rows.length - 1].focus();
    updateFooter();
    return;
  }
  if (kind === "remove") {
    const ctx = rowContext(act);
    if (!ctx) return;
    t.players = t.players.filter((p) => p.id !== ctx.get().id);
    playClick();
    $("pePlayers").innerHTML = playersSection(t);
    refreshPreview();
  }
}

function openTeamDialog() {
  const { teams } = getPitchState();
  draft = { red: clone(teams.red), blue: clone(teams.blue) };
  original = { red: snapshotOf(draft.red), blue: snapshotOf(draft.blue) };
  activeTeam = "red";
  const overlay = buildTeamDialog();
  setTeamError(null);
  renderTeamBody();
  openOverlay(overlay, overlay.querySelector(".pe-tab.is-active"));
}

function requestCloseTeams() {
  if (isDirty() && !confirm("Discard your changes to the teams?")) return;
  closeOverlay(teamOverlay);
}

async function saveTeams() {
  const btn = $("peSave");
  const label = btn.querySelector(".btn-label");
  const before = label.textContent;
  btn.disabled = true; label.textContent = "Saving…";
  setTeamError(null);
  try {
    const writes = [];
    const saved = [];
    ["red", "blue"].forEach((id) => {
      if (snapshotOf(draft[id]) === original[id]) return;
      const data = cleanTeam(draft[id]);
      saved.push({ id, data });
      writes.push(setDoc(doc(db, "pitchTeams", id), data, { merge: true }));
    });
    await Promise.all(writes);
    for (const { id, data } of saved) {
      await logAction("updated", { resourceType: "pitchTeam", resourceId: id, summary: `Updated team: ${data.name} (${data.formation}, ${data.players.length} players)` });
    }
    playSuccess();
    original = { red: snapshotOf(draft.red), blue: snapshotOf(draft.blue) };
    closeOverlay(teamOverlay, { silent: true });
  } catch (err) {
    console.error("[8CM] Save teams failed:", err);
    playError();
    setTeamError(pitchWriteError(err, "save"));
  } finally {
    label.textContent = before;
    updateFooter();
  }
}

// ============================================================
// Init
// ============================================================
export function initFootballManagement() {
  const tools = $("pitchMatchTools");
  const editTeams = $("pitchEditTeamsBtn");
  if (!tools && !editTeams) return; // not the Pitch page

  const apply = (monitor) => {
    isMonitor = !!monitor;
    if (tools) tools.hidden = !isMonitor;
    if (editTeams) editTeams.hidden = !isMonitor;
    if (!isMonitor && matchEditing) toggleMatchEdit();
  };
  apply(false);
  subscribeAuth(({ monitor }) => apply(monitor));

  const addBtn = $("pitchAddMatchBtn");
  if (addBtn) addBtn.addEventListener("click", () => { if (isMonitor) openMatchDialog(null); });
  const editBtn = $("pitchMatchEditBtn");
  if (editBtn) editBtn.addEventListener("click", () => { if (isMonitor) toggleMatchEdit(); });
  if (editTeams) editTeams.addEventListener("click", () => { if (isMonitor) openTeamDialog(); });

  document.addEventListener("pitch:match-action", onMatchAction);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (teamOverlay && !teamOverlay.hidden) requestCloseTeams();
    else if (matchOverlay && !matchOverlay.hidden) closeOverlay(matchOverlay);
  });
}
