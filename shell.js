// 8CM lean shell — classic script, no dependencies. Does three things only:
// light/dark toggle, phone menu, "More" closes on outside click/Esc.
(function () {
  "use strict";
  var KEY = "8cm-theme-mode", root = document.documentElement;

  function setMode(m) {
    root.setAttribute("data-theme", m);
    var b = document.getElementById("themeBtn");
    if (b) b.setAttribute("aria-label", m === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }
  var b = document.getElementById("themeBtn");
  if (b) {
    setMode(root.getAttribute("data-theme") || "dark");
    b.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setMode(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  }

  var menuBtn = document.getElementById("menuBtn"), nav = document.getElementById("siteNav");
  function closeMenu() { if (nav) nav.classList.remove("is-open"); if (menuBtn) menuBtn.setAttribute("aria-expanded", "false"); }
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  var more = document.querySelector(".more");
  document.addEventListener("click", function (e) { if (more && !more.contains(e.target)) more.removeAttribute("open"); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (more) more.removeAttribute("open");
    closeMenu();
  });

  // Highlight the current page (also works without server-side templating).
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-list a").forEach(function (a) {
    if (a.getAttribute("href") === here) {
      a.setAttribute("aria-current", "page");
      var d = a.closest(".more"); if (d) d.setAttribute("open", "");
    }
  });
})();
