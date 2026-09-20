// ============================================
// 8CM — Navigation system (V17.1)
// ------------------------------------------------
// One module owns everything about moving around the site, so every
// page behaves the same. Plain <a> links stay plain <a> links — if
// this file fails to load, navigation still works, just without the
// polish.
//
//  1. STICKY METRICS  Publishes --nav-h (height of the header once it
//     is "stuck"), --nav-row1 (the part of a phone header that
//     scrolls away) and --sub-h (the subnav). CSS uses them so
//     anchor jumps and the sticky subnav always clear the real chrome.
//  2. ACTIVE PILL     The highlighted pill behind the current primary
//     destination (Football / Houses / Home / Archives).
//  3. PAGE TRANSITIONS  Every same-site link fades the page content
//     out (and the background music with it), then navigates. The
//     next page fades its content in. The header stays put, so the
//     navbar feels like it persists across pages.
//  4. SAME-PAGE CLICKS  Clicking a link to the page you're already on
//     never reloads — it smooth-scrolls to the top instead.
//  5. SUBNAV          Scrollspy for .hub-nav, with a real "top" target
//     (href="#top") and an active tab that scrolls itself into view
//     on phones.
//
// Rules for anyone editing this file:
//  - Links to Home are `index.html` (NOT `index.html#top`): a "#top"
//    fragment used to make the browser scroll <main> to the top of the
//    viewport, i.e. underneath the sticky header.
//  - Opt a link out of the fade with data-no-transition.
//  - Never call preventDefault on a link without also navigating or
//    scrolling — a dead link is worse than an abrupt one.
// ============================================

const LEAVE_MS = 240; // fade-out length before the browser navigates
const SAFETY_MS = 7000; // give up waiting for a navigation that never happens

const html = document.documentElement;
const mobileQuery = window.matchMedia("(max-width: 720px)");
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- URL helpers ----------
// "/index.html", "/", "/houses.html" and "/houses" all compare equal
// to themselves regardless of how the host serves them.
function normalPath(pathname) {
  return (pathname.replace(/index\.html$/, "").replace(/\.html$/, "").replace(/\/+$/, "")) || "/";
}
function isSamePage(url) {
  return normalPath(url.pathname) === normalPath(location.pathname) && url.search === location.search;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  if (location.hash) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
  }
}

// ---------- Background music hooks (best effort) ----------
let bgm = null;
import("./bgm.js").then((m) => { bgm = m; }).catch(() => {});
const fadeOutAudio = (ms) => { try { return bgm && bgm.fadeOutBgm ? bgm.fadeOutBgm(ms) : null; } catch (_) { return null; } };
const fadeInAudio = () => { try { if (bgm && bgm.fadeInBgm) bgm.fadeInBgm(); } catch (_) {} };

// ---------- 1. Sticky metrics ----------
function initStickyMetrics() {
  const header = document.getElementById("nav");
  if (!header) return;
  const sub = document.querySelector(".hub-nav");
  const tabs = header.querySelector(".primary-nav");

  // Height of the device safe area at the top (notch / iOS status bar
  // in a home-screen app). 0 in a normal browser tab.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)";
  document.body.appendChild(probe);

  const measure = () => {
    // On phones the header is two rows (logo + settings, then the four
    // destinations). Only the destinations stay stuck; the top row
    // scrolls away with the page (CSS: .nav { top: calc(-1 * var(--nav-row1)) }).
    // The measurement needs the header at its natural position, so it
    // uses a difference of two rects (constant while scrolling).
    const safeTop = probe.offsetHeight || 0;
    let row1 = 0;
    let navH = header.offsetHeight;
    if (mobileQuery.matches && tabs) {
      row1 = Math.round(tabs.getBoundingClientRect().top - header.getBoundingClientRect().top - 6);
      if (row1 > 0) {
        // CSS: top = safe-area − row1, so the stuck header's bottom edge
        // sits at (height − row1 + safe-area) from the viewport top.
        navH = header.offsetHeight - row1 + safeTop;
      } else {
        row1 = 0;
      }
    }
    html.style.setProperty("--nav-row1", `${row1}px`);
    html.style.setProperty("--nav-h", `${Math.round(navH)}px`);
    html.style.setProperty("--sub-h", `${sub ? sub.offsetHeight : 0}px`);
  };

  measure();
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure, { once: true });
  window.addEventListener("orientationchange", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    if (sub) ro.observe(sub);
  }
}

// ---------- 2. Active pill ----------
function initPrimaryIndicator() {
  const nav = document.getElementById("navLinks");
  if (!nav) return null;
  const links = Array.from(nav.querySelectorAll(".primary-nav-link"));
  if (!links.length) return null;

  let indicator = nav.querySelector(".primary-nav-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "primary-nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.insertBefore(indicator, nav.firstChild);
  }

  const currentPage = document.body.dataset.page || "";
  const activeLink = links.find((a) => a.dataset.page === currentPage) || null;

  // offset* metrics are relative to the nav (its own positioned box),
  // so they aren't thrown off by scrolling or transforms the way
  // getBoundingClientRect() differences can be.
  function place(link, animate) {
    if (!link || !link.offsetWidth) {
      indicator.style.opacity = "0";
      return;
    }
    if (!animate) indicator.style.transition = "none";
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.height = `${link.offsetHeight}px`;
    indicator.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`;
    indicator.style.opacity = "1";
    if (!animate) {
      void indicator.offsetHeight; // commit the un-animated placement first
      indicator.style.transition = "";
    }
  }

  links.forEach((link) => {
    const isActive = link === activeLink;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  place(activeLink, false);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(activeLink, false)).catch(() => {});
  window.addEventListener("load", () => place(activeLink, false), { once: true });
  const replace = () => place(links.find((a) => a.classList.contains("is-active")) || activeLink, false);
  window.addEventListener("resize", replace);
  if ("ResizeObserver" in window) new ResizeObserver(replace).observe(nav);

  return {
    moveTo(link) {
      links.forEach((a) => a.classList.toggle("is-active", a === link));
      place(link, true);
    },
    restore() {
      links.forEach((a) => a.classList.toggle("is-active", a === activeLink));
      place(activeLink, true);
    },
  };
}

// ---------- 3 + 4. Page transitions and same-page clicks ----------
function initPageTransitions(indicator) {
  let leaving = false;
  let safetyTimer = null;
  let navTimer = null;

  function endLeaving() {
    if (!leaving && !html.classList.contains("is-leaving")) return;
    leaving = false;
    clearTimeout(safetyTimer);
    clearTimeout(navTimer);
    html.classList.remove("is-leaving");
    if (indicator) indicator.restore();
    fadeInAudio();
  }

  function leaveTo(href, link) {
    if (leaving) return;
    if (prefersReducedMotion()) {
      window.location.href = href;
      return;
    }
    leaving = true;
    if (indicator && link && link.classList.contains("primary-nav-link")) indicator.moveTo(link);
    html.classList.add("is-leaving");
    fadeOutAudio(LEAVE_MS);
    navTimer = window.setTimeout(() => { window.location.href = href; }, LEAVE_MS);
    // If the navigation never happens (cancelled, blocked, very slow
    // network), don't leave the person staring at an empty page.
    safetyTimer = window.setTimeout(endLeaving, SAFETY_MS);
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.hasAttribute("data-no-transition")) return;

    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return; // external, mailto:, tel: …

    if (isSamePage(url)) {
      // A real in-page anchor (#students) is left to the browser: smooth
      // scrolling + scroll-margin-top already land it under the header.
      if (url.hash && url.hash !== "#top") return;
      // Same page, nothing more specific asked for → never reload.
      e.preventDefault();
      if (window.scrollY > 2) scrollToTop();
      return;
    }

    e.preventDefault();
    leaveTo(url.href, a);
  });

  // Restored from the back/forward cache (Safari, Chrome): the page is
  // exactly as we left it — faded out and silent — so bring it back.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted || html.classList.contains("is-leaving")) endLeaving();
  });

  // Warm the next page as soon as a link is likely to be used, so the
  // gap between fade-out and fade-in is as short as the network allows.
  const warmed = new Set();
  function warm(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || isSamePage(url) || !/\.html$|\/$/.test(url.pathname)) return;
    const key = url.pathname + url.search;
    if (warmed.has(key)) return;
    warmed.add(key);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url.pathname + url.search;
    document.head.appendChild(link);
  }
  document.addEventListener("touchstart", warm, { passive: true });
  document.addEventListener("pointerover", (e) => { if (e.pointerType === "mouse") warm(e); }, { passive: true });
}

// ---------- 5. Subnav ----------
function initSubnav() {
  const bar = document.querySelector(".hub-nav");
  if (!bar) return;
  const scroller = bar.querySelector(".hub-nav-inner") || bar;
  const links = Array.from(bar.querySelectorAll(".hub-nav-link"));

  const items = links
    .map((link) => {
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("#")) return null;
      const id = href.slice(1);
      if (id === "top") return { link, top: true, el: null };
      const el = document.getElementById(id);
      return el ? { link, top: false, el } : null;
    })
    .filter(Boolean);
  if (!items.length) return;

  let active = null;
  let lockUntil = 0;

  function reveal(link) {
    if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const left = link.offsetLeft - (scroller.clientWidth - link.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function setActive(item) {
    if (item === active) return;
    active = item;
    links.forEach((l) => {
      const on = l === item.link;
      l.classList.toggle("is-active", on);
      if (on) l.setAttribute("aria-current", "true");
      else l.removeAttribute("aria-current");
    });
    reveal(item.link);
  }

  function update() {
    if (Date.now() < lockUntil) return;
    // The reading line sits a little below the sticky chrome; whichever
    // section's top has crossed it is "current". The "top" tab counts as
    // crossed from the start, so it owns everything above the next section.
    const line = bar.getBoundingClientRect().bottom + 24;
    let current = items[0];
    items.forEach((it) => {
      const y = it.top ? -Infinity : it.el.getBoundingClientRect().top;
      if (y <= line) current = it;
    });
    // Short last sections never reach the reading line — at the very
    // bottom of the page the last tab wins.
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom && window.scrollY > 0) current = items[items.length - 1];
    setActive(current);
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("load", update, { once: true });

  items.forEach((item) => {
    item.link.addEventListener("click", () => {
      lockUntil = Date.now() + 900; // don't flicker through sections while it glides
      setActive(item);
      window.setTimeout(update, 950);
    });
  });

  // "#top" tabs: scroll to the true top of the page (not to <main>,
  // which starts underneath the sticky header).
  items.filter((i) => i.top).forEach((item) => {
    item.link.addEventListener("click", (e) => {
      e.preventDefault();
      scrollToTop();
    });
  });

  update();
}

export function initMainNav() {
  initStickyMetrics();
  const indicator = initPrimaryIndicator();
  initPageTransitions(indicator);
  initSubnav();
}
