// ============================================
// 8CM — Original gallery photos
// ------------------------------------------------
// These shipped as hardcoded <figure> markup before the gallery went
// dynamic. Keeping them here as data means gallery.js can render them
// through the same code path as admin-uploaded photos (Firestore),
// instead of maintaining two separate rendering systems.
// ============================================
export const gallerySeed = [
  {
    src: "assets/gallery/5cm-motion-gate.jpg",
    alt: "5CM class field trip at Motion Gate",
    caption: "5CM Field Trip · Motion Gate",
  },
  {
    src: "assets/gallery/6cm-warner-bros.jpg",
    alt: "6CM class field trip at Warner Bros World",
    caption: "6CM Field Trip · Warner Bros",
  },
  {
    src: "assets/gallery/7cm-assembly-1.jpg",
    alt: "7CM class assembly presentation",
    caption: "7CM Assembly",
  },
  {
    src: "assets/gallery/7cm-assembly-2.jpg",
    alt: "7CM class assembly presentation",
    caption: "7CM Assembly",
  },
  {
    src: "assets/gallery/7cm-english-1.jpg",
    alt: "7CM English class activity",
    caption: "7CM English",
  },
  {
    src: "assets/gallery/7cm-english-2.jpg",
    alt: "7CM English class activity",
    caption: "7CM English",
  },
  {
    src: "assets/gallery/7cm-field-trip-garvit.jpg",
    alt: "7CM class field trip",
    caption: "7CM Field Trip · Garvit",
  },
];
