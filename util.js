export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Accepts "site.com/x" or "https://site.com/x"; rejects javascript:, data:, etc.
export function normalizeUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.href : null;
  } catch { return null; }
}

// Handles the three shapes stored in Firestore: links:[{label,url}], links:["url"], link:"url".
export function readLinks(item) {
  const raw = Array.isArray(item?.links) ? item.links : item?.link ? [item.link] : [];
  return raw
    .map((e) => {
      const obj = e && typeof e === "object";
      const url = normalizeUrl(obj ? e.url : e);
      return url ? { label: obj ? String(e.label || "").trim() : "", url } : null;
    })
    .filter(Boolean)
    .map((l, i) => ({ label: l.label || `Link ${i + 1}`, url: l.url }));
}
