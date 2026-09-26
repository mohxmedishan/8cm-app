# 8CM — Design guide (V17.4)

Read this before adding or changing any UI. The goal is that a new page or
component looks like it was always part of the site. **Don't invent a new
style.** Reuse the tokens and components below, and add rules in a new
dated section at the **bottom** of `style.css` (never edit old sections
unless fixing a bug in them).

Companion docs: `README.md` (architecture, data, Firestore), this file
(visual language + interaction rules).

---

## 1. The look in one paragraph

Quiet, dark, editorial. A near-black warm-grey canvas, off-white text, one
muted sage accent, serif display headings (Fraunces) over a clean sans body
(IBM Plex Sans). Cards are flat, bordered, softly rounded (6px) with subtle
tinted gradients — no heavy shadows, no neon, no glassy blobs. Motion is
short, eased and purposeful. Light theme is the same design with the tokens
swapped. Small touches of colour come only from the palette below.

## 2. Tokens (defined in `:root`, light overrides in `html[data-theme="light"]`)

Never hard-code colours, radii or fonts. Use the variables.

| Token | Use |
|---|---|
| `--bg`, `--bg-elevated`, `--bg-elevated-2` | page, card/panel, inset/tile surface |
| `--border`, `--border-soft` | normal line, hairline dividers |
| `--text`, `--text-muted`, `--text-faint` | primary, secondary, tertiary text |
| `--accent`, `--accent-strong`, `--accent-soft` | the sage accent; strong = text on dark; soft = tinted fill |
| `--house-winter/autumn/spring/summer` | blue / orange / green / amber. **Semantic for houses**; also used as the palette for decorative "tones" (icons, dots) |
| `--danger`, `--danger-soft` | errors, overdue |
| `--font-display` (Fraunces) | headings, big numbers, brand |
| `--font-body` (IBM Plex Sans) | everything else |
| `--radius-s` 3px | buttons, inputs |
| `--radius-m` 6px | cards, panels, tiles, chips-in-cards |
| Pills / chips / avatars | `999px` / `50%` |
| `--ease` `cubic-bezier(.22,1,.36,1)` | every transition and animation |

Tinting: mix a tone into transparent, never use a fixed hex —
`color-mix(in srgb, var(--tone) 16%, transparent)`.

## 3. Layout

- **Container:** `.section-inner` — `max-width: 1080px`, side padding 24px
  (16px at ≤420px, plus `env(safe-area-inset-*)`). *Everything* — nav,
  hero, sections, footer — sits in this container so left edges line up.
  Never add another horizontal padding layer inside it.
- **Sections:** `.hub-section` (Archives/Houses) / the Home section classes.
  Vertical rhythm 70px desktop; roughly 48px on phones. Each begins with
  `.section-head` = `h2` (display font) + `.section-sub` (muted, 0.98rem).
- **Anchor targets** need `scroll-margin-top: calc(var(--nav-h) + var(--sub-h) + 12px)`
  (already applied to the existing ids — add your new ids to that selector list).
- Breakpoints in use: `980px`, `860px` (hero stacks), `720px` (phone layout),
  `420px`/`360px` (tight phones). Design phone-first; test at 320, 360, 390, 768, 1280.
- **No horizontal overflow, ever.** In grids on phones use
  `repeat(n, minmax(0, 1fr))` — plain `1fr` lets a long word blow the column out.
  Wide content (timetable) scrolls inside its own container.

## 4. Page skeleton

```html
<body data-page="football|houses|home|archives|rankings">   <!-- picks the nav slot -->
  splash · grain · <header class="nav" id="nav"> … primary nav … </header>
  <nav class="hub-nav"> subnav (optional) </nav>
  <main id="main"> hero + sections </main>
  <footer class="footer"> … </footer>
```

- **Main nav** — five destinations that **loop**: Football · Houses · Home ·
  Archives · Rankings, then round to Football again. Markup:
  `nav.primary-nav > .primary-nav-track > a.primary-nav-link[data-page]`.
  Link to Home as **`index.html`** — never `index.html#top`.
  - **Each page writes its own links in ring order**, current page in the
    middle (slot 3 of 5), two neighbours each side. Rankings reads
    `Home · Archives · [Rankings] · Football · Houses`; Football reads
    `Archives · Rankings · [Football] · Houses · Home`. The first paint is
    therefore already right (no JS positioning), and DOM order = visual
    order, so **Tab walks the links left to right**. Left/Right arrows move
    focus round the ring, Home/End jump to the ends (`main-nav.js`).
  - To add a page: add it to the ring and rewrite the track on **every**
    page in the new per-page order (the ring is 5 wide — the slot maths uses
    `20%`; change it if the count changes). Pages that aren't one of the five
    (e.g. `manage.html`) borrow a parent's `data-page` and its ring order
    (the Monitor panel uses `home`).
  - The pill is a **fixed** `::before` in the centre slot. It never moves.
  - The track only moves while a navigation is starting: `main-nav.js` sets
    `--nav-shift` (target slot − centre slot) and adds temporary `.is-clone`
    links just outside both ends (the links that wrap round the ring) so the
    edges never go blank mid-glide. They are `aria-hidden` and removed on
    cancel.
  - Outer slots fade via a CSS mask (gradient), so the edge labels recede.
  - Slots are fixed-width (`--slot`, 84–104px desktop, 20% of the row on phones).
    **Never make slot widths depend on text** — that is what made the bar drift
    when fonts loaded.
  - The header grid is `1fr auto 1fr` on desktop so the nav is centred on the
    page regardless of the logo image or the Sign-in button appearing.
- **Things that must not pop in** (`nav-boot.js`, a classic script every page
  loads right after its header): the **version badge** is created there and
  the **account pill** is shown from a remembered copy (`.nav-auth-ghost`,
  inert) until `auth-ui.js` renders the real one. `.nav-auth:empty` is
  `display:none` so the empty slot adds no gap. Don't create the badge or
  fill `#authSlot` late from a module.
- **Subnav** (`.hub-nav > .hub-nav-inner > a.hub-nav-link`): one slim row —
  36px tall (34px on phones), 0.78rem text, a 2px accent underline that grows
  in under the active tab, and no gap beneath it. Don't add padding or a
  second row. The **first tab is
  always `href="#top"` and is named after the page** (Home / Houses / Archives).
  It scrolls to the true top. The rest are section ids. Scrollspy is automatic
  (`main-nav.js`) — don't write your own.
- Do not put `id="top"` on any element (the browser treats `#top` as
  "top of the page" only when no element has that id).

## 5. Navigation & motion rules (all implemented in `main-nav.js` + `bgm.js`)

1. **Every same-site link slides the nav track to the destination (300ms), then navigates.** With cross-page view transitions (Chrome/Edge 126+, Safari 18.2+; `@view-transition` in `style.css`) the content is left alone and the browser dissolves old page → new page; otherwise the content fades out (~240ms) first. The header does
   *not* fade — it persists. Opt out with `data-no-transition`.
2. **Clicking the page you're on never reloads** — it smooth-scrolls to the top.
   Real in-page anchors (`#students`) use native smooth scroll.
3. **Music fades with the page** (`fadeOutBgm` / `fadeInBgm`) and resumes at the
   right spot. Never call `audio.volume` directly; go through `bgm.js`.
4. The **splash shows once per tab session** (`sessionStorage["8cm:splash-seen"]`).
5. Phone header: the logo row scrolls away; only the four tabs + subnav stay
   stuck. `--nav-h`, `--nav-row1`, `--sub-h` are published by JS; sticky
   offsets and scroll margins use them. Don't hard-code header heights.
6. Motion budget: 150–250ms for hover/press, 400–700ms for entrances, always
   `var(--ease)`. Everything must respect `prefers-reduced-motion`.
7. **Calm page loads.** On fresh loads and reloads (and in browsers without view transitions) each page's `<head>` adds `html.is-preparing`;
   `main`, the subnav and the footer stay at opacity 0 (and hero animations
   stay paused) until fonts are ready (700ms max, 1.5s failsafe), then they
   fade in. Anything that would visibly reflow — font swap, first layout —
   therefore happens unseen. Don't animate entrances with keyframes that
   start on parse; hang them off the reveal. Never leave a lingering
   `transform` on `main` (breaks `position: fixed` children).
8. **No layout shift between pages:** `html { overflow-y: scroll; scrollbar-gutter: stable }`
   keeps short and long pages the same width. Reserve space for anything that
   loads late (skeletons: `.is-loading`) instead of letting it push content.

## 6. Components

### Buttons — `.btn`
`.btn.btn-primary` (sage fill, soft glow) and `.btn.btn-ghost` (bordered).
Radius 3px, 12px×22px padding, 0.92rem/500. On phones hero buttons are a grid:
first button full width, the rest share a row (`.hero-actions`).

### Hero — `.hero` (Home) / `.page-hero.hero` (Archives, Houses)
```html
<section class="page-hero hero">
  <div class="section-inner hero-grid">      <!-- 1.15fr / .85fr, stacks ≤860 -->
    <div class="hero-text"> back link · title · sub · .hero-actions </div>
    <aside class="hero-visual glance-panel …"> … </aside>
  </div>
</section>
```
- **On phones text comes first, visual second** — for every page (Houses uses
  `.hero-mirrored`; it is re-ordered ≤860px).
- Home title: `.hero-title` display font, 3 lines, `clamp(1.85rem, 8vw, 2.6rem)` on phones.
  Use `<br class="br-wide">` for breaks that should vanish on phones.
- **Every hero visual is a `.glance-panel` now** (Home, Archives, Houses/Directory)
  — there's no bare data-viz (bar chart, etc.) sitting directly in a hero anymore.
  If a page needs to show a chart, it goes in its own section further down (see
  the by-house bar chart below), and the hero gets a glance panel of shortcut
  tiles instead.

### Glance panel — the hero visual (`glance-panels.js`)
A `.glance-panel` (elevated card, radial sage tint, 18px padding / 14px phone)
containing, top to bottom:
1. `.glance-head` — `.glance-kicker` (uppercase 0.72rem, pulsing `.glance-live` dot) + `.glance-date`.
2. Optional `.glance-week` — 5 `button.glance-day` chips (`is-today`, `is-past`,
   `has-items`). Dots: `.glance-dot-hw` accent = homework due, `.glance-dot-ev`
   amber = event, `.glance-dot-an` blue = dated announcement. **Tapping a chip
   with items takes you to the real item** (scrolls to it and flashes it with
   `.is-flashed`); one item jumps straight there, several open a small
   `.glance-tray` list to pick from. Days with nothing are disabled. Targets are
   found by `data-id` on `.hw-row`, `.event-card`, `.announcement-row` — keep
   those attributes when you change those renderers.
3. `.glance-tiles` — 2-column grid of `a.glance-tile`. A tile = `.glance-tile-top`
   (`.glance-icon` 32px rounded-square, tinted by `--tone`; `.glance-arrow`),
   `.glance-num` (Fraunces 2.3rem, tabular numbers; `.is-word` for "Today"),
   `.glance-tile-label`, `.glance-tile-note` (2-line clamp, reserves 2 lines).
   Set the tone inline: `style="--tone: var(--house-summer)"`.
   `data-state="warn|alert"` colours the note.
4. Optional `a.glance-strip` — wide one-line tile (icon + label + title + arrow).

Numbers that come from Firestore data must use **live** subscriptions
(`onLiveStudents`, not `onStudents`) so a built-in seed value never flashes
first; show the `.is-loading` skeleton until data arrives.

Rules: every tile is a link to a real section; data comes from live modules;
loading state is `.is-loading` (shimmer) removed when data arrives; numbers use
`setCount()` (animated, respects reduced motion). Icons are inline 24×24 SVG,
`stroke: currentColor`, width 1.7, round caps/joins — no icon fonts, no emoji.
Hover: lift 2px, border → tone, arrow nudges. Press: `scale(.985)`.

A tile can be **static** instead of live (a structural fact that never
changes, e.g. "4 houses") — give it `.is-static` so `initXGlance()` skips it
when adding `.is-loading`, and hardcode its `.glance-num` straight in the HTML.
Don't reach for `.is-static` for anything that's actually roster/content data;
it's only for genuinely fixed facts.

Three panels exist, each `#<name>Glance` with its own `initXGlance()` in
`glance-panels.js`, all booted from the same `OPTIONAL_MODULES` list in
`script.js` (each no-ops if its container isn't on the page):
- **Home** (`#homeGlance`) — "This week" strip + homework / next-event /
  latest-achievement tiles.
- **Archives** (`#archivesGlance`) — "Archive snapshot": Subjects, Periods
  (both read live off today's timetable in `timetable-data.js`), Gallery,
  Materials.
- **Houses / Directory** (`#housesGlance`) — "Directory snapshot": Students,
  Teachers, Houses (`.is-static`, always 4), Guests (filtered from the live
  student roster). The actual by-house headcount bar chart (`.bar-chart` /
  `#housesChart`, still rendered by `renderHouseChart()` in `script.js`) moved
  out of the hero and now sits in a `.house-chart-card` at the top of the
  "By house" section, right above the house roster cards it summarises.

### Cards
`background: var(--bg-elevated)`, `1px solid var(--border)`, radius 6px,
padding 16–24px. Inset surfaces use `--bg-elevated-2`. Left accent bar on
person cards (`.teacher-card`, `.student-card`) uses the house/subject colour.
Hover on desktop only (`@media (hover:hover)`); touch gets `:active` press.

### Chips / pills
`999px` radius, 0.72–0.8rem, `--bg-elevated-2` fill with `--border-soft`.
House chips carry a 6px dot in the house colour.

### Forms
Inputs/selects sit in `.filter-box` (label above, uppercase 0.68rem muted).
Filter grids are 2 columns on phones; an odd last box spans both.
Minimum tap target 40px (44px for primary actions).

### Numbers & dates
Display font for big numbers, `font-variant-numeric: tabular-nums`. Dates via
the shared helpers (`timetable-data.js` `dateForDayKey`, `events.js`
`daysUntil`) — don't recompute weekday logic locally.

## 7. Phone checklist (run before shipping any UI)

- [ ] 320 / 360 / 390 px: no horizontal scroll, no card sticking past the gutter.
- [ ] Hero: title first, panel second, buttons ≤ 2 rows.
- [ ] Sticky chrome ≤ ~100px (tabs + subnav). Anchors land *below* it.
- [ ] Tap targets ≥ 40px; no hover-only affordances.
- [ ] Nothing important hidden under the fixed version badge / home indicator.
- [ ] Works with the iOS home-screen app (safe-area insets) and the light theme.
- [ ] Clicking a link fades out/in and the nav track slides; clicking the current page scrolls to top.
- [ ] Reload every page: the navbar must not move by a single pixel during load, and the version badge and account picture are there from the first paint.
- [ ] Tab through the main nav (left to right), then use ←/→ (and Home/End) on a focused link.

## 8. Don'ts

- Don't add new colours, fonts, radii, or shadows beyond what's here.
- Don't add libraries or build steps; it's plain HTML/CSS/ES modules.
- Don't use `localStorage`/`sessionStorage` for anything but the existing keys
  (guard every access with try/catch).
- Don't position the nav pill with JS, and don't size nav slots by their text.
- Don't hard-code header heights, don't add `#top` ids, don't link to `index.html#top`.
- Don't write your own scrollspy, page-transition or audio-fade code.
- Don't leave a link that calls `preventDefault()` without navigating or scrolling.
