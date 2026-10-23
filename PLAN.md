# 8CM cleanup — Step 1: global infrastructure

Scope: strip the monitor system, motion/sound, looping nav and decorative stats.
Keep: light/dark mode and one clean responsive layout.

This folder is the **new base shell** (`shell.css`, `shell.js`, `index.html` template).
Nothing in your original project has been modified. Tested in Chromium at 390 / 768 / 1280 px,
dark and light: no horizontal overflow, theme toggle persists, phone menu and "More" menu work.

## 1. New navigation

One header, identical on every page, no JS-positioned pills, no looping track:

| Slot | Links |
|---|---|
| Inline | Home · Timetable · Events · Directory · Pitch |
| "More" (a native `<details>`) | Archives · Achievements · Rankings · Gallery · Resources · About |
| Right | light/dark button, and a hamburger on phones (≤ 820 px) |

- Current page is marked with `aria-current="page"` by `shell.js` (no per-page link reordering).
- The old second row (`.hub-nav` scrollspy) is gone; use plain anchor links inside pages if needed.
- Brand is a text wordmark ("8CM.") because `cm-logo.png` is light-coloured and disappears in light mode.
- The theme boot snippet in `<head>` must be copied to every page (no flash on load). It now also
  respects the OS light/dark setting on a first visit; the stored choice wins afterwards.
- Accent colour is fixed per mode. The picker, custom colour and "settings" modal are removed.

## 2. What gets deleted

**Monitor system (delete outright)**
`manage.html`, `manage.js`, `monitor-manage.js`, `auth.js`, `auth-ui.js`, `audit.js`,
`profile-modal.js`, `avatars.js`, `auth-contract.test.mjs`, `firestore.rules.test.mjs`,
`P0-SECURITY-NOTES.md`, `PHASE2-AUTH-IDENTITY-REPORT.md`, `HANDOFF.md`, `MERGE-FIX-NOTES.md`.
Also the allowlist / invite / claim / `activityLogs` / `notifications` rules in `firestore.rules`.

**CRUD on hold (move to `_on-hold/`, don't delete)**
`student-manage.js`, `teacher-manage.js`, `football-manage.js`, `football-points.js`, `arrange.js`,
`item-links.js`, `tasks.js`, plus the add/edit forms and `.monitor-only` buttons in each page and the
write halves of `assignments.js`, `notices.js`, `announcements.js`, `resources.js`, `events.js`,
`achievements.js`, `gallery.js`, `archive-materials.js`, `quick-links.js`.

**Sound / music**
`sound.js`, `bgm.js`, the `<link rel=modulepreload bgm.js>` snippet in every `<head>`,
`initHoverSfx`, and `play*()` imports in 25 modules.

**Motion / looping nav**
`main-nav.js`, `nav-boot.js` (also drops the ghost account pill and version badge), splash and grain
markup, `html.is-preparing/is-arriving`, `@view-transition` and the `page-enter` / `page-fade` rules.
`style.css` has 20 `@keyframes`, 124 `transition:` and 47 `animation:` declarations.

**Decorative stats**
`stats.html`, `initStatCountUp`, `.stat-number[data-count]`, `.my-day-card` stats, `renderHouseChart`.

## 3. Things to decide (I did not want to guess)

1. **`glance-panels.js` / "This week" hero panel and `rankings.html`** — live data, but arguably decorative.
   I treated neither as deleted. Keep or cut?
2. **Homework "Completed / Pending" filters** — they rely on per-student `assignmentStatus`, which needs sign-in.
   Without auth they can't work, so the filter row should go (leaving All / Due soon / Overdue).
3. **`style.css` (7,471 lines)** — it's append-only and full of motion. I recommend replacing it with `shell.css`
   and re-adding each page's component styles one page at a time, rather than deleting rules in place.
4. **`firestore.rules`** — content collections are already `allow read: if true`, so public pages keep working
   after auth is removed. Writes should be locked to `false` while CRUD is on hold. **Do not republish rules
   until you've tested** — the existing emulator tests are being deleted.
5. **`firebase-config.js` still loads Auth** — switch to Firestore-only.

## 4. Suggested order

1. Adopt `shell.css` / `shell.js` / header on `index.html`, then on every other page (find/replace the header block).
2. Remove `manage.html` + auth/audit/monitor files; strip `subscribeAuth` and `logAction` calls from modules.
3. Remove sound/bgm and their imports.
4. Move write code to `_on-hold/`; leave pages read-only.
5. Retire the old `style.css` page by page; re-run overflow checks at 320/390/768/1280.
6. Reduce `firestore.rules` to read-only; retest; republish.
