# Cleanup log

## Done (steps 1–3)
- Monitor system deleted: manage.html/js, monitor-manage.js, auth.js, auth-ui.js, audit.js, profile-modal.js,
  avatars.js, allowlist/invite/claim rules, Firebase Auth, auth tests and security notes.
- CRUD parked in `_on-hold/`: student/teacher/football management, football points, tasks, quick links, archive materials.
- Sound and music removed: sound.js, bgm.js, every play*() call, hover SFX.
- Motion removed: main-nav.js (looping nav), nav-boot.js, splash, grain, view transitions;
  style.css lost all keyframes, animation and transition declarations (7,471 → ~1,600 lines).
- Decorative stats removed: stats.html, count-up numbers, the old "My day" dashboard.
- Home (index.html): events and achievements removed; hero shows announcements + current period; vertical quick links.
- Timetable/Archives: colour-coded subjects, day indicator + current period indicator, no arrows/popups/announcements.

## Still to do (later steps)
Directory/houses, events, pitch, gallery, rankings, resources, about, achievements, updates, changelog
still use `style.css` + `legacy.js`. Convert each to `shell.css`, then delete `style.css`, `legacy.js`, `readonly.js`.
