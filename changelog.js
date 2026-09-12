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
    date: "2026-09-12",
    items: [
      "The daily task/homework list is now public — no sign-in needed to see what's due.",
      "Tasks can now carry up to 5 file attachments (images, PDFs, Office docs), with size and format checks before upload.",
      "Admins can upload photos straight into the Gallery — no more editing the site's code to add one.",
      "Student directory cards and profiles now show a Roll Number (alphabetical, Abhay = 1 through Zishan = 30) and Language track (Hindi, Malayalam, or French).",
      "Added Hindi/Malayalam/French filter pills to the student directory — combine one with a house and/or OT to narrow the list further.",
      "Added a \"Switch student\" option in the profile menu, so you can change who your account is linked to without signing out.",
      "Fixed sign-in re-asking you to pick a student every time — it now remembers your choice properly.",
      "Added this update log to the footer.",
    ],
  },
];
