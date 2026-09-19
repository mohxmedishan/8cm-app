// ============================================
// 8CM — Arrange mode (drag-to-reorder)
// ------------------------------------------------
// Shared by Homework, Announcements, and Resources.
// ============================================

const $ = (id) => document.getElementById(id);

function getRowIds(list) {
  return Array.from(list.querySelectorAll(":scope > [data-id]")).map((r) => r.dataset.id);
}

export function createArranger({
  listId,
  pencilBtnId,
  statusId,
  onSave,
  onEnter,
  onExit,
}) {
  const list = $(listId);
  const pencilBtn = $(pencilBtnId);
  if (!list || !pencilBtn) return null;

  let active = false;
  let originalOrder = [];
  let dragging = null;

  function setStatus(msg, isError = false) {
    const el = statusId ? $(statusId) : null;
    if (!el) return;
    clearTimeout(setStatus._t);
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.hidden = false;
    el.classList.toggle("is-error", isError);
    setStatus._t = setTimeout(() => {
      el.hidden = true;
      el.textContent = "";
    }, 2600);
  }

  function makeHandle() {
    const h = document.createElement("button");
    h.type = "button";
    h.className = "arrange-handle";
    h.setAttribute("aria-label", "Drag to reorder");
    h.innerHTML = "<span></span><span></span>";
    return h;
  }

  function sameBlock(a, b) {
    return (a.dataset.block || "") === (b.dataset.block || "");
  }

  function wireHandle(handle, row) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      startDrag(e, row, handle);
    });

    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const sibling = dir === -1 ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling || !sibling.dataset.id || !sameBlock(row, sibling)) return;
      if (dir === -1) list.insertBefore(row, sibling);
      else list.insertBefore(sibling, row);
      handle.focus();
    });
  }

  function attachHandles() {
    list.querySelectorAll(":scope > [data-id]").forEach((row) => {
      if (row.querySelector(":scope > .arrange-handle")) return;
      const h = makeHandle();
      row.insertBefore(h, row.firstChild);
      wireHandle(h, row);
    });
  }

  function detachHandles() {
    list.querySelectorAll(":scope > [data-id] > .arrange-handle").forEach((h) => h.remove());
  }

  function startDrag(e, row, handle) {
    dragging = { row, pointerId: e.pointerId };
    row.classList.add("is-dragging");
    try { handle.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      if (!dragging || ev.pointerId !== dragging.pointerId) return;
      const y = ev.clientY;
      const rows = Array.from(list.querySelectorAll(":scope > [data-id]"));
      for (const r of rows) {
        if (r === row || !sameBlock(row, r)) continue;
        const rect = r.getBoundingClientRect();
        if (y < rect.top || y > rect.bottom) continue;
        const before = y < rect.top + rect.height / 2;
        if (before && r.nextElementSibling === row) return;
        if (!before && r.previousElementSibling === row) return;
        if (before) list.insertBefore(row, r);
        else list.insertBefore(row, r.nextSibling);
        return;
      }
    };

    const onUp = (ev) => {
      if (!dragging || ev.pointerId !== dragging.pointerId) return;
      row.classList.remove("is-dragging");
      dragging = null;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  function enter() {
    pencilBtn.classList.add("is-arranging");
    pencilBtn.setAttribute("aria-pressed", "true");
    list.classList.add("arrange-mode");
    if (onEnter) onEnter();
    active = true;
    originalOrder = getRowIds(list);
    attachHandles();
  }

  function exit() {
    active = false;
    pencilBtn.classList.remove("is-arranging");
    pencilBtn.setAttribute("aria-pressed", "false");
    list.classList.remove("arrange-mode");
    detachHandles();
    if (onExit) onExit();
  }

  async function toggle() {
    if (!active) {
      enter();
      return;
    }

    const currentOrder = getRowIds(list);
    const changed =
      currentOrder.length !== originalOrder.length ||
      currentOrder.some((id, i) => id !== originalOrder[i]);

    if (!changed) {
      exit();
      return;
    }

    try {
      await onSave(currentOrder);
      setStatus("Order saved");
      exit();
    } catch (err) {
      console.error("[8CM] Failed to save order:", err);
      setStatus("Couldn't save — try again", true);
    }
  }

  pencilBtn.setAttribute("aria-pressed", "false");
  pencilBtn.addEventListener("click", toggle);

  return {
    isActive: () => active,
    refreshHandles: () => { if (active) attachHandles(); },
    forceExit: () => { if (active) exit(); },
  };
}
