// ============================================
// 8CM — nav-boot.js (V17.3)
// ------------------------------------------------
// A tiny CLASSIC script (not a module) that every page loads right after
// its <header>, so it runs while the page is still being parsed — long
// before script.js and Firebase have loaded. It exists for two things
// that used to vanish on every page change and pop back a moment later:
//
//  1. THE VERSION BADGE   Created here, immediately, with the last known
//     version. script.js (initVersionBadge) later confirms it against
//     changelog.js and stores it, so the badge never blinks.
//  2. THE ACCOUNT PILL    auth-ui.js only fills #authSlot once Firebase
//     Auth has answered. So on every navigation the avatar disappeared
//     for a second. Now, whenever auth-ui.js has rendered the slot, a copy
//     of it is remembered (no name/email, no menu — just the button);
//     on the next page that copy is shown at once as an inert "ghost",
//     and it is removed the instant the real thing arrives (same task,
//     so the browser never paints a frame with both or neither).
//
// Rules for anyone editing this file:
//  - Keep it small, synchronous and dependency-free. It blocks parsing.
//  - Every storage access is in try/catch (private mode, blocked storage).
//  - Bump VERSION_FALLBACK when you bump changelog.js (only used on a
//    person's very first visit — after that the remembered value wins).
// ============================================
(function () {
  "use strict";

  var VERSION_FALLBACK = "v17.3.0";
  var KEY_VERSION = "8cm:version";
  var KEY_AUTH = "8cm:auth-slot";

  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {}
  }

  // ---------- 1. Version badge ----------
  try {
    if (document.body && !document.querySelector(".version-badge")) {
      var badge = document.createElement("div");
      badge.className = "version-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = read(KEY_VERSION) || VERSION_FALLBACK;
      document.body.appendChild(badge);
    }
  } catch (e) {}

  // ---------- 2. Account pill ghost ----------
  try {
    var slot = document.getElementById("authSlot");
    if (!slot) return;

    var ghost = null;
    var saved = read(KEY_AUTH);
    if (saved && !slot.firstElementChild && slot.parentNode) {
      ghost = document.createElement("div");
      ghost.className = "nav-auth nav-auth-ghost";
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("inert", "");
      ghost.innerHTML = saved;
      // Before the (still empty) real slot, so it sits exactly where the
      // real one will. CSS hides the empty slot so it adds no gap.
      slot.parentNode.insertBefore(ghost, slot);
    }

    function dropGhost() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
    }

    // Remember what auth-ui.js rendered — without anything personal and
    // without anything interactive that would be dead in a ghost.
    function remember() {
      var live = slot.firstElementChild;
      if (!live) return;
      if (!slot.querySelector(".profile-pill, .cm-avatar, button, a")) return;
      var box = document.createElement("div");
      box.innerHTML = slot.innerHTML;
      var strip = box.querySelectorAll(".dropdown, .profile-dropdown, [role='menu'], [role='dialog'], script");
      for (var i = 0; i < strip.length; i++) strip[i].parentNode.removeChild(strip[i]);
      var withId = box.querySelectorAll("[id]");
      for (var j = 0; j < withId.length; j++) withId[j].removeAttribute("id");
      var openEls = box.querySelectorAll(".open, .is-open");
      for (var k = 0; k < openEls.length; k++) openEls[k].classList.remove("open", "is-open");
      var tabbable = box.querySelectorAll("a, button, [tabindex]");
      for (var m = 0; m < tabbable.length; m++) tabbable[m].setAttribute("tabindex", "-1");
      var html = box.innerHTML;
      if (html && html.length < 6000) write(KEY_AUTH, html);
    }

    var timer = null;
    function onChange() {
      if (slot.firstElementChild) dropGhost();
      window.clearTimeout(timer);
      timer = window.setTimeout(remember, 250);
    }

    if ("MutationObserver" in window) {
      new MutationObserver(onChange).observe(slot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "src", "style"],
      });
    }

    // If auth never answers (blocked Firebase, offline), don't leave a
    // pill on screen that does nothing.
    window.setTimeout(dropGhost, 8000);
  } catch (e) {}
})();
