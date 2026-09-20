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
    date: "2026-09-20",
    version: "17.2.0",
    items: [
      "New main menu movement: the highlighted pill now stays in the middle and the whole row slides to bring the page you pick into the centre. The buttons at the edges fade out. It starts in the right place on every page, so the menu no longer jumps, blinks or drifts sideways while a page loads.",
      "New Rankings page (coming soon), to the right of Archives.",
      "Home: tap a day in the This week strip to jump straight to what's on it. One item takes you there and highlights it; a day with several shows a short list to pick from. Dated announcements now get a dot too.",
      "The house graph now waits for the live class list instead of briefly showing old numbers, and shows a loading bar in the meantime.",
      "Smaller, tidier sub menu (Home, Houses, Archives) with less space around it.",
      "Page changes are calmer: the page stays hidden for a moment until fonts and layout have settled, then fades in, so you don't see it readjust. A page that is shorter than the screen no longer shifts the layout by the width of a scrollbar.",
    ],
  },
  {
    date: "2026-09-20",
    version: "17.1.0",
    items: [
      "Changing pages now feels like one app: the page fades out, the next one fades in, and the top menu stays where it is. The background music fades out and back in with it instead of cutting off.",
      "The loading splash only shows the first time you open the site in a tab, not on every page.",
      "Tapping the page you're already on (Home, Archives, the logo) no longer reloads it. It scrolls you back to the top. Home now really lands at the top instead of hiding the start of the page under the menu.",
      "New hero panels. Home shows a Monday to Friday strip with homework and events marked, a homework count, a countdown to the next event and the latest achievement. Archives shows live student, teacher, photo and material counts that jump to their sections.",
      "The small menu on Houses now starts with Houses (the top of the page) followed by Students. Home and Archives got a matching first tab.",
      "Phones: the logo row scrolls away so only the four main tabs and the small menu stay stuck, hero buttons are shorter, Houses shows its title before the graph, and student cards no longer stick out past the edge.",
      "Design rules are now written down in DESIGN.md so new pages match.",
    ],
  },
  {
    date: "2026-09-19",
    version: "17.0.0",
    items: [
      "New main menu: Football, Houses, Home and Archives. A highlighted pill slides to whichever one you're on, and it stays in a row at the top on phones.",
      "Houses now has its own page. The house graph moved there from the home page, and it counts the real class list, so it changes by itself when someone switches house.",
      "On the Houses page, tap any name to open that student's profile. Tapping a house bar jumps to that house's card.",
      "Home and Archives each have a small info panel where the old house graph used to be: homework, next event and latest achievement on Home; student, teacher, photo and material counts on Archives.",
      "Each section has a small menu of its own under the main one: Today, Events and Achievements on Home; Overview and Students on Houses; Timetable, Teachers, Students, Gallery, Quick Links and Materials in Archives.",
      "Football has a Coming Soon page. Matches, tournaments, rankings and player profiles are planned for later.",
      "Houses are no longer inside Archives. The Houses links on every other page now go to the new Houses page.",
    ],
  },
  {
    date: "2026-09-19",
    version: "16.2.1",
    items: [
      "Fixed the Monitors panel showing \"Signed in\" for people who haven't. \"Signed in\" now means their own browser has opened the site as a monitor since they were added. Someone who already had a student account but hasn't visited since being added reads \"Hasn't signed in since being added\", and someone with no account at all reads \"Not yet signed in\".",
      "Timetable: on Saturday and Sunday the day label used to say a bare \"Monday\" and leave a gap before the arrow. It now reads \"Monday · in 2 days\" (or \"Tomorrow\" on Sunday), centred between the arrows. Weekends also now line up with the coming week, so homework dots and announcements land on the right days.",
      "Timetable announcements: the section no longer lists every announcement. Only announcements with a date appear, days that have one are highlighted (tinted, with a dot), and tapping a highlighted day opens that day's announcements underneath. Tap it again to close.",
      "Rewrote README.md so anyone (or any AI) picking the project up can find their way around: file map, data model, conventions, and gotchas.",
    ],
  },

  {
    date: "2026-09-19",
    version: "16.2",
    items: [
      "Fixed the Monitors panel saying \"Not yet signed in\" for someone who had already signed in with their invited Gmail. It now checks their profile directly, shows their student name and \"Signed in\", and records them so the Monitor badge appears on their student card.",
      "You can now remove a monitor you invited even after they've signed in (before, the remove button vanished once they had); removing them also clears their badge.",
      "Tightened a Firestore rules helper so a missing \"monitor\" field on a profile can never break the monitor check for invited monitors.",
    ],
  },

  {
    date: "2026-09-19",
    version: "16.1",
    items: [
      "Monitors can rearrange Homework, Announcements and Resources. A pencil button appears next to the Add button once a section has something in it; turn it on, drag the two-dash handle on any row (finger or mouse), then turn the pencil off to save. The new order is what everyone sees.",
      "Homework priority is now just Important or Normal (old High counts as Important, old Low/Medium as Normal). Important always sits above normal, in Announcements too: drag an important item below a normal one and it becomes normal; drag a normal one to the top and it stays normal while the important items under it become normal. Pinned items stay in their own block at the top.",
      "Fixed the Pin / Unpin button on Announcements, which was pointing at the wrong collection and never actually pinned anything.",
    ],
  },

  {
    date: "2026-09-18",
    version: "16.0",
    items: [
      "Announcements split into two sections. The old Announcements section is now Resources — same Firestore collection, renamed in the UI only, so nothing already posted is lost. A fresh Announcements section was added alongside it with the full category / priority / event-date field set. On the homepage, Homework now spans the top full width, and Announcements (left) and Resources (right) sit beside each other underneath.",
      "Announcements collapse by default now: title, category badge, and a chevron on the front row with the monitor Pin/Edit/Delete buttons flush right; click anywhere on the row to expand the description and links, and the buttons slide down to their own row. Changelog entries work the same way — click a date to reveal that entry's items. Expanded state survives live Firestore updates.",
      "Announcement priority and pinning actually do something now. Pinned items sit at the top permanently until unpinned or replaced by a different pin; within each pin tier, priority:important sorts above normal. Both sort rules run before the fallback newest-first.",
      "Archive materials are monitor-managed. New Manage panel tab with kicker, title, description, and an optional link per card. The three originals stay as fallback content until Firestore has any real docs.",
      "Quick links are monitor-managed too. New Manage panel tab lets a monitor add a title, description, URL, and pick from a set of premade inline-SVG logos (WhatsApp, Classroom, Campus, Drive, Docs, Sheets, Calendar, Video, Form, Chat, Book, Link, Globe) — no file uploads. The three defaults now pull their logos from assets/logos/WA-logo.png, GC-logo.png, and DC-logo.png.",
      "Teacher directory got search + a subject-category filter (Mathematics / Sciences & computing / Languages / Humanities & PE / Creative arts / Other), matching the student-directory dropdown-filter UI. Result count moved below the search bar.",
      "Only the house filter's outline takes a house colour now — language, transport, Islamic, and creative filters stay on the accent from Appearance settings. Student cards show a coloured dot on their house tag again (the dot was inline, so width/height never applied).",
      "Anchor links land in the right place now. scroll-margin-top raised to 120px on every scrollable section, plus a post-load re-jump that fires after Firestore content has finished pushing the target down — that's what was making 'Meet the class' and 'See the houses' land in the wrong spot.",
      "Fixed the Monitors tab: rewrote monitor-manage.js to merge three sources (bootstrap emails from source, monitorInvites/{email} docs, and settings/monitors.uids → users/{uid} docs) so the list shows each monitor's avatar, claimed student name, and email. The add form now reports the real error when rules haven't been deployed, instead of blaming monitor access for every failure. Monitor-panel tabs are a proper grid instead of sizing per label.",
      "Removed the Changelog / Monitors accordion from the bottom of the homepage — Changelog has its own page and Monitors lives in the Manage panel. Hero bar chart rows on the homepage navigate to the filtered student list again (was building an invalid ?house=#students URL). Archive material description is a real textarea now, with correct dark-mode styling.",
      "Mobile UI pass: hero buttons stack full-width, section padding halved, student grid drops to 2-per-row on a phone, filter row becomes a 2-col grid, homework filter pills scroll horizontally instead of wrapping, every icon button grew to a 36–40px tap target, modal cards use the phone's full width, nav dropdown items got real padding, and the version badge shrank so it stops covering content.",
    ],
  },

{
  date: "2026-09-18",
  version: "15.0",
  items: [
    "Merged in monitor invites (add a monitor by Gmail before they've ever signed in), a real teacher roster with a Firestore-over-seed merge so edits no longer wipe untouched teachers, and a rebuilt links stack that supports up to 8 named links per homework/announcement/event.",
    "Fixed a bad merge that had silently reverted several V14.3 fixes back to V14.1: background music restarting on every page instead of resuming, light mode not applying on 8 pages, the two-column Settings layout, the BGM loop toggle, and readable Firestore error messages (achievements, announcements, homework, events, gallery, students, teachers all went back to generic 'check your monitor access' errors).",
  ],
},
{
  date: "2026-09-18",
  version: "14.3",
  items: [
    "V14.3: Settings modal now lays Appearance and Sound out side by side instead of stacked, with Sound given equal weight, and the Loop toggle moved off the cramped Track row onto its own line.",
    "Fixed light mode not applying correctly on 8 of the site's pages — their boot script never read the saved dark/light preference at all, so they always started dark and only corrected if the account/theme scripts happened to load in time.",
    "Background music now keeps playing across page navigation instead of restarting — it resumes from where it left off. A real page refresh still starts the track over, as intended.",
  ],
},
{
  date: "2026-09-17",
  items: [
    "V14.1: Fixed monitors being unable to save homework or announcements — a case-sensitivity mismatch between the sign-in check and the security rules was silently rejecting their writes.",
    "Removed the automatic quiet-intro detection from Background music — it downloaded and analyzed the whole track just to guess where it starts, which was slow and inconsistent. Replaced with a fixed, manually-set start offset per track.",
    "Fixed background tracks sometimes playing on top of each other (a fast double-tap on Play, or having the site open in two tabs, could start two overlapping streams). Only one track can play at a time now, and tabs no longer auto-start playback for each other.",
    "Fixed Google sign-in popups failing on the live site due to a missing cross-origin header in the Vercel config.",
    "Homework, announcements, and event titles/descriptions are now HTML-escaped when rendered, matching the rest of the site — stray '<' or '&' characters in monitor-entered text no longer break the layout.",
  ],
},
{
  date: "2026-09-17",
  items: [
    "V14: Background music has a real track chooser now — pick any song from the dropdown and it remembers your choice across reloads.",
    "Each track's quiet intro is detected automatically the first time you play it (the browser reads the file's waveform, finds where it actually gets going, and skips ahead). Cached, so it's instant after the first play.",
    "Fixed the Background music play button — the whole row used to be clickable because it was wrapped in a <label>. The button now has its own bigger, predictable hit area.",
    "Wider volume slider, cleaner track picker styling.",
  ],
},
  {
    date: "2026-09-17",
    items: [
      "V13.1.1: version watermark now shows the full patch number (v13.1.1) so you can tell exactly which build is live.",
      "Homework, announcements, and events now show a proper loading animation instead of an empty box while they fetch.",
      "Homework links are now a stack: paste a URL and press Enter to add another below. Up to six. No buttons, no X icons, no clutter.",
      "Background music is now configurable — drop your MP3 in assets/audio/ and set one line in bgm.js. Optionally skip a slow intro by setting startAt in seconds.",
      "Timetable announcements are back on the Class Archives page — the highlight + list below the grid works again.",
      "House cards on the archives page now actually take you to the filtered student list, clearing any previous filters first.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V12.3: Avatar switching now tracks the signed-in account directly and updates the UI optimistically.",
      "The avatar picker now shows the selected avatar correctly after hard refreshes and auth restoration.",
      "Avatar changes now sync immediately across the profile, navigation pill, and directory.",
      "Light mode now applies the brighter, more saturated accent to the base accent variable as well as the gradient accents.",
      "Light-mode house colors are slightly brighter and more saturated.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V12: 30 premade avatars. Pick yours from View profile and tap your avatar. Colors follow the house/accent palette.",
      "Avatars are tied to your account, not to the student you've claimed. Switching students keeps your avatar.",
      "The profile dropdown got simpler: View profile, Monitor panel (if you're a monitor), and Sign out. Profile details and account actions now live in the profile view.",
      "View profile now shows a large avatar, house, language, Islamic/Value, Creative, transport, achievements, and your account actions when it is your own profile.",
      "Monitor badges now resolve from the current student claim on every page load instead of depending on a previous sign-in event.",
      "Student directory cards now show avatar + name on top, followed by labeled house/language/transport/role pills.",
      "Added a v12 version watermark in the bottom-right of every page so you can tell whether the new deployment actually landed.",
    ],
  },
  {
    date: "2026-09-16",
    items: [
      "V11.2: Light-mode accents are now genuinely brighter and more saturated while keeping a darker readable shade for text.",
      "Gallery and lightbox captions are forced white over image gradients so they remain readable in light mode.",
      "Student cards now clearly behave like clickable profiles with pointer, hover lift, press, and keyboard focus states.",
      "Monitor badges now follow the student's current claim instead of being tied to a stale email, so switching students moves the badge with the claim.",
      "Light-mode pills, inputs, navigation, loading overlays, toasts, and raised panels received a contrast and polish pass.",
    ],
  },
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

// Single source of truth for the version watermark in the corner of
// every page (see initVersionBadge in script.js). That used to be a
// separately hand-typed string over there, which only got updated
// when someone remembered to — this way, whatever version tops this
// list is automatically what the watermark shows.
export const currentVersion = changelog[0]?.version || null;
