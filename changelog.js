// ============================================
// 8CM — Site update log
// ------------------------------------------------
// A running, plain-English list of what's changed on the site.
// Newest entry first. This is visible to everyone (no sign-in
// needed) — script.js renders it into the footer.
//
// To add an entry: put a new object at the TOP of this array.
// ============================================
export const changelog = [
  {
    date: "2026-09-16",
    items: [
      "V11.1: The profile pill no longer flashes 'Sign in' on page reload — the last known account is cached and rendered instantly while Firebase restores the session.",
      "Dark/Light toggle buttons in Settings are now properly styled (the previous CSS wasn't applying).",
      "Light mode got a full vibrance pass — button gradients, house colors, and accent shades are all noticeably brighter than the previous muted versions.",
      "Announcements no longer have an 'expires on' field. Instead there's an optional 'Date of event' — if you set it, the timetable highlights that day and the announcement shows under the grid with that date. If you don't set it, the announcement still shows in the list, but nothing on the timetable gets highlighted.",
      "Fixed announcements highlighting the wrong day on the timetable (it was falling back to the created-at date; now it uses only the explicit event date).",
      "The student directory filters are now a clean row of dropdown boxes — House, Language, Transport, Islamic/Value, Creative — instead of a long pile of pills. Pick from each, they combine, and there's a Clear button that appears when any filter is on.",
      "Achievements now have an 'About' field — a student, the class, the school, or something custom. Student achievements show up on that student's profile.",
      "New profile view: click any student in the directory (or 'View profile' in your own dropdown) to see all their info and their achievements in a popup.",
      "Students who are monitors now get a small 'Monitor' badge on their card in the directory and on their profile.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V11: Light mode. Settings now has Dark / Light buttons at the top — switches the entire palette, not just the background, with every text, border, and hover state adjusted so nothing goes invisible.",
      "Announcements actually show up on the timetable now — the announcements listener was only opening on pages that had the announcement panel, so the timetable's list never had anything to work with. Now it opens on the timetable page too, and announcements match by day-of-week so a Tuesday posting stays on Tuesday.",
      "Two new student role fields: Islamic Education vs. Value Education, and Dance / Music / Art. Set them in the monitor panel, they show on the student cards, and there are filter pills for both — single-select within each group (like houses), combinable across groups.",
      "Added Shahbaz as a second monitor (email allowlist). Also added support for a monitor: true flag on a user's profile doc in Firestore — flip it from the console to grant monitor access without a redeploy, and only existing monitors can flip it.",
      "Fixed the 'Next event' teaser on the dashboard — was pointing at a page that doesn't exist anymore.",
      "Fixed announcement card button spacing — the Pin/Edit/Delete buttons had no breathing room from the announcement text.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V10.2: Announcements now show up under the timetable — an at-a-glance list of what's been posted this week, plus a tinted highlight on any day in the grid that has one. Tap a highlighted day name to read the announcements right in the panel below the grid.",
      "Announcements and homework are now visually separate on the timetable — announcements highlight the day label, homework dots stay on the individual periods. Two different things, two different signals.",
      "Fixed the \"Next event\" teaser on the homepage dashboard — clicking it now scrolls you to the Events section instead of trying to load a page that no longer exists.",
      "Fixed the announcement card layout — the Pin/Edit/Delete buttons used to sit right up against the announcement text. There's proper breathing room now, with a subtle divider between the content and the actions.",
    ],
  },

  {
    date: "2026-09-16",
    items: [
      "V10.1: removed the redundant Today button from the timetable day nav.",
      "Timetable status bar no longer repeats the day label — it only appears when you're viewing today.",
      "Fixed the profile dropdown alignment bug — Monitor panel was an anchor inheriting .dropdown a's padding, which out-specified the button rule. Now a button, and the CSS rule is specificity-proof anyway.",
      "Timetable homework dots now respect the due date: a period only dots if the homework is due on or after that day, within the window from tomorrow through the due date. Homework due today only dots today, and only before school ends. Overdue homework never dots.",
      "Tapping a period's homework in the detail panel jumps straight to the Today section.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V10: nav now puts Students up top and Events in the More menu.",
      "Fixed the Pin/Unpin button on announcements — the text no longer overflows its box.",
      "Fixed the Settings (appearance) button — it actually opens the theme picker now.",
      "Monitor panel link in the profile dropdown is now aligned with Switch student and Sign out.",
      "Timetable day nav shows relative labels (Today / Tomorrow / Yesterday / in Nd) instead of always saying today.",
      "Timetable homework dots now respect the homework's due date — a period only dots if the homework is due on or before that day, not just because a subject matches.",
      "Timetable now says \"School's over for today\" once the last period ends, instead of showing nothing.",
      "Timetable detail panel's homework rows are now tappable links that jump to the Today section.",
    ],
  },
  {
    date: "2026-09-13",
    items: [
      "Swapped task file attachments for a simpler Link field — tasks can now point straight to a Google Form, Drive folder, or worksheet instead of needing an upload.",
      "Removed the admin photo-upload tool from the Gallery — back to a simple, fast-loading static grid.",
      "Added sound effects across the site — buttons, filters, menus, sign-in, and more all have a little audio feedback now. There's a mute button in the nav (the speaker icon) if it's not your thing.",
      "General polish pass on the task hub and nav.",
    ],
  },
  {
    date: "2026-09-12",
    items: [
      "The daily task/homework list is now public — no sign-in needed to see what's due.",
      "Student directory cards and profiles now show a Roll Number (alphabetical, Abhay = 1 through Zishan = 30) and Language track (Hindi, Malayalam, or French).",
      "Added Hindi/Malayalam/French filter pills to the student directory — combine one with a house and/or OT to narrow the list further.",
      "Added a \"Switch student\" option in the profile menu, so you can change who your account is linked to without signing out.",
      "Fixed sign-in re-asking you to pick a student every time — it now remembers your choice properly.",
      "Added this update log to the footer.",
    ],
  },
];
