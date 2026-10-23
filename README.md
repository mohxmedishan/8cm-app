# 8CM class site

A read-only class website: no sign-in, no monitor panel, no sound, no page animation.
Light/dark mode and a responsive layout are the only "features" of the shell.

## Pages
| Page | Status | Styles / script |
|---|---|---|
| `index.html` | refactored | `shell.css` + `home.css`, `home.js` |
| `timetable.html`, `archives.html` | refactored | `shell.css` + `timetable.css`, `timetable.js` |
| `houses.html` (Directory), `events.html`, `football.html`, `gallery.html`, `rankings.html`, `resources.html`, `about.html`, `achievements.html`, `updates.html`, `changelog.html` | waiting for their cleanup step; run read-only | `style.css` (motion stripped), `legacy.js` |

## Files that matter
- `shell.css` / `shell.js` — the new base: theme tokens, header, layout, theme toggle, phone menu.
- `firebase.js` — the single Firebase entry (Firestore only).
- `timetable-data.js` — the schedule, single source of truth for the timetable and "right now".
- `readonly.js` — temporary no-op stand-ins for the deleted auth/audit/sound modules, so unrefactored pages still load. Delete it when the last importer is cleaned up.
- `_on-hold/` — edit/CRUD modules, parked (see its README). Not loaded by any page.
- `firestore.rules`, `storage.rules` — public read, no writes.

## Check
`node check-syntax.mjs`
