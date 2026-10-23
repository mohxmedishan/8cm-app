# P1 (core student experience) — what changed and what you need to do

Covers: personal dashboard, homework/assignment system, timetable upgrades,
homework ↔ timetable integration, announcements, events. Read
`P0-SECURITY-NOTES.md` first if you haven't deployed that phase yet — this
phase's rules build on it.

## New files

- `timetable-data.js` — the weekly schedule as data (subjects, categories,
  period start/end times for Mon–Thu vs Friday), extracted from the grid in
  `timetable.html`. Single source of truth for "what period is what" so the
  timetable page and the dashboard compute against the same thing.
- `assignments.js` — the homework system. Monitor CRUD on an `assignments`
  collection; per-student "done/not done" tracked separately in
  `assignmentStatus` (see below). Filters (All / Pending / Due soon /
  Overdue / Completed), priority, due-date highlighting.
- `announcements.js` — pin / category / priority / auto-expiring
  announcements, monitor CRUD.
- `events.js` — upcoming events with a countdown, monitor CRUD. Wired into
  what was an empty placeholder page (`events.html`).
- `timetable-live.js` — layers behavior onto the *existing* static grid in
  `timetable.html` (same visual design, unchanged): today's day auto-
  selected, current/next class highlighted, time remaining, previous/next
  day navigation, and a tap-for-detail panel that shows homework linked to
  that subject.
- `dashboard.js` — the "My Day" card on the homepage: greeting, house/roll,
  current/next class, and one-line teasers for the next homework item,
  pinned announcement, and upcoming event. Only appears once someone is
  signed in and has claimed a student identity; the Homework and
  Announcements panels underneath it are still public either way, same as
  before.

## The `tasks` collection / `tasks.js` — deprecated, not deleted

The old combined "Today" panel (`tasks` collection, free-text `due` field,
one `type: "homework"|"announcement"` flag) genuinely couldn't support what
this phase needed — real due dates for overdue/due-soon detection, per-
student completion, pinning, expiration, priority. That's a hard
data-shape limitation, not a style preference, so I moved the homepage over
to the new `assignments`/`announcements` collections instead of trying to
extend the old one.

`tasks.js` is still in the repo and still syntactically fine, but nothing
loads it anymore (`script.js` no longer imports it). The `tasks` Firestore
collection is untouched — if you had real homework/announcements in it,
that data still exists, it's just not shown anywhere now. There's no
automatic migration, on purpose: the old `due` field is free text ("Tomorrow",
"Fri") with no reliable way to convert it into a real date. Re-enter
anything current through the new Homework/Announcements panels; the old
data can stay in Firestore harmlessly or you can delete the `tasks`
collection manually once you've confirmed you don't need it.

## Homework ↔ timetable linking — how it actually works

A homework item's `subject` field is a **dropdown**, not free text,
populated from `timetable-data.js`'s subject list (`allSubjects()`) — so it
can only ever be set to a string that actually exists in the timetable
("Math", "Eng", "Chem", "L2", etc). That's what makes the linking reliable:
`getHomeworkForSubject()` matches by exact string, and a monitor literally
can't create homework for a subject that doesn't exist in the schedule.

If you ever change the timetable (new subject, renamed period), update the
`SCHEDULE` object in `timetable-data.js` — that's the one place it lives.
The static grid in `timetable.html` and the data in `timetable-data.js` are
two representations of the same schedule that have to be kept in sync
manually; I didn't merge them into one generated-from-data grid because you
asked to keep the timetable's existing design and markup as-is rather than
rebuild it.

## Firestore reads — kept deliberately narrow

Per the free-tier constraint: `assignments` and `assignmentStatus` only
open a live listener on pages that actually need them (the homepage and the
timetable page check for their own markup before subscribing — see the
`needsLiveData` checks in `assignments.js`/`events.js`). A page like
`gallery.html` or `stats.html` never touches these collections. The
dashboard, timetable badges, and homework panel all read from the *same*
one listener per collection rather than each opening their own — see the
`onAssignments()` / `onAnnouncements()` / `onEvents()` pub-sub functions at
the top of each file.

## What to check before trusting this in production

- Add a few real homework items with different due dates (today, in 2
  days, next week, yesterday) and confirm the Pending / Due soon / Overdue
  filters bucket them the way you'd expect.
- Confirm a homework item's subject shows up on the matching timetable
  cells (small dot indicator) and in the tap-for-detail panel.
- Mark something done as a student account, then check it disappears from
  "Pending" and shows under "Completed" — and that the same item doesn't
  show as done for a *different* signed-in account.
- Pin an announcement, set another to expire yesterday, confirm the expired
  one drops out of the list and the pinned one sorts first.
- Add an event for tomorrow and confirm the countdown banner and the
  dashboard's "Next event" teaser both pick it up.
- Everything from `P0-SECURITY-NOTES.md`'s emulator-testing note still
  applies — I still don't have a way to run the Firebase emulator in this
  environment, so the `assignmentStatus`/`claims` rules interactions are
  reviewed carefully but not machine-verified.

## Next phase

P2 per your priority order: monitor content-management panel (a single
place to manage homework/announcements/events/students instead of the
per-page add buttons this phase used), student management UI, gallery
management without Storage, achievements, and the audit log next to
Changelog.
