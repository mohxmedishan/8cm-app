// ============================================
// 8CM — Shared "attached links" fields
// ------------------------------------------------
// Homework, announcements and events all needed the same thing: up to
// six external resource links per item (a Google Form, a Drive folder,
// a worksheet, a ClassDojo story…). Rather than writing that three
// times, all three import this module.
//
// Why links and not uploaded files: this project runs on Firebase's
// Spark (free) plan, which doesn't include Storage. Links keep the
// resource wherever its owner actually manages it, cost nothing to
// store, and never hit Firestore's ~1 MiB per-document limit.
//
// Shape stored on the document:  links: [{ label, url }, …]  (max 6)
// Empty rows are dropped on save, so a doc never carries blank slots.
//
// Backward compatibility: homework items created before this existed
// carry a single `link` string instead. readLinks() below folds that
// old field into the same array shape, so nothing needs migrating and
// old items keep rendering.
// ============================================

export const MAX_ITEM_LINKS = 6;

const escapeHtml = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

/**
 * Accepts a URL with or without a scheme ("forms.google.com/…" as well
 * as "https://forms.google.com/…") and returns something safe to put
 * in an href. Returns null for anything that isn't a plausible http(s)
 * link — notably javascript: and data: URIs, which must never reach an
 * href built from user input.
 */
export function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** A short, readable fallback label when the user didn't name a link. */
function labelFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

/**
 * Normalizes whatever is stored on a document into a clean
 * [{label, url}] array — handling the legacy single `link` string,
 * a malformed/missing field, and dropping anything that isn't a
 * valid http(s) URL.
 */
export function readLinks(item) {
  if (!item) return [];
  const raw = Array.isArray(item.links)
    ? item.links
    : item.link
    ? [{ label: "", url: item.link }] // legacy single-link items
    : [];

  return raw
    .map((entry) => {
      const url = normalizeUrl(entry && entry.url);
      if (!url) return null;
      const label = String((entry && entry.label) || "").trim() || labelFromUrl(url);
      return { label, url };
    })
    .filter(Boolean)
    .slice(0, MAX_ITEM_LINKS);
}

// ------------------------------------------------
// Form fields
// ------------------------------------------------

/**
 * The markup for the six link slots. Rows start hidden except the
 * first — a form showing six empty pairs of inputs is overwhelming,
 * so extra rows are revealed one at a time by the "+ Add another
 * link" button. All six always exist in the DOM, which keeps
 * form.reset() and value-filling straightforward.
 */
export function linkFieldsHtml(idPrefix) {
  const rows = Array.from({ length: MAX_ITEM_LINKS }, (_, i) => `
    <div class="link-row" data-link-row="${i}"${i === 0 ? "" : " hidden"}>
      <input type="text" name="linkLabel${i}" class="link-row-label" placeholder="Label (e.g. Worksheet)" aria-label="Link ${i + 1} label">
      <input type="text" inputmode="url" name="linkUrl${i}" class="link-row-url" placeholder="https://…" aria-label="Link ${i + 1} URL">
      <button type="button" class="link-row-clear" data-link-clear="${i}" aria-label="Clear link ${i + 1}">✕</button>
    </div>
  `).join("");

  return `
    <div class="field field-wide link-fields" id="${idPrefix}Links">
      <span>Links (optional — up to ${MAX_ITEM_LINKS})</span>
      <div class="link-rows">${rows}</div>
      <button type="button" class="link-add-btn" data-link-add>+ Add another link</button>
    </div>
  `;
}

/** Shows exactly `count` rows (always at least one) and updates the add button. */
function setVisibleRows(container, count) {
  const rows = container.querySelectorAll("[data-link-row]");
  const visible = Math.max(1, Math.min(MAX_ITEM_LINKS, count));
  rows.forEach((row, i) => { row.hidden = i >= visible; });
  const addBtn = container.querySelector("[data-link-add]");
  if (addBtn) addBtn.hidden = visible >= MAX_ITEM_LINKS;
  return visible;
}

/**
 * Wires the add/clear buttons. Call once, after the form markup is in
 * the DOM. Returns nothing — state lives in the DOM itself.
 */
export function wireLinkFields(form, idPrefix) {
  const container = form.querySelector(`#${idPrefix}Links`);
  if (!container || container.dataset.wired) return;
  container.dataset.wired = "true";

  const addBtn = container.querySelector("[data-link-add]");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const shown = container.querySelectorAll("[data-link-row]:not([hidden])").length;
      const next = setVisibleRows(container, shown + 1);
      const row = container.querySelector(`[data-link-row="${next - 1}"]`);
      row?.querySelector(".link-row-label")?.focus();
    });
  }

  container.querySelectorAll("[data-link-clear]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = btn.dataset.linkClear;
      const row = container.querySelector(`[data-link-row="${i}"]`);
      if (!row) return;
      row.querySelector(".link-row-label").value = "";
      row.querySelector(".link-row-url").value = "";
      // Collapse a cleared trailing row rather than leaving a gap,
      // but always keep the first row on screen.
      const rows = [...container.querySelectorAll("[data-link-row]")];
      const lastFilled = rows.reduce(
        (acc, r, idx) => (r.querySelector(".link-row-url").value.trim() ? idx : acc),
        -1
      );
      setVisibleRows(container, lastFilled + 2);
    });
  });
}

/**
 * Injects the six link slots into a form's `.task-form-grid` (falling
 * back to the form itself) and wires them up. Doing this from JS
 * rather than hand-writing eighteen inputs across three HTML files
 * keeps the three forms guaranteed identical, and makes the row count
 * a single constant to change.
 *
 * Safe to call repeatedly — it no-ops once the fields are mounted.
 * Returns true if the fields are present and usable.
 */
export function mountLinkFields(form, idPrefix) {
  if (!form) return false;
  let container = form.querySelector(`#${idPrefix}Links`);
  if (!container) {
    const grid = form.querySelector(".task-form-grid") || form;
    grid.insertAdjacentHTML("beforeend", linkFieldsHtml(idPrefix));
    container = form.querySelector(`#${idPrefix}Links`);
  }
  if (!container) return false;
  wireLinkFields(form, idPrefix);
  return true;
}

/** Populates the six slots from a stored item (or clears them for a new one). */
export function fillLinkFields(form, idPrefix, item) {
  const container = form.querySelector(`#${idPrefix}Links`);
  if (!container) return;
  const links = readLinks(item);

  for (let i = 0; i < MAX_ITEM_LINKS; i += 1) {
    const labelInput = form.querySelector(`[name="linkLabel${i}"]`);
    const urlInput = form.querySelector(`[name="linkUrl${i}"]`);
    if (!labelInput || !urlInput) continue;
    labelInput.value = links[i] ? links[i].label : "";
    urlInput.value = links[i] ? links[i].url : "";
  }

  // Show every filled row plus one empty one to type into.
  setVisibleRows(container, links.length + 1);
}

/**
 * Reads the six slots back out. Returns { links, invalid } — `invalid`
 * lists the 1-based row numbers whose URL couldn't be parsed, so the
 * caller can show an error instead of silently dropping what someone
 * typed.
 */
export function readLinkFields(form) {
  const links = [];
  const invalid = [];

  for (let i = 0; i < MAX_ITEM_LINKS; i += 1) {
    const labelInput = form.querySelector(`[name="linkLabel${i}"]`);
    const urlInput = form.querySelector(`[name="linkUrl${i}"]`);
    if (!labelInput || !urlInput) continue;

    const rawUrl = urlInput.value.trim();
    const rawLabel = labelInput.value.trim();
    if (!rawUrl) {
      // A label with no URL is an incomplete row, not a link.
      continue;
    }

    const url = normalizeUrl(rawUrl);
    if (!url) {
      invalid.push(i + 1);
      continue;
    }
    links.push({ label: rawLabel || labelFromUrl(url), url });
  }

  return { links: links.slice(0, MAX_ITEM_LINKS), invalid };
}

// ------------------------------------------------
// Card rendering
// ------------------------------------------------

/** The clickable link chips shown on a homework/announcement/event card. */
export function linkChipsHtml(item) {
  const links = readLinks(item);
  if (links.length === 0) return "";
  return `
    <div class="item-links">
      ${links
        .map(
          (l) => `<a class="task-link-chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" class="link-chip-icon">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>${escapeHtml(l.label)}</a>`
        )
        .join("")}
    </div>
  `;
}
