// ============================================
// 8CM — Arrange mode (drag-to-reorder)
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
  disableSelectors = [],
}) {
  const list = $(listId);
  const pencilBtn = $(pencilBtnId);
  if (!list || !pencilBtn) return null;

  let active = false;
  let originalOrder = [];
  let disabledEls = [];

  function setStatus(msg, isError = false) {
    const el = statusId ? $(statusId) : null;
    if (!el) return;
    clearTimeout(setStatus._t);
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = msg;
    el.hidden = false;
    el.classList.toggle("is-error", isError);
    setStatus._t = setTimeout(() => { el.hidden = true; el.textContent = ""; }, 2600);
  }

  function makeHandle() {
    const h = document.createElement("button");
    h.type = "button";
    h.className = "arrange-handle";
    h.setAttribute("aria-label", "Drag to reorder");
    h.innerHTML = "<span></span><span></span>";
    return h;
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

  function sameBlock(a, b) {
    return (a.dataset.block || "") === (b.dataset.block || "");
  }

  function wireHandle(handle, row) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startDrag(e, row);
    });
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const sibling = dir === -1 ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling || !sibling.dataset || !sibling.dataset.id) return;
      if (!sameBlock(row, sibling)) return;
      if (dir === -1) list.insertBefore(row, sibling);
      else list.insertBefore(sibling, row);
      handle.focus();
    });
  }

  function startDrag(e, row) {
    const pointerId = e.pointerId;
    const startY = e.clientY;
    let dragged = false;
    let moved = false;

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!moved && Math.abs(ev.clientY - startY) < 4) return;
      moved = true;
      if (!dragged) {
        dragged = true;
        row.classList.add("is-dragging");
        try { ev.preventDefault(); } catch {}
      }
      const y = ev.clientY;
      const rows = Array.from(list.querySelectorAll(":scope > [data-id]"));
      for (const r of rows) {
        if (r === row) continue;
        if (!sameBlock(row, r)) continue;
        const rect = r.getBoundingClientRect();
        if (y < rect.top || y > rect.bottom) continue;
        const before = y < rect.top + rect.height / 2;
        if (before) {
          if (r.previousElementSibling === row) return;
          list.insertBefore(row, r);
        } else {
          if (r.nextElementSibling === row) return;
          list.insertBefore(row, r.nextSibling);
        }
        return;
      }
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      row.classList.remove("is-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function enter() {
    active = true;
    pencilBtn.classList.add("is-arranging");
    pencilBtn.setAttribute("aria-pressed", "true");
    list.classList.add("arrange-mode");

    disabledEls = [];
    disableSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.disabled = true;
        disabledEls.push(el);
      });
    });

    if (onEnter) onEnter();

    originalOrder = getRowIds(list);
    attachHandles();
  }

  function exit() {
    active = false;
    pencilBtn.classList.remove("is-arranging");
    pencilBtn.setAttribute("aria-pressed", "false");
    list.classList.remove("arrange-mode");
    disabledEls.forEach((el) => { el.disabled = false; });
    disabledEls = [];
    detachHandles();
    if (onExit) onExit();
  }

  async function toggle() {
    if (!active) { enter(); return; }

    const current = getRowIds(list);
    const changed =
      current.length !== originalOrder.length ||
      current.some((id, i) => id !== originalOrder[i]);

    if (!changed) { exit(); return; }

    try {
      await onSave(current);
      setStatus("Order saved");
      exit();
    } catch (err) {
      console.error("[8CM] Save order failed:", err);
      setStatus("Couldn't save — try again", true);
    }
  }

  pencilBtn.setAttribute("aria-pressed", "false");
  pencilBtn.addEventListener("click", toggle);

  return {
    isActive: () => active,
    reattach: () => { if (active) attachHandles(); },
    forceExit: () => { if (active) exit(); },
  };
}
