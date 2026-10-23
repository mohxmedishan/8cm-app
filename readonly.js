// Temporary read-only stand-ins for the modules that were deleted in the cleanup
// (auth.js, audit.js, sound.js). Pages that have not been refactored yet still import these
// names, so they keep loading — signed out, silent, read-only. Delete this file once the last
// page that imports it has been cleaned up.
export const subscribeAuth = (cb) => { try { cb({ user: null, profile: null, monitor: false, ready: true }); } catch (e) {} return () => {}; };
export const logAction = async () => {};
const noop = () => {};
export const playOpen = noop, playClose = noop, playSuccess = noop, playError = noop, playDelete = noop,
  playClick = noop, playToggleOn = noop, playToggleOff = noop, playExternal = noop, playNav = noop, playHover = noop;
