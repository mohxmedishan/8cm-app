// ============================================
// 8CM — Primary navigation (Beta 17)
// ------------------------------------------------
// Two small, dependency-free enhancements layered on top of plain
// <a> links, so a failure here never breaks navigation itself:
//
// 1. A sliding "active position" pill behind whichever of the four
//    primary destinations (Football, Houses, Home, Archives) is
//    current — measured from the real rendered link, so it works
//    at any width without hand-tuned breakpoints.
// 2. A scrollspy for any .hub-nav (Home/Houses/Archives subnav) that
//    toggles .is-active on the link whose section is in view.
//
// This is a plain multi-page site — there is no client-side router.
// Clicking a different primary destination still does a real
// navigation; this module just gives the pill time to slide into
// place first so the switch doesn't feel like an abrupt jump.
// ============================================

function initPrimaryIndicator() {
  const nav = document.getElementById("navLinks");
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll(".primary-nav-link"));
  if (!links.length) return;

  let indicator = nav.querySelector(".primary-nav-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "primary-nav-indicator";
    indicator.setAttribute("aria-hidden", "true");
    nav.insertBefore(indicator, nav.firstChild);
  }

  const currentPage = document.body.dataset.page || "";
  let activeLink = links.find((a) => a.dataset.page === currentPage) || null;

  function place(link, animate) {
    if (!link) {
      indicator.style.opacity = "0";
      return;
    }
    const navBox = nav.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    if (!animate) indicator.style.transition = "none";
    indicator.style.width = `${linkBox.width}px`;
    indicator.style.height = `${linkBox.height}px`;
    indicator.style.transform = `translate(${linkBox.left - navBox.left}px, ${linkBox.top - navBox.top}px)`;
    indicator.style.opacity = "1";
    if (!animate) {
      // Force layout before releasing the transition override so the
      // very first placement never animates in from (0,0).
      // eslint-disable-next-line no-unused-expressions
      indicator.offsetHeight;
      indicator.style.transition = "";
    }
  }

  links.forEach((link) => {
    const isActive = link === activeLink;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });

  place(activeLink, false);
  // Web fonts change the links' widths after first paint — re-measure.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => place(activeLink, false)).catch(() => {});
  }
  window.addEventListener("load", () => place(activeLink, false), { once: true });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      if (link === activeLink) return;
      // Leave "open in new tab" / modified clicks to the browser.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = link.getAttribute("href");
      if (!href || link.target === "_blank" || reduceMotion) return;
      e.preventDefault();
      if (activeLink) activeLink.classList.remove("is-active");
      link.classList.add("is-active");
      place(link, true);
      window.setTimeout(() => {
        window.location.href = href;
      }, 180);
    });
  });

  // Re-measure whenever the nav's own box changes size — window resize,
  // the logo image finishing loading (it changes the grid column
  // widths and so where the centred links sit), fonts swapping in, etc.
  const replace = () => {
    const current = links.find((a) => a.classList.contains("is-active")) || activeLink;
    place(current, false);
  };
  window.addEventListener("resize", replace);
  if ("ResizeObserver" in window) new ResizeObserver(replace).observe(nav);
}

function initSubnavScrollspy() {
  document.querySelectorAll(".hub-nav").forEach((bar) => {
    const links = Array.from(bar.querySelectorAll(".hub-nav-link[href^='#']"));
    if (!links.length) return;
    const sections = links
      .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
      .filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
      links.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`));
    };
    setActive(sections[0].id);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  });
}

// Publishes the header's real rendered height as --nav-h so the sticky
// subnav sits directly under it whether the header is one row
// (desktop) or two (phones), instead of guessing a pixel value.
function initNavHeightVar() {
  const header = document.getElementById("nav");
  if (!header) return;
  const set = () => document.documentElement.style.setProperty("--nav-h", `${header.offsetHeight}px`);
  set();
  window.addEventListener("resize", set);
  if ("ResizeObserver" in window) new ResizeObserver(set).observe(header);
}

export function initMainNav() {
  initNavHeightVar();
  initPrimaryIndicator();
  initSubnavScrollspy();
}
