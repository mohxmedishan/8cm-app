// ============================================
// 8CM — Pitch management (monitor-only UI)
// ------------------------------------------------
// Builds its own markup into a couple of empty containers in
// manage.html (#pitchMatchManageList, #pitchTeamManageWrap) rather
// than having every field hand-written there — there are two teams,
// each with an open-ended player list and a click-to-place formation
// picker, which doesn't fit the usual static <form> pattern used by
// the other manage panels.
// ============================================
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { subscribeAuth } from "./auth.js";
import { logAction } from "./audit.js";
import { describeWriteError } from "./error-utils.js";
import { playOpen, playClose, playSuccess, playError, playDelete, playClick } from "./sound.js";
import {
  PITCH_POSITIONS, PITCH_ENDS, SEED_TEAMS, escapeHtml, formatMatchDate,
  otherEnd, newPlayerId,
} from "./football-data.js";

const $ = (id) => document.getElementById(id);

let isCurrentMonitor = false;
let matches = null;
let teams = { red: null, blue: null };
let editingMatchId = null;
let editingPlayer = { red: null, blue: null }; // player being added/edited, per team
let pendingPos = { red: null, blue: null };    // {x,y} picked on the mini pitch, per team

function teamWithFallback(id) {
  return teams[id] || SEED_TEAMS[id];
}

// ------------------------------------------------
// Match history — list
// ------------------------------------------------
function renderMatchList() {
  const list = $("pitchMatchManageList");
  if (!list) return;
  if (!isCurrentMonitor) {
    list.innerHTML = `<p class="task-empty">Only monitors can manage the Pitch.</p>`;
    return;
  }
  if (matches === null) {
    list.innerHTML = `<div class="task-loading"><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-dot"></span><span class="task-loading-label">Loading matches…</span></div>`;
    return;
  }
  if (!matches.length) {
    list.innerHTML = `<p class="task-empty">No matches logged yet.</p>`;
    return;
  }
  list.innerHTML = matches.map((m) => `
    <div class="manage-row">
      <div class="manage-row-body">
        <p class="task-subject">Red ${m.redScore} – ${m.blueScore} Blue</p>
        <p class="task-detail">${escapeHtml(formatMatchDate(m.date))}${m.note ? ` · ${escapeHtml(m.note)}` : ""}</p>
      </div>
      <div class="task-monitor-actions">
        <button class="task-icon-btn" data-action="edit-match" data-id="${escapeHtml(m.id)}" aria-label="Edit match">✎</button>
        <button class="task-icon-btn task-icon-btn-danger" data-action="delete-match" data-id="${escapeHtml(m.id)}" aria-label="Delete match">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll('[data-action="edit-match"]').forEach((b) =>
    b.addEventListener("click", () => openMatchForm(matches.find((m) => m.id === b.dataset.id))));
  list.querySelectorAll('[data-action="delete-match"]').forEach((b) =>
    b.addEventListener("click", () => handleDeleteMatch(b.dataset.id)));
}

function openMatchForm(match) {
  const f = $("pitchMatchForm");
  if (!f) return;
  editingMatchId = match ? match.id : null;
  f.redScore.value = match?.redScore ?? 0;
  f.blueScore.value = match?.blueScore ?? 0;
  f.date.value = match?.date || "";
  f.note.value = match?.note || "";
  setMatchFormError(null);
  f.hidden = false;
  f.querySelector('button[type="submit"]').textContent = match ? "Save changes" : "Add match";
  playOpen();
  f.redScore.focus();
}
function closeMatchForm({ silent = false } = {}) {
  const f = $("pitchMatchForm");
  if (!f) return;
  f.reset(); f.hidden = true; editingMatchId = null; setMatchFormError(null);
  if (!silent) playClose();
}
function setMatchFormError(msg) {
  const el = $("pitchMatchFormError");
  if (!el) return;
  el.hidden = !msg; el.textContent = msg || "";
}

async function handleMatchSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const payload = {
    redScore: Math.max(0, parseInt(f.redScore.value, 10) || 0),
    blueScore: Math.max(0, parseInt(f.blueScore.value, 10) || 0),
    date: f.date.value || null,
    note: f.note.value.trim(),
  };
  const btn = f.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = "Saving…";
  setMatchFormError(null);
  try {
    if (editingMatchId) {
      await updateDoc(doc(db, "pitchMatches", editingMatchId), payload);
      await logAction("updated", { resourceType: "pitchMatch", resourceId: editingMatchId, summary: `Updated match: Red ${payload.redScore}–${payload.blueScore} Blue` });
    } else {
      const ref = await addDoc(collection(db, "pitchMatches"), { ...payload, createdAtMs: Date.now(), createdAt: serverTimestamp() });
      await logAction("created", { resourceType: "pitchMatch", resourceId: ref.id, summary: `Logged match: Red ${payload.redScore}–${payload.blueScore} Blue` });
    }
    playSuccess();
    closeMatchForm({ silent: true });
  } catch (err) {
    console.error("[8CM] Save match failed:", err);
    playError();
    setMatchFormError(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

async function handleDeleteMatch(id) {
  const m = matches.find((x) => x.id === id);
  if (!m) return;
  if (!confirm(`Delete the Red ${m.redScore}–${m.blueScore} Blue match?`)) return;
  try {
    await deleteDoc(doc(db, "pitchMatches", id));
    await logAction("deleted", { resourceType: "pitchMatch", resourceId: id, summary: `Deleted match: Red ${m.redScore}–${m.blueScore} Blue` });
    playDelete();
  } catch (err) {
    console.error("[8CM] Delete match failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

// ------------------------------------------------
// Teams & players
// ------------------------------------------------
function positionOptions(selected) {
  return Object.entries(PITCH_POSITIONS).map(([k, label]) =>
    `<option value="${k}"${k === selected ? " selected" : ""}>${escapeHtml(label)} (${k})</option>`).join("");
}
function endOptions(selected) {
  return Object.entries(PITCH_ENDS).map(([k, label]) =>
    `<option value="${k}"${k === selected ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function placerDots(id) {
  const t = teamWithFallback(id);
  const pending = pendingPos[id];
  const editing = editingPlayer[id];
  let dots = (t.players || [])
    .filter((p) => !editing || p.id !== editing.id)
    .map((p) => `<div class="pitch-dot pitch-dot-ghost" style="left:${p.x}%; top:${p.y}%"><span class="pitch-dot-mark"></span></div>`)
    .join("");
  if (pending) {
    dots += `<div class="pitch-dot pitch-dot-pending" style="left:${pending.x}%; top:${pending.y}%"><span class="pitch-dot-mark"></span></div>`;
  }
  return dots;
}

function teamEditorBlock(id) {
  const t = teamWithFallback(id);
  const players = t.players || [];
  const editing = editingPlayer[id];
  const pending = pendingPos[id] || (editing ? { x: editing.x, y: editing.y } : null);

  return `
  <div class="pitch-team-editor" data-team="${id}">
    <div class="pitch-team-editor-head">
      <h4>${escapeHtml(t.name)} <span class="pitch-team-dot pitch-team-dot-${id}"></span></h4>
    </div>
    <div class="task-form-grid">
      <label class="field"><span>Team name</span><input type="text" data-field="name" value="${escapeHtml(t.name)}" maxlength="24"></label>
      <label class="field"><span>Defending end</span><select data-field="end">${endOptions(t.end)}</select></label>
    </div>
    <button type="button" class="btn btn-ghost btn-small" data-action="save-team">Save team</button>

    <p class="pitch-placer-hint">Tap the half-pitch to place the next player, then fill in their name and position below.</p>
    <div class="pitch-half pitch-half-${id} pitch-placer" data-placer>
      <div class="pitch-half-label">${escapeHtml(PITCH_ENDS[t.end] || "")}</div>
      ${placerDots(id)}
      <div class="pitch-goal"></div>
    </div>

    <form class="task-form pitch-player-form" data-player-form>
      <div class="task-form-grid">
        <label class="field field-wide"><span>Player name</span><input type="text" name="name" required maxlength="30" value="${editing ? escapeHtml(editing.name || "") : ""}"></label>
        <label class="field"><span>Position</span><select name="position">${positionOptions(editing?.position || "MF")}</select></label>
        <label class="field"><span>X %</span><input type="number" name="x" min="0" max="100" value="${pending ? Math.round(pending.x) : 50}"></label>
        <label class="field"><span>Y %</span><input type="number" name="y" min="0" max="100" value="${pending ? Math.round(pending.y) : 50}"></label>
      </div>
      <div class="task-form-actions">
        ${editing ? `<button type="button" class="btn btn-ghost btn-small" data-action="cancel-player">Cancel edit</button>` : ""}
        <button type="submit" class="btn btn-add-task btn-small">${editing ? "Save player" : "Add player"}</button>
      </div>
    </form>

    <div class="task-list pitch-player-manage-list">
      ${players.length ? players.map((p) => `
        <div class="manage-row">
          <span class="pitch-pos-tag pitch-pos-${escapeHtml(p.position || "MF")}">${escapeHtml(p.position || "MF")}</span>
          <div class="manage-row-body"><p class="task-subject">${escapeHtml(p.name || "Unnamed")}</p></div>
          <div class="task-monitor-actions">
            <button class="task-icon-btn" data-action="edit-player" data-id="${escapeHtml(p.id)}" aria-label="Edit player">✎</button>
            <button class="task-icon-btn task-icon-btn-danger" data-action="delete-player" data-id="${escapeHtml(p.id)}" aria-label="Delete player">✕</button>
          </div>
        </div>`).join("") : `<p class="task-empty">No players yet.</p>`}
    </div>
  </div>`;
}

function renderTeamEditors() {
  const wrap = $("pitchTeamManageWrap");
  if (!wrap) return;
  if (!isCurrentMonitor) {
    wrap.innerHTML = `<p class="task-empty">Only monitors can manage the Pitch.</p>`;
    return;
  }
  wrap.innerHTML = `<div class="pitch-team-editors">${teamEditorBlock("red")}${teamEditorBlock("blue")}</div>`;
  wireTeamEditor("red");
  wireTeamEditor("blue");
}

function wireTeamEditor(id) {
  const wrap = $("pitchTeamManageWrap");
  const block = wrap?.querySelector(`.pitch-team-editor[data-team="${id}"]`);
  if (!block) return;

  block.querySelector('[data-action="save-team"]').addEventListener("click", () => handleSaveTeam(id, block));

  const placer = block.querySelector("[data-placer]");
  placer.addEventListener("click", (e) => {
    const rect = placer.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    pendingPos[id] = { x, y };
    const form = block.querySelector("[data-player-form]");
    form.x.value = Math.round(x);
    form.y.value = Math.round(y);
    playClick();
    renderTeamEditors();
  });

  const form = block.querySelector("[data-player-form]");
  form.addEventListener("submit", (e) => handlePlayerSubmit(e, id));
  const cancelBtn = block.querySelector('[data-action="cancel-player"]');
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    editingPlayer[id] = null;
    pendingPos[id] = null;
    renderTeamEditors();
  });

  block.querySelectorAll('[data-action="edit-player"]').forEach((b) => b.addEventListener("click", () => {
    const p = (teamWithFallback(id).players || []).find((x) => x.id === b.dataset.id);
    if (!p) return;
    editingPlayer[id] = p;
    pendingPos[id] = { x: p.x, y: p.y };
    renderTeamEditors();
  }));
  block.querySelectorAll('[data-action="delete-player"]').forEach((b) => b.addEventListener("click", () => handleDeletePlayer(id, b.dataset.id)));
}

async function handleSaveTeam(id, block) {
  const name = block.querySelector('[data-field="name"]').value.trim() || (id === "red" ? "Red" : "Blue");
  const end = block.querySelector('[data-field="end"]').value;
  const btn = block.querySelector('[data-action="save-team"]');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const other = id === "red" ? "blue" : "red";
    const otherTeam = teamWithFallback(other);
    const writes = [setDoc(doc(db, "pitchTeams", id), { name, end }, { merge: true })];
    // Two teams can't share an end — if this save collides with the
    // other team's current end, flip the other team to keep the pitch
    // consistent instead of silently leaving two teams on one side.
    if (otherTeam.end === end) {
      writes.push(setDoc(doc(db, "pitchTeams", other), { end: otherEnd(end) }, { merge: true }));
    }
    await Promise.all(writes);
    await logAction("updated", { resourceType: "pitchTeam", resourceId: id, summary: `Updated team: ${name}` });
    playSuccess();
  } catch (err) {
    console.error("[8CM] Save team failed:", err);
    playError();
    alert(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

async function handlePlayerSubmit(e, id) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  if (!name) return;
  const editing = editingPlayer[id];
  const pos = pendingPos[id] || { x: Number(form.x.value) || 50, y: Number(form.y.value) || 50 };
  const player = {
    id: editing ? editing.id : newPlayerId(),
    name,
    position: form.position.value,
    x: Math.min(100, Math.max(0, Number(form.x.value) || pos.x)),
    y: Math.min(100, Math.max(0, Number(form.y.value) || pos.y)),
  };
  const t = teamWithFallback(id);
  const current = t.players || [];
  const nextPlayers = editing
    ? current.map((p) => (p.id === editing.id ? player : p))
    : [...current, player];

  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await setDoc(doc(db, "pitchTeams", id), { players: nextPlayers }, { merge: true });
    await logAction(editing ? "updated" : "created", { resourceType: "pitchPlayer", resourceId: player.id, summary: `${editing ? "Updated" : "Added"} player: ${name} (${t.name})` });
    playSuccess();
    editingPlayer[id] = null;
    pendingPos[id] = null;
  } catch (err) {
    console.error("[8CM] Save player failed:", err);
    playError();
    alert(describeWriteError(err, "save"));
  } finally {
    btn.disabled = false; btn.textContent = original;
    renderTeamEditors();
  }
}

async function handleDeletePlayer(id, playerId) {
  const t = teamWithFallback(id);
  const player = (t.players || []).find((p) => p.id === playerId);
  if (!player) return;
  if (!confirm(`Remove ${player.name} from ${t.name}?`)) return;
  try {
    const nextPlayers = (t.players || []).filter((p) => p.id !== playerId);
    await setDoc(doc(db, "pitchTeams", id), { players: nextPlayers }, { merge: true });
    await logAction("deleted", { resourceType: "pitchPlayer", resourceId: playerId, summary: `Removed player: ${player.name} (${t.name})` });
    playDelete();
    if (editingPlayer[id]?.id === playerId) { editingPlayer[id] = null; pendingPos[id] = null; }
  } catch (err) {
    console.error("[8CM] Delete player failed:", err);
    playError();
    alert(describeWriteError(err, "delete"));
  }
}

// ------------------------------------------------
// Sub-tabs (Match history / Teams & players)
// ------------------------------------------------
function initSubTabs() {
  const tabs = $("pitchManageSubTabs");
  if (!tabs) return;
  tabs.querySelectorAll(".pill").forEach((tab) => tab.addEventListener("click", () => {
    tabs.querySelectorAll(".pill").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".pitch-manage-section").forEach((s) =>
      s.hidden = s.dataset.subPanel !== tab.dataset.sub);
    playClick();
  }));
}

// ------------------------------------------------
// Init
// ------------------------------------------------
export function initFootballManagement() {
  if (!$("pitchMatchManageList") && !$("pitchTeamManageWrap")) return;
  initSubTabs();

  const q = query(collection(db, "pitchMatches"), orderBy("createdAtMs", "desc"));
  onSnapshot(q, (snap) => {
    matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMatchList();
  }, (err) => {
    console.error("[8CM] Failed to load pitch matches:", err);
    if (matches === null) matches = [];
    renderMatchList();
  });

  ["red", "blue"].forEach((id) => {
    onSnapshot(doc(db, "pitchTeams", id), (snap) => {
      teams[id] = snap.exists() ? { ...SEED_TEAMS[id], ...snap.data(), id } : { ...SEED_TEAMS[id] };
      renderTeamEditors();
    }, (err) => {
      console.error("[8CM] Failed to load pitch team:", id, err);
      teams[id] = { ...SEED_TEAMS[id] };
      renderTeamEditors();
    });
  });

  subscribeAuth(({ monitor }) => {
    isCurrentMonitor = monitor;
    const addBtn = $("addPitchMatchBtn");
    if (addBtn) addBtn.hidden = !monitor;
    renderMatchList();
    renderTeamEditors();
  });

  const addBtn = $("addPitchMatchBtn");
  if (addBtn) addBtn.addEventListener("click", () => openMatchForm(null));
  const form = $("pitchMatchForm");
  if (form) {
    form.addEventListener("submit", handleMatchSubmit);
    const cancelBtn = form.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeMatchForm());
  }
}
