// ============================================
// 8CM — Shared write-error helper
// ------------------------------------------------
// Every monitor-only write (students, teachers, gallery, announcements,
// events, achievements, tasks/homework) used to catch ANY failure —
// an actual permission denial, a dropped connection, a malformed
// payload, Firestore being briefly unreachable — and show the exact
// same "check your monitor access" message. That made every failure
// look like a permissions problem even when it wasn't, which is what
// made a real monitor's access issue impossible to tell apart from an
// unrelated bug. This looks at the actual Firestore error code and
// only blames monitor access when Firestore itself said so.
// ============================================

/**
 * @param {unknown} err - the caught error
 * @param {string} verb - what we were trying to do, e.g. "save", "delete"
 */
export function describeWriteError(err, verb = "save") {
  const code = err && typeof err === "object" ? err.code : null;

  if (code === "permission-denied") {
    return (
      `Couldn't ${verb} that — Firestore says this account isn't a monitor. ` +
      `Sign out and back in (role can take a moment to refresh), and if it still ` +
      `fails, double-check this account is in the monitors collection or has ` +
      `monitor: true on its users/{uid} profile doc.`
    );
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return `Couldn't ${verb} that — connection to the server timed out. Check your connection and try again.`;
  }
  if (code === "unauthenticated") {
    return `Couldn't ${verb} that — you're signed out. Sign in and try again.`;
  }
  if (err && typeof err === "object" && err.message) {
    return `Couldn't ${verb} that: ${err.message}`;
  }
  return `Couldn't ${verb} that — an unknown error occurred. Try again.`;
}
