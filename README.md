# CM. — the 8CM class hub

The website for class 8CM (Abu Dhabi Indian School, Al Wathba, Branch 1). Students see today's homework,
announcements, events, the timetable, the class directory and more. **Monitors** (a small group of students
who run the site) add and edit all of it from the pages themselves — there is no separate admin app.

It is a **plain static site**: HTML + CSS + native ES modules, no framework, no bundler, no build step, no
package.json. Firebase (Auth + Firestore) is the backend, loaded straight from Google's CDN. Deployed on
Vercel by dropping the folder in with no build command.

> **If you are an AI picking this up, read "Rules of the road" and "Gotchas" first. They are short and
> they will save you a bad afternoon.**

---

## Rules of the road (for AI agents and humans)

1. **Keep it dependency-free.** No npm packages, no build tools, no frameworks. Every script is loaded with
   `<script type="module">` or a dynamic `import()`. Firebase is imported by URL
   (`https://www.gstatic.com/firebasejs/10.12.2/...` — keep that exact version everywhere).
2. **`firestore.rules` is the real security boundary.** Anything the client hides (`monitor-only` buttons,
   panels) is only cosmetic. If you add a collection or a new kind of write, add/adjust the rule too and tell
   the owner to **republish `firestore.rules`** — code changes alone don't update it.
3. **Every page module must fail soft.** `script.js` lazy-loads feature modules and a failure in one must not
   break the rest of the page. Don't add top-level code that throws when an element is missing — check for
   the element and return early (see the `if (!list) return;` pattern in every module).
4. **Escape anything user-authored** before putting it in `innerHTML` (`escapeHtml` exists in most modules).
5. **Mobile and touch first.** The owner mostly tests on a phone or tablet. Pointer Events, not mouse events
   or HTML5 drag-and-drop; tap targets ≥ 36px on small screens; no hover-only affordances.
6. **Don't ship without a changelog entry.** Add an entry at the top of `changelog.js` (see
   [Versioning](#versioning--changelog)). The footer version badge reads `changelog[0].version`.
7. **Deliver only the files you changed**, at their real paths (a zip of just those files is what the owner
   prefers — the full project is large because of `assets/`). Say plainly which ones need `firestore.rules`
   republished.
8. **Test in a real browser before you say it works** — see [Testing](#testing-without-a-build-step).
   The owner can't easily debug for you; things like drag-and-drop, dates on weekends and Firestore rules are
   exactly where "looks right in the code" is wrong.

---

## Stack, config and deploy

| Thing | Where |
|---|---|
| Firebase web config | `firebase-config.js` (client config, not a secret) |
| Auth | Google popup + email/password (`auth.js` logic, `auth-ui.js` UI) |
| Database | Cloud Firestore — rules in `firestore.rules` |
| Hosting | Vercel (`vercel.json` sets the COOP header Google popups need + rewrites `/__/auth/*`). `firebase.json` also exists for `firebase deploy --only firestore:rules` |
| Fonts | Fraunces (display) + IBM Plex Sans (body), Google Fonts |
| Themes | dark (default) / light + user-picked accent colour (`theme.js`) |

Deploying: upload/push the folder to Vercel. Whenever `firestore.rules` changes, publish it separately
(Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules`).

---

## Pages

| File | What it is |
|---|---|
| `index.html` | Home / dashboard. "Today" section: **Homework**, **Announcements**, **Resources** panels (each with monitor-only add/edit/arrange), events, achievements |
| `archives.html` | Hub with anchors: `#students` directory, `#houses`, `#timetable` (its own copy of the timetable), `#archive-materials`, `#quick-links` |
| `timetable.html` | Standalone weekly timetable + teachers list |
| `events.html`, `achievements.html`, `gallery.html`, `resources.html`, `stats.html`, `about.html` | Content pages |
| `changelog.html`, `updates.html` | Renders `changelog.js` |
| `football.html` | **Pitch** — match history, Barça (red) vs Madrid (blue) team cards, formation modal. Monitors edit it in place (no tab in the Monitor panel) |
| `manage.html` | **Monitor panel** — tabs: homework, announcements, resources, events, achievements, gallery, students, teachers, monitors, archive, quicklinks, changelog, audit |

Every page has the same inline "boot" script in `<head>` that applies the saved theme/accent before first paint
(`cacheResolvedAccent()`); if you add a page, copy it from an existing one or light mode breaks on that page.
The timetable markup exists in **both** `timetable.html` and `archives.html` — change both.

## How JavaScript is wired

`script.js` is the entry module on every page. It runs the always-safe UI (nav, splash, student directory,
changelog, hover sounds…) and then lazy-loads the Firebase-backed modules from its `OPTIONAL_MODULES` list,
calling each module's `init…()` function. Each `init` no-ops if its DOM isn't on the current page, so the same
list runs everywhere. To add a feature module: create `foo.js` exporting `initFoo()`, add one line to
`OPTIONAL_MODULES`.

### File map

**Auth & roles**
- `auth.js` — sign-in/out, `subscribeAuth(cb)` (single shared listener → `{ user, profile, monitor }`), profile docs, student-identity claiming, monitor invites, `computeIsMonitor`, `MONITOR_EMAILS`.
- `auth-ui.js` — sign-in modal, identity-claim modal, navbar avatar/menu. Also records that a monitor's browser has run (`settings/monitors.uids` marker + `users/{uid}.monitorSeenAt`).
- `profile-modal.js`, `avatars.js` — profile view, premade SVG avatars (only the avatar id is stored).
- `monitor-manage.js` — Monitors tab (invite by Gmail, list, remove).

**Class content (all monitor-managed, public read)**
- `assignments.js` — Homework (`assignments` + per-student `assignmentStatus`), filters, Mark done.
- `notices.js` — Announcements panel (collection `notices`). Exports `activeAnnouncements`, `onAnnouncements` aliases used by the timetable.
- `resources.js` — Resources panel. **Reads/writes the collection named `announcements`** (historical; see Gotchas).
- `announcements.js` — *legacy, not loaded by anything.* Don't edit it thinking it's live.
- `arrange.js` — shared drag-to-reorder ("arrange mode") used by the three panels above.
- `football-data.js` — Pitch constants, positions, formation layout maths (no DOM/Firebase). `football.js` — public Pitch page: match history, team cards, landscape formation modal; exports `getPitchState`, `setMatchEditMode`, `pitchMarkup` for the editor. `football-manage.js` — monitor-only buttons + dialogs (add/edit/delete match, Edit teams) on `football.html`. Collections `pitchTeams/{red,blue}` and `pitchMatches/{id}` (public read, monitor write — **republish `firestore.rules` if the Pitch blocks aren't live yet**).
- `events.js`, `achievements.js`, `gallery.js`, `archive-materials.js`, `quick-links.js`, `tasks.js`, `dashboard.js`
- `student-manage.js`, `teacher-manage.js`, `students.js` / `teachers.js` / `teachers-data.js` (Firestore-first, seed data as fallback)
- `item-links.js` — the shared "attached links" editor/chips (up to 8 links per item)
- `manage.js` — monitor panel shell (tabs, audit log view)

**Timetable**
- `timetable-data.js` — the schedule as data + live status helpers + `dateForDayKey()` (see Timetable notes).
- `timetable-live.js` — day nav, current/next period, homework dots, period detail panel.
- `timetable-announcements.js` — highlighted days + click-a-day announcements.

**Shared helpers**
- `error-utils.js` — `describeWriteError(err, verb)` → human message for failed writes. Use it for every monitor write.
- `audit.js` — `logAction(...)` appends to `activityLogs` (monitor-only, append-only). Call it after monitor writes.
- `sound.js` — Web-Audio-synthesised UI sounds (`playSuccess`, `playError`, `playToggleOn`…). No audio files.
- `nav-boot.js` — classic script loaded right after every page's `<header>`: creates the version badge and shows a remembered copy of the account pill (so they never pop in). Bump `VERSION_FALLBACK` with `changelog.js`.
- `bgm.js` — background music, hardcoded tracks. `theme.js` — accent/mode. `changelog.js` — release notes.

---

## Data model (Firestore)

Read/write is per `firestore.rules`. "public" = anyone, even signed out. **monitor** = see Roles.

| Collection | Read | Write | Notes |
|---|---|---|---|
| `users/{uid}` | owner or monitor | owner (not the claim fields), monitor | `email`, `claimedStudentId/Name`, `theme`, `monitorSeenAt`. **No role field** — never add one |
| `claims/{studentId}` | signed in | create own; monitor/owner delete | one doc per student, guarantees a student is claimed once |
| `students`, `teachers` | public | monitor | class directory; seed data in `students.js`/`teachers-data.js` |
| `assignments/{id}` | public | monitor | `subject, title, description, dueDate (YYYY-MM-DD), priority ("important"/"normal"), links, sortOrder` |
| `assignmentStatus/{id}` | monitor or owner | owner | per-student "done" flag |
| `notices/{id}` | public | monitor | Announcements: `title, content, category, priority, pinned, eventDate (optional YYYY-MM-DD), links, sortOrder, createdAt` |
| `announcements/{id}` | public | monitor | **actually the Resources data**: `title, content, pinned, links, sortOrder, createdAt` |
| `events`, `achievements`, `gallery`, `tasks`, `archiveMaterials`, `quickLinks`, `timetable` | public | monitor | |
| `monitors/{uid}` | signed in | monitor | existence = monitor role (one of the four paths) |
| `monitorInvites/{email}` | public | monitor (create/delete) | doc id = lower-cased Gmail; `{ email, invitedByEmail, invitedAt }` |
| `settings/monitors` | public | monitor | `{ uids: { [uid]: true } }` — public marker used for the "Monitor" badge on student cards |
| `avatars/{uid}` | public | owner | avatar id only |
| `notifications/{id}` | recipient | monitor creates | |
| `activityLogs/{id}` | monitor | monitor create only | audit trail |

## Roles and auth

There are two roles: student and monitor. A signed-in user **is a monitor** when the server-side
`isMonitor()` rule says so, via any of:
1. their email is in the hardcoded allowlist (`MONITOR_EMAILS` in `auth.js` **and** the list in `isMonitorEmail()` in `firestore.rules` — keep both in sync),
2. a doc exists at `monitors/{uid}`,
3. `users/{uid}.monitor == true` (`get('monitor', false)` — a missing field must never error),
4. **an invite exists at `monitorInvites/{their lower-cased email}`** (the normal way to add someone — Monitors tab → add Gmail). It takes effect the moment that person signs in with that address.

`auth.js#computeIsMonitor` mirrors this on the client so the UI can react; it is only a UI hint.

**Monitors tab statuses** (`monitor-manage.js`) for invited people: *Signed in* = their own browser has opened the
site as a monitor since being added (`users/{uid}.monitorSeenAt` set by `auth-ui.js`); *Hasn't signed in since being
added* = they have a student account but haven't visited since; *Not yet signed in* = no account at all. Having a
profile alone never counts as "signed in".

---

## Feature notes worth knowing

### Ordering + arrange mode (Homework, Announcements, Resources) — `arrange.js`
Monitors get a pencil toggle in each panel header (hidden until the list has items). On = a two-dash drag handle
on every row; off = saves. Order everyone sees, in this precedence:
1. pinned first (Announcements/Resources), 2. **important above normal** (Homework/Announcements),
3. saved `sortOrder` ascending, 4. never-arranged items lead their tier, then the section's old rule
(Homework: soonest due date; others: newest first).
Nothing is written unless the monitor actually moved something. Priority rule while arranging: everything at or
below the first normal item becomes normal (computed from the *original* priorities, so dragging back undoes it).
Pinned items form their own block and can't be dragged out of it. Homework priority is just `important`/`normal`;
old `high` reads as important, `low`/`medium` as normal (`normalizePriority`).
Implementation details that bit us: use Pointer Events + `touch-action:none` on the handle; never re-insert the
dragged row's own DOM node mid-drag (it drops pointer capture — move its neighbours instead); the site sets
`html{scroll-behavior:smooth}` so autoscroll must call `scrollBy({behavior:"instant"})`.

### Timetable dates — `timetable-data.js#dateForDayKey`
The grid is Mon–Fri only. `dateForDayKey("mon")` returns the real date that row stands for: this week's date
Mon–Fri, and **on Saturday/Sunday the coming week**. The day label ("Monday · in 2 days"), homework dots and
announcements all use it — don't reintroduce a local date calculation.

### Timetable announcements
Only announcements with an `eventDate` matter here. Days whose date matches get highlighted; tapping one opens
`#ttAnnSection` (hidden by default) with that day's announcements; tapping again closes it. Nothing is listed
otherwise.

---

## UI conventions

> **Read `DESIGN.md` first** — it has the visual language, tokens, components (hero, glance panel, cards, buttons), the phone checklist and the don'ts. The notes below are the short version.

- Navigation, the looping five-slot primary nav (each page lists its links in ring order — see DESIGN.md), keyboard arrows, page fades/reveal, same-page-click handling, sticky metrics and subnav scrollspy all live in `main-nav.js` (V17.3). Pages: Pitch, Houses, Home, Archives, Rankings (`rankings.html` is a coming-soon page). V17.4: on browsers with cross-page view transitions (`@view-transition` at the bottom of `style.css`) the old page stays until the new one is ready and they dissolve; the fade-out / hold / fade-in is only the fallback. The music fades (`fadeOutBgm`/`fadeInBgm`) are in `bgm.js`. Home/Archives hero panels are `glance-panels.js`. Don't duplicate any of that elsewhere.
- Link to Home as `index.html` (never `index.html#top`); the first subnav tab on every page is `href="#top"` named after the page.
- Design tokens live in `:root` in `style.css` (colours, `--radius-*`, `--ease`, fonts). Reuse them; light theme is `html[data-theme="light"]` overrides. `style.css` is one big file with dated/versioned sections appended at the end — add new rules in a new dated section at the bottom.
- A global `[hidden]{display:none!important}` rule exists. Use the `hidden` attribute to hide things.
- Monitor-only UI: give elements the `monitor-only` class; each section's `applyMonitorVisibility()` toggles `hidden` on them. Don't put `monitor-only` on something whose visibility you control yourself (the arrange pencil doesn't).
- Panels are `.today-panel` with a `.today-panel-head`; rows are `.task-row` / `.announcement-row`; small buttons `.task-icon-btn`; primary `.btn.btn-add-task`.
- Sounds on interactions (`sound.js`), errors through `describeWriteError`, audit through `logAction`.
- Reduced-motion and keyboard access matter: real `<button>`s, labels, focus rings.

## Versioning & changelog

`changelog.js` exports `changelog` (newest first). Each entry: `{ date: "YYYY-MM-DD", version: "16.2.1", items: ["plain-English sentence", …] }`.
`currentVersion = changelog[0].version` drives the badge in the corner and the footer log. Write entries for
students, not developers. Bump the minor for features, add a third number for follow-up fixes to the same release.

## Testing without a build step

There's no test suite in the repo. What works well: serve the folder (`python3 -m http.server 8123`), drive it
with Playwright (Chromium), and **stub Firebase** — route `https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js`
to a tiny in-memory fake (`collection, doc, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc,
updateDoc, deleteDoc, addDoc, writeBatch, deleteField, serverTimestamp`) and stub `firebase-config.js`, `auth.js`
(`subscribeAuth` → `{user, monitor}`) and `sound.js`. Load the real modules against a page built from the real
HTML. Use `page.clock.set_fixed_time()` to test weekends. Gotchas when doing this: Playwright route handlers with
default-arg lambdas get the wrong arguments (use a factory); a bare `python -m http.server` is single-threaded;
touch dragging needs CDP `Input.dispatchTouchEvent`.
What can't be tested that way (and should be flagged to the owner): real Firestore rules, real Google sign-in,
real devices.

## Gotchas / history

- **Two "announcement" collections.** `notices` = Announcements panel. `announcements` = *Resources* panel data (the section was renamed, the collection wasn't). `announcements.js` is dead code.
- `MONITOR_EMAILS` lives in two places (client + rules). Change both.
- `users/{uid}.createdAt` is overwritten on every explicit sign-in (`ensureProfileDoc` merges it) — don't treat it as the signup date.
- `settings/monitors.uids` is written by each monitor's *own* browser; never write other people into it on their behalf (it made someone look like a monitor who hadn't signed in). Removing a monitor also deletes their marker.
- Firestore rule helpers must not throw on a missing field; use `.get('field', default)`.
- The Firebase SDK is imported by URL in many modules — a version mismatch between files silently creates two SDK instances.
- Homework/announcement lists re-render on every Firestore snapshot; anything stateful you add (open rows, arrange mode) must survive `render()` being called at any time.
- Older notes from earlier phases are kept for context: `P0-SECURITY-NOTES.md` (why role lives only in the rules), `P1-CORE-EXPERIENCE-NOTES.md`, `MERGE-FIX-NOTES.md`.

## Working with the owner

The owner is one of the class monitors (a student), usually tests on a phone/tablet, reports bugs with screenshots,
and describes features informally — read for intent, confirm the tricky reading of an ambiguous request in your
summary, and keep replies short. Say what you changed, what you could and couldn't verify, and whether they
need to republish `firestore.rules`.
