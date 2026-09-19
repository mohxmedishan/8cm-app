// ============================================
// 8CM — Arrange mode (drag-to-reorder)
// ============================================
const $ = (id) => document.getElementById(id);

function getRowIds(list) {
  return Array.from(list.querySelectorAll(":scope > [data-id]")).map((r) => r.dataset.id);
}

// Read an element's natural (untransformed) top. Temporarily clears the
// transform, forces layout, then restores — so it works even while a drag transform is applied.
function measureNaturalTop(el) {
  const savedTf = el.style.transform;
  const savedVar = el.style.getPropertyValue("--drag-dy");
  el.style.transform = "";
  el.style.setProperty("--drag-dy", "0px");
  void el.offsetWidth;
  const top = el.getBoundingClientRect().top;
  el.style.transform = savedTf;
  el.style.setProperty("--drag-dy", savedVar);
  return top;
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

  const panel = list.closest(".today-panel");

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
    setStatus._t = setTimeout(() => { el.hidden = true; el.textContent = ""; }, 2400);
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
      e.preventDefault();
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
    const startRect = row.getBoundingClientRect();
    const grabOffsetY = startY - startRect.top;
    let naturalTop = startRect.top;
    let dragging = false;

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging && Math.abs(ev.clientY - startY) < 4) return;

      if (!dragging) {
        dragging = true;
        row.classList.add("is-dragging");
        list.classList.add("is-dragging-active");
        if (panel) panel.classList.add("is-dragging-active");
      }

      const dy = (ev.clientY - grabOffsetY) - naturalTop;
      row.style.setProperty("--drag-dy", `${dy}px`);

      const siblings = Array.from(list.querySelectorAll(":scope > [data-id]"))
        .filter((r) => r !== row && sameBlock(row, r));

      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (ev.clientY < rect.top || ev.clientY > rect.bottom) continue;

        const insertBefore = ev.clientY < rect.top + rect.height / 2;
        if (insertBefore && sib.nextElementSibling === row) return;
        if (!insertBefore && sib.previousElementSibling === row) return;

        const allRows = Array.from(list.querySelectorAll(":scope > [data-id]"));
        const beforeTops = new Map(allRows.map((r) => [r, r.getBoundingClientRect().top]));

        if (insertBefore) list.insertBefore(row, sib);
        else list.insertBefore(row, sib.nextSibling);

        allRows.forEach((r) => {
          if (r === row) return;
          const before = beforeTops.get(r);
          const after = r.getBoundingClientRect().top;
          const delta = before - after;
          if (Math.abs(delta) < 0.5) return;
          r.style.transition = "none";
          r.style.transform = `translateY(${delta}px)`;
          void r.offsetWidth;
          r.style.transition = "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)";
          r.style.transform = "";
        });

        naturalTop = measureNaturalTop(row);
        const newDy = (ev.clientY - grabOffsetY) - naturalTop;
        row.style.setProperty("--drag-dy", `${newDy}px`);
        return;
      }
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (dragging) {
        row.classList.remove("is-dragging");
        row.style.removeProperty("--drag-dy");
      }
      list.classList.remove("is-dragging-active");
      if (panel) panel.classList.remove("is-dragging-active");
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
    if (panel) panel.classList.add("is-arranging");

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
    list.classList.remove("arrange-mode", "is-dragging-active");
    if (panel) panel.classList.remove("is-arranging", "is-dragging-active");
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
