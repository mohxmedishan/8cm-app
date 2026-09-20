// ============================================
// 8CM — Pitch (football) shared data
// ------------------------------------------------
// Constants + seed content shared between the public display module
// (football.js) and the monitor-only editor (football-manage.js).
// Matches are always Red vs Blue, always Friday P3 (PE) — see
// archives.html's timetable, cat-other tt-col-p3 tt-row-fri. There's
// no "opponent" field because there's only ever one fixture.
// ============================================

export const PITCH_POSITIONS = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
};

export const PITCH_ENDS = {
  auditorium: "Auditorium end",
  kindergarten: "Kindergarten end",
};

export function otherEnd(end) {
  return end === "auditorium" ? "kindergarten" : "auditorium";
}

export function newPlayerId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newMatchId() {
  return `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Two fixed teams — "red" and "blue" are the doc IDs in pitchTeams/.
// Names are editable from the monitor panel, but the IDs (and the
// colors that key off them) always stay red/blue.
export const SEED_TEAMS = {
  red: {
    id: "red",
    name: "Red",
    end: "auditorium",
    players: [
      { id: "seed-r1", name: "Add your first player", position: "GK", x: 50, y: 92 },
      { id: "seed-r2", name: "Add your first player", position: "DF", x: 25, y: 72 },
      { id: "seed-r3", name: "Add your first player", position: "DF", x: 75, y: 72 },
      { id: "seed-r4", name: "Add your first player", position: "MF", x: 50, y: 48 },
      { id: "seed-r5", name: "Add your first player", position: "FW", x: 50, y: 22 },
    ],
  },
  blue: {
    id: "blue",
    name: "Blue",
    end: "kindergarten",
    players: [
      { id: "seed-b1", name: "Add your first player", position: "GK", x: 50, y: 92 },
      { id: "seed-b2", name: "Add your first player", position: "DF", x: 25, y: 72 },
      { id: "seed-b3", name: "Add your first player", position: "DF", x: 75, y: 72 },
      { id: "seed-b4", name: "Add your first player", position: "MF", x: 50, y: 48 },
      { id: "seed-b5", name: "Add your first player", position: "FW", x: 50, y: 22 },
    ],
  },
};

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
