// ============================================
// 8CM — Pitch (football) shared data + layout maths
// ------------------------------------------------
// Constants, team defaults and the formation layout engine shared by
// the public display (football.js) and the monitor-only editor
// (football-manage.js). Nothing in here touches the DOM or Firebase.
//
// Matches are always Red vs Blue, always Friday P3 (PE) — see
// archives.html's timetable. Red is Barça, Blue is Madrid: the colours
// (and the Firestore doc ids "red" / "blue") are fixed, the names and
// logos are the club identity shown on top of them.
//
// A team doc (pitchTeams/{red|blue}) looks like:
//   {
//     name: "Barça",
//     end: "auditorium" | "kindergarten",
//     formation: "2-3-1" | "1-2-2-1" | … | "free",
//     players: [{ id, name, position: "CB", slot: 3 }, …]
//   }
// `slot` is where the player stands in the formation (0 = keeper, then
// each line left to right). No slot = substitute. In "free" play the
// slots are ignored and every player is placed by their position code.
// ============================================

// ------------------------------------------------
// Positions
// ------------------------------------------------
export const POSITION_GROUPS = [
  { key: "GK",  label: "Goalkeeper",  codes: ["GK"] },
  { key: "DEF", label: "Defenders",   codes: ["CB", "LB", "RB"] },
  { key: "MID", label: "Midfielders", codes: ["CDM", "CM", "CAM"] },
  { key: "FWD", label: "Forwards",    codes: ["CF", "RW", "LW", "SS"] },
];

export const PITCH_POSITIONS = {
  GK: "Goalkeeper",
  CB: "Centre-back", LB: "Left-back", RB: "Right-back",
  CDM: "Defensive midfielder", CM: "Central midfielder", CAM: "Attacking midfielder",
  CF: "Centre-forward", RW: "Right winger", LW: "Left winger", SS: "Second striker",
};

// Old saves used four broad roles. Map them so nothing breaks.
const LEGACY_POSITIONS = { DF: "CB", MF: "CM", FW: "CF" };

export function normalizePosition(code) {
  const c = String(code || "").toUpperCase();
  if (PITCH_POSITIONS[c]) return c;
  return LEGACY_POSITIONS[c] || "CM";
}

export function positionGroup(code) {
  const c = normalizePosition(code);
  const g = POSITION_GROUPS.find((x) => x.codes.includes(c));
  return g ? g.key : "MID";
}

// ------------------------------------------------
// Ends of the pitch
// ------------------------------------------------
export const PITCH_ENDS = {
  auditorium: "Auditorium end",
  kindergarten: "Kindergarten end",
};

export function otherEnd(end) {
  return end === "auditorium" ? "kindergarten" : "auditorium";
}

// ------------------------------------------------
// Ids
// ------------------------------------------------
export function newPlayerId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newMatchId() {
  return `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ------------------------------------------------
// Clubs: the identity on top of the two fixed colours
// ------------------------------------------------
export const CLUBS = {
  red:  { id: "red",  name: "Barça",  logo: "assets/BARCA.png" },
  blue: { id: "blue", name: "Madrid", logo: "assets/RAM.png" },
};

// The first version of the Pitch page called the teams "Red" and "Blue".
// Anyone who saved a team back then still has those names in Firestore.
const OLD_DEFAULT_NAMES = { red: "red", blue: "blue" };

// ------------------------------------------------
// Formations
// ------------------------------------------------
// A monitor types any formation as "D-M-F" or "D-M-M-F" (2 to 4
// numbers) — the classic outfield shape, GK not included. It has to
// add up to OUTFIELD (10, i.e. 10 outfield players + 1 keeper = 11 a
// side) or it's rejected. Positions are assigned automatically: the
// first line is defence, the last is attack, and anything in between
// is midfield (split into defensive/attacking mid once there's more
// than one middle line) — so the monitor never has to say "this one's
// a CDM", the formation says it for them.
export const OUTFIELD = 10;
export const MIN_LINES = 2;
export const MAX_LINES = 4;
export const MAX_PER_LINE = 6;

/** "4-3-3" etc → [4,3,3], or null if it isn't a valid formation. */
export function parseFormation(str) {
  if (typeof str !== "string") return null;
  const trimmed = str.trim();
  if (!/^\d+(-\d+){1,3}$/.test(trimmed)) return null;
  const lines = trimmed.split("-").map((n) => parseInt(n, 10));
  if (lines.length < MIN_LINES || lines.length > MAX_LINES) return null;
  if (lines.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PER_LINE)) return null;
  if (lines.reduce((a, b) => a + b, 0) !== OUTFIELD) return null;
  return lines;
}

export function isValidFormation(str) {
  return !!parseFormation(str);
}

export const DEFAULT_FORMATION = "4-3-3";

// Default position codes for a line, by how many stand in it.
const DEF_CODES = {
  1: ["CB"], 2: ["CB", "CB"], 3: ["LB", "CB", "RB"],
  4: ["LB", "CB", "CB", "RB"], 5: ["LB", "CB", "CB", "CB", "RB"], 6: ["LB", "CB", "CB", "CB", "CB", "RB"],
};
const FWD_CODES = {
  1: ["CF"], 2: ["LW", "RW"], 3: ["LW", "CF", "RW"],
  4: ["LW", "CF", "CF", "RW"], 5: ["LW", "CF", "CF", "CF", "RW"], 6: ["LW", "LW", "CF", "CF", "RW", "RW"],
};

function lineCodes(lines, i) {
  const n = lines[i];
  if (i === 0) return DEF_CODES[n] || Array(n).fill("CB");
  if (i === lines.length - 1) return FWD_CODES[n] || Array(n).fill("CF");
  const midCount = lines.length - 2;
  const code = midCount >= 2 ? (i === 1 ? "CDM" : "CAM") : "CM";
  return Array(n).fill(code);
}

// Across the pitch (0 = the team's left, 1 = its right) for n players.
function spread(n) {
  if (n <= 1) return [0.5];
  const span = [0, 0, 0.4, 0.56, 0.72, 0.8, 0.86][Math.min(n, 6)];
  return Array.from({ length: n }, (_, k) => 0.5 - span / 2 + (span * k) / (n - 1));
}

/**
 * The places on the pitch for a formation.
 * Returns [{ slot, code, line, depth, wide }]
 *   depth 0..1  — 0 is the team's own goal line, 1 is the far end
 *   wide  0..1  — 0 is the team's left touchline, 1 the right
 */
export function formationSlots(formation) {
  const lines = parseFormation(formation);
  if (!lines) return [];
  const slots = [{ slot: 0, code: "GK", line: -1, depth: 0.075, wide: 0.5 }];
  const first = 0.27;
  const last = 0.87;
  let index = 1;
  lines.forEach((count, li) => {
    const depth = lines.length === 1 ? 0.55 : first + ((last - first) * li) / (lines.length - 1);
    const codes = lineCodes(lines, li);
    const across = spread(count);
    for (let k = 0; k < count; k++) {
      slots.push({ slot: index++, code: codes[k], line: li, depth, wide: across[k] });
    }
  });
  return slots;
}

export function defaultCodeForSlot(formation, slot) {
  const s = formationSlots(formation).find((x) => x.slot === slot);
  return s ? s.code : "CM";
}

/**
 * Everything the pitch needs: for each player drawn on it, where.
 * `x`/`y` are percentages of the landscape pitch. `faceLeft` is true
 * for the team attacking toward the left, which also flips left/right
 * so a left-back is on the player's own left, not the screen's — Red
 * normally attacks left (goal on the right) and Blue the opposite;
 * the flip button in the field view swaps this for a look, without
 * touching which end either team actually defends.
 */
export function pitchPlacements(team, { faceLeft = false } = {}) {
  const players = (team.players || []).filter((p) => p && String(p.name || "").trim());
  const slots = formationSlots(team.formation);
  const drawn = [];
  players.forEach((p) => {
    if (p.slot == null) return; // substitute
    const s = slots.find((x) => x.slot === Number(p.slot));
    if (s) drawn.push({ player: p, depth: s.depth, wide: s.wide });
  });

  return drawn.map(({ player, depth, wide }) => ({
    player,
    x: faceLeft ? (1 - depth) * 100 : depth * 100,
    // Landscape pitch: attacking right, the team's left is the top of the
    // screen; attacking left it is the bottom.
    y: faceLeft ? (1 - wide) * 100 : wide * 100,
  }));
}

/** Players in the order the info list shows them: on the pitch by slot, then subs. */
export function orderedPlayers(team) {
  const players = (team.players || []).filter((p) => p && String(p.name || "").trim());
  const onPitch = players.filter((p) => p.slot != null).sort((a, b) => Number(a.slot) - Number(b.slot));
  const subs = players.filter((p) => p.slot == null);
  return [...onPitch, ...subs];
}

export function formationLabel(formation) {
  return isValidFormation(formation) ? formation : DEFAULT_FORMATION;
}

// ------------------------------------------------
// Teams
// ------------------------------------------------
export const SEED_TEAMS = {
  red:  { id: "red",  name: CLUBS.red.name,  end: "auditorium",   formation: DEFAULT_FORMATION, players: [] },
  blue: { id: "blue", name: CLUBS.blue.name, end: "kindergarten", formation: DEFAULT_FORMATION, players: [] },
};

/** Firestore data (or nothing) → a complete team object. */
export function resolveTeam(id, data) {
  const seed = SEED_TEAMS[id];
  const merged = { ...seed, ...(data || {}), id };
  const saved = String(merged.name || "").trim();
  if (!saved || saved.toLowerCase() === OLD_DEFAULT_NAMES[id]) merged.name = seed.name;
  merged.end = PITCH_ENDS[merged.end] ? merged.end : seed.end;
  merged.formation = isValidFormation(merged.formation) ? merged.formation : DEFAULT_FORMATION;
  merged.players = (Array.isArray(merged.players) ? merged.players : [])
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: p.id || newPlayerId(),
      name: String(p.name || ""),
      position: normalizePosition(p.position),
      slot: p.slot == null || p.slot === "" ? null : Number(p.slot),
    }));
  return merged;
}

/**
 * Moving between formations: keep each player in their slot, and if
 * they were on that slot's default position, move them to the new
 * one. Hand-picked positions are left alone. A slot that no longer
 * exists in the new formation becomes a substitute.
 */
export function retargetFormation(players, fromFormation, toFormation) {
  if (!formationSlots(toFormation).length) return players.map((p) => ({ ...p }));
  const toSlots = new Set(formationSlots(toFormation).map((s) => s.slot));
  return players.map((p) => {
    if (p.slot == null) return { ...p };
    if (!toSlots.has(Number(p.slot))) return { ...p, slot: null };
    const oldDefault = defaultCodeForSlot(fromFormation, p.slot);
    const newDefault = defaultCodeForSlot(toFormation, p.slot);
    return { ...p, position: normalizePosition(p.position) === oldDefault ? newDefault : p.position };
  });
}

/** Put unplaced players into empty slots of `formation`, best match first. */
export function assignSlots(players, formation) {
  const slots = formationSlots(formation);
  const taken = new Set(players.filter((p) => p.slot != null).map((p) => Number(p.slot)));
  const result = players.map((p) => ({ ...p }));
  const unplaced = result.filter((p) => p.slot == null && String(p.name || "").trim());

  // 1) keeper  2) same position  3) same group  4) any outfield spot left
  const passes = [
    (p, s) => p.position === "GK" && s.code === "GK",
    (p, s) => s.code !== "GK" && normalizePosition(p.position) === s.code,
    (p, s) => s.code !== "GK" && positionGroup(p.position) === positionGroup(s.code),
    (p, s) => s.code !== "GK",
  ];
  passes.forEach((match) => {
    unplaced.forEach((p) => {
      if (p.slot != null) return;
      const s = slots.find((x) => !taken.has(x.slot) && match(p, x));
      if (s) { p.slot = s.slot; taken.add(s.slot); }
    });
  });
  return result;
}

export function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// "Fri, 14 Nov" style label from an ISO date string (YYYY-MM-DD).
export function formatMatchDate(iso) {
  if (!iso) return "Friday PE";
  try {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

// ============================================
// Points — one match at a time
// ------------------------------------------------
// Pure functions: no DOM, no Firebase. football-points.js draws with
// these; the numbers live HERE so scoring can be re-tuned in one
// place. Only monitors write a performance, so there's no pending /
// approval step — a saved performance counts immediately.
//
// A performance is one player's match:
//   pitchPerformances/{YYYY-MM-DD_playerId}
//   { playerId, playerName, team, position, date, stats, points,
//     loggedBy, loggedByName, createdAtMs, updatedAtMs }
// stats = { goals, assists, saves, mvp, ownGoal }
//
// WHY THESE NUMBERS:
//  - Goal 5, assist 2, save 3 — a goal is worth more than an assist
//    or a save, but a busy keeper making several saves can still
//    outscore a one-goal game.
//  - Hat-trick (3+ goals) is a +5 bonus, and five or more goals is a
//    further +10 on top of that — so a huge game is rewarded well
//    beyond just goals × 5.
//  - MVP is worth the most single thing (+10): it's the match's own
//    call on who had the best game, stats aside.
//  - An own goal doesn't cost points — bad enough without a penalty
//    too — it just means that match's "Clowned 🤡" spot is taken.
// ============================================
export const SCORING = {
  goal: 5,
  assist: 2,
  hatTrick: 5,  // bonus on top, once goals >= 3
  bigHaul: 10,  // further bonus on top, once goals >= 5
  save: 3,
  mvp: 10,
};

// The most a stepper on the form will go to (sanity, not scoring).
export const STAT_LIMITS = { goals: 12, assists: 12, saves: 20 };

/** A blank stat line. */
export function emptyStats() {
  return { goals: 0, assists: 0, saves: 0, mvp: false, ownGoal: false };
}

/** Anything (Firestore data, a half-filled form) → a clean, in-range stat line. */
export function normalizeStats(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const num = (key) => {
    const n = Math.floor(Number(r[key]));
    return Number.isFinite(n) ? Math.min(STAT_LIMITS[key], Math.max(0, n)) : 0;
  };
  return {
    goals: num("goals"), assists: num("assists"), saves: num("saves"),
    mvp: r.mvp === true, ownGoal: r.ownGoal === true,
  };
}

/**
 * Score one stat line. Returns { total, rows } where rows is the
 * breakdown the form/card shows: [{ label, detail, points }, …].
 */
export function scorePerformance(stats) {
  const s = normalizeStats(stats);
  const rows = [];
  const add = (label, points, detail = "") => { if (points) rows.push({ label, points, detail }); };

  add("Goals", s.goals * SCORING.goal, s.goals ? `${s.goals} × ${SCORING.goal}` : "");
  add("Assists", s.assists * SCORING.assist, s.assists ? `${s.assists} × ${SCORING.assist}` : "");
  if (s.goals >= 3) add("Hat-trick", SCORING.hatTrick);
  if (s.goals >= 5) add("Five-goal haul", SCORING.bigHaul);
  add("Saves", s.saves * SCORING.save, s.saves ? `${s.saves} × ${SCORING.save}` : "");
  if (s.mvp) add("MVP", SCORING.mvp);

  const total = rows.reduce((t, r) => t + r.points, 0);
  return { total, rows };
}

/**
 * One match's board: every performance logged for `date`, ranked by
 * points (ties: goals, then assists, then saves, then name). Also
 * picks out the match MVP and the match's "clown" (an own goal),
 * each at most one — if two people are flagged, the higher scorer
 * (then earlier submission) gets the spot.
 */
export function matchBoard(performances, date) {
  const rows = (performances || [])
    .filter((p) => p && p.date === date)
    .map((p) => {
      const s = normalizeStats(p.stats);
      const { total } = scorePerformance(s);
      return {
        id: p.playerId, name: p.playerName || "Player", team: p.team === "blue" ? "blue" : "red",
        position: p.position, stats: s, points: total, createdAtMs: p.createdAtMs || 0,
      };
    })
    .sort((a, b) =>
      b.points - a.points || b.stats.goals - a.stats.goals ||
      b.stats.assists - a.stats.assists || b.stats.saves - a.stats.saves ||
      String(a.name).localeCompare(String(b.name)));

  const pick = (test) => rows
    .filter((r) => test(r))
    .sort((a, b) => b.points - a.points || a.createdAtMs - b.createdAtMs)[0] || null;

  return { top: rows.slice(0, 3), mvp: pick((r) => r.stats.mvp), clown: pick((r) => r.stats.ownGoal), all: rows };
}

// ------------------------------------------------
// Dates
// ------------------------------------------------
/** Local YYYY-MM-DD (not toISOString, which is UTC and can land on the wrong day). */
export function isoDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** The most recent Friday on or before `d`, as a Date — matches are always Friday PE. */
export function lastFriday(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - 5 + 7) % 7));
}

export function performanceId(date, playerId) { return `${date}_${playerId}`; }

/**
 * What a match's performances hang off: its date, or — for a match saved
 * without one — its own id. (A bare `null` date used to make every undated
 * match share the same "null_<player>" documents.)
 */
export function matchKey(match) {
  return (match && (match.date || match.id)) || "";
}

/**
 * Newest match first. By match date (or, with no date, the day it was
 * logged), then by when it was logged — so a past Friday entered late
 * lands where it belongs and old documents that lack `createdAtMs` still
 * show up (an orderBy() query silently drops those).
 */
export function sortMatches(list) {
  const day = (m) => m.date || (m.createdAtMs ? isoDate(new Date(m.createdAtMs)) : "");
  return [...(list || [])].sort((a, b) =>
    day(b).localeCompare(day(a)) || (b.createdAtMs || 0) - (a.createdAtMs || 0));
}
