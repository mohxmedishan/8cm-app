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
  red:  { id: "red",  name: "Barça",  logo: "assets/logos/BARCA.png" },
  blue: { id: "blue", name: "Madrid", logo: "assets/logos/RAM.png" },
};

// The first version of the Pitch page called the teams "Red" and "Blue".
// Anyone who saved a team back then still has those names in Firestore.
const OLD_DEFAULT_NAMES = { red: "red", blue: "blue" };

// ------------------------------------------------
// Formations
// ------------------------------------------------
export const FREE_PLAY = "free";
export const PRESET_FORMATIONS = ["2-3-1", "3-2-1", "2-1-2-1", "1-3-2", "2-2-2"];
const OUTFIELD = 6; // every preset is 6 outfield players + a keeper

export function parseFormation(str) {
  if (typeof str !== "string" || str === FREE_PLAY) return null;
  const lines = str.split("-").map((n) => parseInt(n, 10));
  if (lines.length < 2 || lines.length > 5) return null;
  if (lines.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) return null;
  return lines;
}

export function isFreePlay(formation) {
  return !parseFormation(formation);
}

/** A random but sensible shape: 3–4 lines, 1–3 players a line, 6 outfield. */
export function randomFormation(avoid) {
  for (let tries = 0; tries < 60; tries++) {
    const lineCount = Math.random() < 0.55 ? 3 : 4;
    const lines = Array(lineCount).fill(1);
    let left = OUTFIELD - lineCount;
    while (left > 0) {
      const i = Math.floor(Math.random() * lineCount);
      if (lines[i] < 3) { lines[i] += 1; left -= 1; }
    }
    const str = lines.join("-");
    if (str !== avoid && !PRESET_FORMATIONS.includes(str)) return str;
  }
  return "1-2-2-1";
}

// Default position codes for a line, by how many stand in it.
const DEF_CODES = { 1: ["CB"], 2: ["CB", "CB"], 3: ["LB", "CB", "RB"], 4: ["LB", "CB", "CB", "RB"], 5: ["LB", "CB", "CB", "CB", "RB"] };
const FWD_CODES = { 1: ["CF"], 2: ["LW", "RW"], 3: ["LW", "CF", "RW"], 4: ["LW", "CF", "CF", "RW"], 5: ["LW", "CF", "CF", "CF", "RW"] };

function lineCodes(lines, i) {
  const n = lines[i];
  if (i === 0) return DEF_CODES[n];
  if (i === lines.length - 1) return FWD_CODES[n];
  const midCount = lines.length - 2;
  let code = "CM";
  if (midCount >= 2) code = i === 1 ? "CDM" : "CAM";
  return Array(n).fill(code);
}

// Across the pitch (0 = the team's left, 1 = its right) for n players.
function spread(n) {
  if (n <= 1) return [0.5];
  const span = [0, 0, 0.4, 0.56, 0.72, 0.8][Math.min(n, 5)];
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

// ------------------------------------------------
// Free play: place players by what they play
// ------------------------------------------------
const FREE_ROWS = [
  { depth: 0.075, codes: ["GK"] },
  { depth: 0.26,  codes: ["LB", "CB", "RB"] },
  { depth: 0.43,  codes: ["CDM"] },
  { depth: 0.57,  codes: ["CM"] },
  { depth: 0.71,  codes: ["CAM"] },
  { depth: 0.79,  codes: ["SS"] },
  { depth: 0.89,  codes: ["LW", "CF", "RW"] },
];
const LATERAL = { LB: 0, LW: 0, RB: 2, RW: 2 };

/** Map of player id → { depth, wide } for a set of players with no formation. */
export function freePlacement(players) {
  const out = new Map();
  FREE_ROWS.forEach((row) => {
    const inRow = players
      .filter((p) => row.codes.includes(normalizePosition(p.position)))
      .sort((a, b) => (LATERAL[normalizePosition(a.position)] ?? 1) - (LATERAL[normalizePosition(b.position)] ?? 1));
    const across = spread(inRow.length);
    inRow.forEach((p, i) => out.set(p.id, { depth: row.depth, wide: across[i] }));
  });

  // Rows that sit close together (say an attacking mid behind a second
  // striker) would stack on top of each other down the middle of the pitch,
  // so when two players collide, the deeper one steps to the side.
  const placed = [...out.entries()].sort((a, b) => a[1].depth - b[1].depth);
  placed.forEach(([id, spot], i) => {
    for (let j = 0; j < i; j++) {
      const other = placed[j][1];
      if (spot.depth - other.depth < 0.13 && Math.abs(spot.wide - other.wide) < 0.16) {
        spot.wide = spot.wide + (spot.wide > 0.66 ? -0.2 : 0.2);
      }
    }
    out.set(id, spot);
  });
  return out;
}

/**
 * Everything the pitch needs: for each player drawn on it, where.
 * `x`/`y` are percentages of the landscape pitch. `faceLeft` is true
 * for the team that attacks toward the left (Red, whose goal is on
 * the right), which also flips left/right so a left-back is on the
 * player's own left, not the screen's.
 */
export function pitchPlacements(team, { faceLeft = false } = {}) {
  const players = (team.players || []).filter((p) => p && String(p.name || "").trim());
  const formation = team.formation;
  const drawn = [];

  if (isFreePlay(formation)) {
    const spots = freePlacement(players);
    players.forEach((p) => {
      const s = spots.get(p.id);
      if (s) drawn.push({ player: p, depth: s.depth, wide: s.wide });
    });
  } else {
    const slots = formationSlots(formation);
    players.forEach((p) => {
      if (p.slot == null) return; // substitute
      const s = slots.find((x) => x.slot === Number(p.slot));
      if (s) drawn.push({ player: p, depth: s.depth, wide: s.wide });
    });
  }

  return drawn.map(({ player, depth, wide }) => ({
    player,
    x: faceLeft ? (1 - depth) * 100 : depth * 100,
    // Landscape pitch: attacking right, the team's left is the top of the
    // screen; attacking left it is the bottom.
    y: faceLeft ? (1 - wide) * 100 : wide * 100,
  }));
}

/** Players in the order the info list shows them. */
export function orderedPlayers(team) {
  const players = (team.players || []).filter((p) => p && String(p.name || "").trim());
  const groupIndex = (p) => POSITION_GROUPS.findIndex((g) => g.key === positionGroup(p.position));
  if (isFreePlay(team.formation)) {
    return players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => groupIndex(a.p) - groupIndex(b.p) || a.i - b.i)
      .map((x) => x.p);
  }
  const onPitch = players.filter((p) => p.slot != null).sort((a, b) => Number(a.slot) - Number(b.slot));
  const subs = players.filter((p) => p.slot == null);
  return [...onPitch, ...subs];
}

export function formationLabel(formation) {
  return isFreePlay(formation) ? "Free play" : formation;
}

// ------------------------------------------------
// Teams
// ------------------------------------------------
export const SEED_TEAMS = {
  red:  { id: "red",  name: CLUBS.red.name,  end: "auditorium",   formation: FREE_PLAY, players: [] },
  blue: { id: "blue", name: CLUBS.blue.name, end: "kindergarten", formation: FREE_PLAY, players: [] },
};

/** Firestore data (or nothing) → a complete team object. */
export function resolveTeam(id, data) {
  const seed = SEED_TEAMS[id];
  const merged = { ...seed, ...(data || {}), id };
  const saved = String(merged.name || "").trim();
  if (!saved || saved.toLowerCase() === OLD_DEFAULT_NAMES[id]) merged.name = seed.name;
  merged.end = PITCH_ENDS[merged.end] ? merged.end : seed.end;
  merged.formation = parseFormation(merged.formation) ? merged.formation : FREE_PLAY;
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
 * they were on that slot's default position, move them to the new one.
 * Hand-picked positions are left alone.
 */
export function retargetFormation(players, fromFormation, toFormation) {
  if (!formationSlots(toFormation).length) return players.map((p) => ({ ...p }));
  if (isFreePlay(fromFormation)) return assignSlots(players, toFormation);

  return players.map((p) => {
    if (p.slot == null) return { ...p };
    const oldDefault = defaultCodeForSlot(fromFormation, p.slot);
    const newDefault = defaultCodeForSlot(toFormation, p.slot);
    return { ...p, position: normalizePosition(p.position) === oldDefault ? newDefault : p.position };
  });
}

/** From free play into a formation: put each player where they fit best. */
export function assignSlots(players, formation) {
  const slots = formationSlots(formation);
  const taken = new Set();
  const result = players.map((p) => ({ ...p, slot: null }));
  const named = result.filter((p) => String(p.name || "").trim());

  // 1) keeper  2) same position  3) same group  4) any outfield spot left
  const passes = [
    (p, s) => p.position === "GK" && s.code === "GK",
    (p, s) => s.code !== "GK" && normalizePosition(p.position) === s.code,
    (p, s) => s.code !== "GK" && positionGroup(p.position) === positionGroup(s.code),
    (p, s) => s.code !== "GK",
  ];
  passes.forEach((match) => {
    named.forEach((p) => {
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
