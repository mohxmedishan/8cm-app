// ============================================
// 8CM — Shared "attached links" stack
// ------------------------------------------------
// Homework, announcements and events all need the same thing: any number of
// external resource links per item (a Google Form, a Drive
// folder, a worksheet, a ClassDojo story…), each independently
// nameable. Rather than writing this three times, all three import
// this module.
//
// UX: a stack of [name] [url] row pairs. Paste a URL or press Enter
// in the URL field and, if that row is the last one, a fresh empty row appears below it — no add/remove buttons to
// click. A row with no name typed in is labeled "Link 1", "Link 2",
// etc. by its position among that item's saved links; typing a name
// in later and resaving is how a link gets renamed.
//
// Why links and not uploaded files: this project runs on Firebase's
// Spark (free) plan, which doesn't include Storage. Links keep the
// resource wherever its owner actually manages it, cost nothing to
// store, and never hit Firestore's ~1 MiB per-document limit.
//
// Stored shape:  links: [{ label, url }, …]   (no limit)
// Backward compatible with two older shapes this project has used:
// a single `link` string, and a `links` array of bare URL strings
// (no names) — readLinks() below folds both into the same shape, so
// nothing needs migrating and old items keep rendering correctly.
// ============================================

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

/**
 * Normalizes whatever is stored on a document into a clean
 * [{label, url}] array, handling all three shapes this project has
 * ever stored (see header comment) and dropping anything that isn't
 * a valid http(s) URL. An unnamed link is labeled by its position
 * among the item's *valid* links, not its raw slot index, so a
 * dropped invalid entry earlier in the list doesn't renumber the
 * ones after it unpredictably.
 */
export function readLinks(item) {
  if (!item) return [];
  let raw;
  if (Array.isArray(item.links)) raw = item.links;
  else if (item.link) raw = [item.link]; // oldest shape: single `link` string
  else raw = [];

  const valid = raw
    .map((entry) => {
      const isObject = entry && typeof entry === "object";
      const url = normalizeUrl(isObject ? entry.url : entry);
      if (!url) return null;
      const label = isObject ? String(entry.label || "").trim() : ""; // bare-string shape never had names
      return { label, url };
    })
    .filter(Boolean);

  return valid.map((l, i) => ({ label: l.label || `Link ${i + 1}`, url: l.url }));
}

// ------------------------------------------------
// The input stack
// ------------------------------------------------

function rowsIn(container) {
  return Array.from(container.querySelectorAll(":scope > .link-input-row"));
}

/** Appends one empty (or pre-filled) row and wires its add-next behavior. */
function addRow(container, { name = "", url = "" } = {}) {
  const row = document.createElement("div");
  row.className = "link-input-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "link-name-input";
  nameInput.placeholder = "Name (optional)";
  nameInput.autocomplete = "off";
  nameInput.value = name;

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.inputMode = "url";
  urlInput.className = "link-input";
  urlInput.placeholder = "Paste a link…";
  urlInput.autocomplete = "off";
  urlInput.value = url;

  row.append(nameInput, urlInput);
  container.appendChild(row);

  const maybeGrow = () => {
    if (!urlInput.value.trim()) return;
    if (row !== container.lastElementChild) return; // only the last row grows the stack
    addRow(container);
  };

  urlInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    maybeGrow();
  });
  urlInput.addEventListener("paste", () => setTimeout(maybeGrow, 0));

  return row;
}

/**
 * Fills the stack from a stored item (or clears it to one empty row
 * for a new item). Call this in openForm(), after the container is
 * already in the DOM.
 */
export function setLinkStack(container, item) {
  if (!container) return;
  container.innerHTML = "";
  const links = readLinks(item);
  if (links.length === 0) {
    addRow(container);
    return;
  }
  links.forEach((l) => addRow(container, { name: l.label, url: l.url }));
  addRow(container); // one spare row to type into
}

/**
 * Reads the stack back out on submit. Blank rows are dropped; a
 * filled row with no name gets "Link 1", "Link 2", etc. by its
 * position among the links actually being saved.
 */
export function readLinkStack(container) {
  if (!container) return [];
  const collected = rowsIn(container)
    .map((row) => {
      const url = normalizeUrl(row.querySelector(".link-input").value);
      if (!url) return null;
      const label = row.querySelector(".link-name-input").value.trim();
      return { label, url };
    })
    .filter(Boolean);

  return collected.map((l, i) => ({ label: l.label || `Link ${i + 1}`, url: l.url }));
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
          (l) =>
            `<a class="task-link-chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
        )
        .join("")}
    </div>
  `;
}
