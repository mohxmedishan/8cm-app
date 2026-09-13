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
