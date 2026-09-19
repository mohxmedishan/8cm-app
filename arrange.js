// ============================================
// 8CM — Arrange mode (drag-to-reorder)
// ------------------------------------------------
// Shared by Homework, Announcements and Resources. Each of those
// panels gets a pencil toggle in its header (monitors only, and only
// once the list has something in it). Turning it on shows a two-dash
// drag handle on every row; turning it off saves the new order for
// everyone.
//
// How the order is stored
//   Every item gets a numeric `sortOrder` (its position in the list
//   when the monitor saved). Sort rules, in this order:
//     1. pinned items first            (Announcements / Resources)
//     2. important above normal        (Homework / Announcements)
//     3. saved `sortOrder`, ascending
//     4. items that have never been arranged (brand-new ones) lead
//        their tier, then fall back to the section's old rule
//        (Homework: soonest due date; others: newest first)
//   Nothing is written until a monitor actually moves something, so
//   toggling the pencil on and off without dragging changes nothing.
//
// The priority rule (Homework + Announcements)
//   Important always sits above normal. While arranging, everything at
//   or below the first normal item is normal:
//     - drag an important item below a normal one -> it becomes normal
//     - drag a normal item to the top -> it stays normal, and the
//       important items now below it become normal too
//   The result is worked out from the ORIGINAL priorities plus the
//   current order, so dragging an item back undoes the demotion.
//
// Pinned items form their own block. They can be reordered among
// themselves but never dragged out of (or into) the pinned block —
// Pin/Unpin is how an item changes blocks.
//
// Pointer Events are used (not HTML5 drag-and-drop) so dragging works
// with a finger on a phone or tablet. The handle has touch-action:none
// so touching it drags instead of scrolling.
// ============================================
import {
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { describeWriteError } from "./error-utils.js";
import { logAction } from "./audit.js";
import { playToggleOn, playToggleOff, playSuccess, playError } from "./sound.js";

// Homework used to store low / medium / high. Anything "high" counts as
// important; everything else counts as normal. Reading only — old
// documents are never rewritten just to change this word.
export function normalizePriority(p) {
  return p === "important" || p === "high" ? "important" : "normal";
}

const HANDLE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const SAVE_TIMEOUT_MS = 15000;
const BATCH_LIMIT = 400; // Firestore allows 500 per batch; stay well under

// ------------------------------------------------
// Small toast (saved / failed)
// ------------------------------------------------
let toastTimer = null;
function showToast(message, { error = false } = {}) {
  let el = document.getElementById("arrangeToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "arrangeToast";
    el.className = "arrange-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("is-error", error);
  // Force a reflow so the transition replays when toasts come back to back.
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), error ? 6000 : 2600);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject({ code: "deadline-exceeded" }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * @param {object}   cfg
 * @param {string}   cfg.label         plain-English name: "homework", "announcements", "resources"
 * @param {string}   cfg.collection    Firestore collection the items live in
 * @param {string}   cfg.panelId       id of the .today-panel
 * @param {string}   cfg.listId        id of the list container
 * @param {string}   cfg.buttonId      id of the pencil toggle button
 * @param {boolean} [cfg.tiered]       true if items have an important / normal priority
 * @param {Function}[cfg.isPinned]     (item) => boolean
 * @param {Function} cfg.legacyCompare (a, b) => number — order for never-arranged items
 * @param {Function} cfg.getItems      () => raw items (each with .id)
 * @param {Function} cfg.isMonitor     () => boolean
 * @param {Function} cfg.rerender      () => void — the section's render(); must call arranger.refresh()
 * @param {Function}[cfg.onEnter]      called just before arrange mode starts
 */
export function createArranger(cfg) {
  const {
    label,
    collection: collName,
    panelId,
    listId,
    buttonId,
    tiered = false,
    isPinned = null,
    legacyCompare = null,
    getItems,
    isMonitor,
    rerender,
    onEnter = null,
  } = cfg;

  let active = false;
  let busy = false;
  let ids = []; // working order while arranging
  let initialIds = []; // order when arrange mode started (to detect real changes)

  const groupOf = (item) => (isPinned && isPinned(item) ? 0 : 1);
  const prioOf = (item) => normalizePriority(item.priority);
  const savedOrder = (item) => (Number.isFinite(item.sortOrder) ? item.sortOrder : null);

  // ---- ordering -------------------------------------------------
  function baseCompare(a, b) {
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga !== gb) return ga - gb;

    if (tiered) {
      const ta = prioOf(a) === "important" ? 0 : 1;
      const tb = prioOf(b) === "important" ? 0 : 1;
      if (ta !== tb) return ta - tb;
    }

    const oa = savedOrder(a);
    const ob = savedOrder(b);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa === null && ob !== null) return -1; // never arranged -> leads its tier
    if (oa !== null && ob === null) return 1;

    const legacy = legacyCompare ? legacyCompare(a, b) : 0;
    if (legacy) return legacy;
    return String(a.id).localeCompare(String(b.id));
  }

  // Priority each item ends up with for a given display order: the
  // first normal item in a block turns everything after it normal.
  function computeEffective(list) {
    const out = new Map();
    let group = null;
    let demoted = false;
    for (const item of list) {
      const g = groupOf(item);
      if (g !== group) {
        group = g;
        demoted = false;
      }
      let p = prioOf(item);
      if (tiered) {
        if (p !== "important") demoted = true;
        else if (demoted) p = "normal";
      }
      out.set(item.id, p);
    }
    return out;
  }

  // Working order: keep what the monitor has arranged, drop deleted
  // items, and slot in anything new that arrived from someone else's
  // edit (important -> top of its block, normal -> just above the
  // first normal item).
  function reconcile(items) {
    const byId = new Map(items.map((i) => [i.id, i]));
    ids = ids.filter((id) => byId.has(id));
    const known = new Set(ids);

    const fresh = items.filter((i) => !known.has(i.id)).sort(baseCompare);
    for (const item of fresh) {
      const list = ids.map((id) => byId.get(id));
      const g = groupOf(item);
      const first = list.findIndex((x) => groupOf(x) >= g);
      let idx = first === -1 ? list.length : first;
      if (tiered && prioOf(item) !== "important") {
        const eff = computeEffective(list);
        while (idx < list.length && groupOf(list[idx]) === g && eff.get(list[idx].id) === "important") idx++;
      }
      ids.splice(idx, 0, item.id);
    }

    // Pin/Unpin from another tab can change an item's block — keep blocks contiguous.
    const ordered = ids.map((id) => byId.get(id));
    const blocks = [ordered.filter((x) => groupOf(x) === 0), ordered.filter((x) => groupOf(x) === 1)];
    const result = [...blocks[0], ...blocks[1]];
    ids = result.map((x) => x.id);
    return result;
  }

  // What everyone sees (ignores any in-progress arrangement).
  function sortStored(items) {
    return [...items].sort(baseCompare);
  }

  // What this monitor's screen shows right now.
  function sortItems(items) {
    return active ? reconcile(items) : sortStored(items);
  }

  // id -> "important" | "normal" for a list already in display order.
  function priorities(ordered) {
    if (active) return computeEffective(ordered);
    return new Map(ordered.map((i) => [i.id, prioOf(i)]));
  }

  // ---- saving ---------------------------------------------------
  function computeUpdates() {
    const list = reconcile(getItems());
    const eff = computeEffective(list);
    const updates = [];
    list.forEach((item, index) => {
      const patch = {};
      if (item.sortOrder !== index) patch.sortOrder = index;
      if (tiered && eff.get(item.id) !== prioOf(item)) patch.priority = eff.get(item.id);
      if (Object.keys(patch).length) updates.push({ id: item.id, patch });
    });
    return updates;
  }

  async function writeUpdates(updates) {
    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      updates.slice(i, i + BATCH_LIMIT).forEach((u) => batch.update(doc(db, collName, u.id), u.patch));
      await batch.commit();
    }
    await logAction("updated", {
      resourceType: label,
      resourceId: "",
      summary: `Rearranged ${label} (${updates.length} updated)`,
    });
  }

  // ---- UI state -------------------------------------------------
  const warnUnsaved = (e) => {
    if (active && !sameIds(ids, initialIds)) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  function syncControl() {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const monitor = !!isMonitor();
    btn.hidden = !(monitor && (getItems().length > 0 || active));
    btn.classList.toggle("is-on", active);
    btn.classList.toggle("is-busy", busy);
    btn.setAttribute("aria-pressed", String(active));
    btn.disabled = busy;
    const text = active ? `Save ${label} order` : `Rearrange ${label}`;
    btn.title = text;
    btn.setAttribute("aria-label", text);
  }

  function stopArranging() {
    active = false;
    busy = false;
    ids = [];
    initialIds = [];
    window.removeEventListener("beforeunload", warnUnsaved);
  }

  function enter() {
    if (!isMonitor() || getItems().length === 0) return;
    if (onEnter) onEnter();
    ids = sortStored(getItems()).map((i) => i.id);
    initialIds = [...ids];
    active = true;
    window.addEventListener("beforeunload", warnUnsaved);
    playToggleOn();
    rerender();
  }

  async function exitAndSave() {
    const changed = !sameIds(ids, initialIds);
    if (changed) {
      const updates = computeUpdates();
      busy = true;
      syncControl();
      try {
        if (updates.length) await withTimeout(writeUpdates(updates), SAVE_TIMEOUT_MS);
        playSuccess();
        showToast("Order saved");
      } catch (err) {
        console.error(`Saving ${label} order failed:`, err);
        playError();
        busy = false;
        syncControl();
        // Stay in arrange mode so nothing the monitor dragged is lost.
        showToast(describeWriteError(err, "save"), { error: true });
        return;
      }
    } else {
      playToggleOff();
    }
    stopArranging();
    rerender();
  }

  function toggle() {
    if (busy) return;
    if (active) exitAndSave();
    else enter();
  }

  // Called by the section at the end of every render() and on auth
  // changes: keeps the pencil, handles and panel state in sync.
  function refresh() {
    if (active && (!isMonitor() || getItems().length === 0)) {
      stopArranging(); // signed out, or everything was deleted
    }
    syncControl();
    decorate();
  }

  // ---- DOM: handles, hint, dragging ------------------------------
  function handleHtml() {
    if (!active) return "";
    return `<button type="button" class="arrange-handle" aria-label="Drag to reorder — or press the up and down arrow keys" title="Drag to reorder">${HANDLE_SVG}</button>`;
  }

  function decorate() {
    const panel = document.getElementById(panelId);
    const list = document.getElementById(listId);
    if (panel) panel.classList.toggle("is-arranging", active);
    if (!list) return;
    list.classList.toggle("arrange-mode", active);
    if (!active) return;

    const byId = new Map(getItems().map((i) => [i.id, i]));
    rows(list).forEach((row) => {
      const item = byId.get(row.dataset.id);
      if (item) row.dataset.group = String(groupOf(item));
    });

    if (!list.querySelector(":scope > .arrange-hint")) {
      const hint = document.createElement("p");
      hint.className = "arrange-hint";
      hint.textContent =
        "Drag the handles to reorder, then tap the pencil again to save." +
        (tiered ? " Everything below the first normal item becomes normal." : "");
      list.insertBefore(hint, list.firstChild);
    }

    list.querySelectorAll(".arrange-handle").forEach((handle) => {
      if (handle.dataset.bound) return;
      handle.dataset.bound = "1";
      handle.addEventListener("pointerdown", (e) => startDrag(e, handle));
      handle.addEventListener("keydown", (e) => onKey(e, handle));
      handle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      handle.addEventListener("contextmenu", (e) => e.preventDefault());
    });
  }

  const rows = (list) => [...list.children].filter((el) => el.dataset && el.dataset.id);

  function syncFromDom(list, focusId) {
    ids = rows(list).map((el) => el.dataset.id);
    rerender();
    if (focusId) {
      const row = rows(list).find((el) => el.dataset.id === focusId);
      const h = row && row.querySelector(".arrange-handle");
      if (h) h.focus();
    }
  }

  function onKey(e, handle) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const row = handle.closest("[data-id]");
    const list = row && row.parentElement;
    if (!row || !list) return;
    e.preventDefault();
    const sibling = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling || !sibling.dataset.id || sibling.dataset.group !== row.dataset.group) return;
    if (e.key === "ArrowUp") list.insertBefore(row, sibling);
    else list.insertBefore(sibling, row);
    syncFromDom(list, row.dataset.id);
  }

  function startDrag(e, handle) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = handle.closest("[data-id]");
    const list = row && row.parentElement;
    if (!row || !list) return;
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal — events still reach the handle while the pointer is over it */
    }

    const group = row.dataset.group;
    const grab = e.clientY - row.getBoundingClientRect().top;
    let pointerY = e.clientY;
    let dir = 0; // last direction the pointer travelled: 1 down, -1 up
    let raf = 0;
    let finished = false;

    row.classList.add("is-dragging");
    list.classList.add("is-sorting");

    const sameBlock = (el) => el && el.dataset.id && el.dataset.group === group;

    function update() {
      const desiredTop = pointerY - grab;
      const center = desiredTop + row.offsetHeight / 2;

      // Swap with neighbours (same block only) as the row's centre passes theirs.
      for (let guard = 0; guard < 60; guard++) {
        const prev = row.previousElementSibling;
        const next = row.nextElementSibling;
        if (sameBlock(prev)) {
          const r = prev.getBoundingClientRect();
          if (center < r.top + r.height / 2) {
            // Move the neighbour, not the row: re-inserting the row would
            // detach the handle that holds the pointer capture and end the drag.
            row.after(prev);
            continue;
          }
        }
        if (sameBlock(next)) {
          const r = next.getBoundingClientRect();
          if (center > r.top + r.height / 2) {
            row.before(next);
            continue;
          }
        }
        break;
      }

      // Float the row under the pointer (its slot in the list only ever moves within its own block).
      row.style.transform = "";
      const top = row.getBoundingClientRect().top;
      row.style.transform = `translateY(${desiredTop - top}px)`;
    }

    function autoscroll() {
      // Only scroll toward the edge the pointer is actually heading for, so
      // grabbing a handle that happens to sit near the screen edge doesn't
      // make the page lurch before the finger has moved.
      const edge = 72;
      let speed = 0;
      if (pointerY < edge && dir < 0) speed = -Math.ceil((edge - pointerY) / 4);
      else if (pointerY > window.innerHeight - edge && dir > 0) speed = Math.ceil((pointerY - (window.innerHeight - edge)) / 4);
      if (speed) {
        // "instant": the site sets scroll-behavior: smooth, which would make every tick lag.
        window.scrollBy({ top: speed, left: 0, behavior: "instant" });
        update();
      }
      raf = requestAnimationFrame(autoscroll);
    }

    function onMove(ev) {
      const delta = ev.clientY - pointerY;
      if (Math.abs(delta) >= 1) dir = delta > 0 ? 1 : -1;
      pointerY = ev.clientY;
      update();
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      row.style.transform = "";
      row.classList.remove("is-dragging");
      list.classList.remove("is-sorting");
      syncFromDom(list, null);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    raf = requestAnimationFrame(autoscroll);
    update();
  }

  function init() {
    const btn = document.getElementById(buttonId);
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", toggle);
    }
    syncControl();
  }

  return {
    init,
    refresh,
    sortItems,
    sortStored,
    priorities,
    handleHtml,
    isActive: () => active,
  };
}
