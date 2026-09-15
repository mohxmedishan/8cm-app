// ============================================
// 8CM — Student directory data
// ------------------------------------------------
// Kept separate from rendering/auth logic so both the directory UI
// and the Firebase identity-claim flow read from one source of truth.
// Each student gets a stable slug `id` — this is what gets written to
// a user's Firestore profile as `claimedStudentId`, so claims don't
// depend on array order or exact string matches on the name.
// ============================================

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ------------------------------------------------
// Language track, keyed by full name so it's unambiguous even where
// first names repeat a common word (e.g. "Zayan"). Every name in
// `raw` below must appear in exactly one of these three lists — that
// invariant is checked at the bottom of this file.
// ------------------------------------------------
const LANGUAGE_GROUPS = {
  Hindi: [
    "Abhay Sriram Kolluru",
    "Advitya",
    "Ashwin Verma",
    "Mohammed Akhsar",
    "Dhruvlal Kalathingal",
    "Garvit Bhola",
    "Sarvesh Prabhu",
  ],
  Malayalam: [
    "Ihsan Sajidh Karappamveettil",
    "Mohamed Ishan Kunnummal",
    "Naresh Nair Narayanan",
    "Parthiv Suresh Babu",
    "Pranav Rakesh Nair",
    "Saathvik Chooranath Sajithkumar",
    "Shahbaz Shamsudeen",
    "Suhail Saidu Mohammed",
    "Zayan Shafil Riyas Raymarakkar Puthanpurayil",
    "Zishan Mohammed Karathel",
  ],
  French: [
    "Abhinav Biju",
    "Khush Bimal Thakkar",
    "Mohammed Isam Hussain",
    "Rushdi Nasar",
    "Tazeem Mahfuz Mohamed Ismail",
    "Vaibhav Vibin",
    "Zayan Sayed Munaffer",
    "Adithya Sunil Kumar",
    "Mohammed Ali Al Jabri",
    "Muhammad Ibrahim",
    "Muhammed Mishal Ali Kuzhiyanchery",
    "Pranav Sathyam",
    "Sayed Ahmed Faizaan Hirdh",
  ],
};

const languageByName = new Map();
Object.entries(LANGUAGE_GROUPS).forEach(([language, names]) => {
  names.forEach((name) => languageByName.set(name, language));
});

const raw = [
  { name: "Abhay Sriram Kolluru", house: "winter", transport: "22" },
  { name: "Abhinav Biju", house: "autumn", transport: "4" },
  { name: "Adithya Sunil Kumar", house: "spring", transport: "61" },
  { name: "Advitya", house: "autumn", transport: "16" },
  { name: "Ashwin Verma", house: "summer", transport: "57" },
  { name: "Dhruvlal Kalathingal", house: "autumn", transport: "OT" },
  { name: "Garvit Bhola", house: "spring", transport: "26" },
  { name: "Ihsan Sajidh Karappamveettil", house: "spring", transport: "52" },
  { name: "Khush Bimal Thakkar", house: "autumn", transport: "17" },
  { name: "Mohamed Ishan Kunnummal", house: "spring", transport: "OT" },
  { name: "Mohammed Akhsar", house: "spring", transport: "7" },
  { name: "Mohammed Ali Al Jabri", house: "winter", transport: "OT" },
  { name: "Mohammed Isam Hussain", house: "winter", transport: "37" },
  { name: "Muhammad Ibrahim", house: "autumn", transport: "17" },
  { name: "Muhammed Mishal Ali Kuzhiyanchery", house: "spring", transport: "58" },
  { name: "Naresh Nair Narayanan", house: "spring", transport: "OT" },
  { name: "Parthiv Suresh Babu", house: "autumn", transport: "17" },
  { name: "Pranav Rakesh Nair", house: "winter", transport: "3" },
  { name: "Pranav Sathyam", house: "autumn", transport: "26" },
  { name: "Rushdi Nasar", house: "autumn", transport: "OT" },
  { name: "Saathvik Chooranath Sajithkumar", house: "spring", transport: "64" },
  { name: "Sarvesh Prabhu", house: "summer", transport: "17" },
  { name: "Sayed Ahmed Faizaan Hirdh", house: "winter", transport: "63" },
  { name: "Shahbaz Shamsudeen", house: "winter", transport: "OT" },
  { name: "Suhail Saidu Mohammed", house: "summer", transport: "18" },
  { name: "Tazeem Mahfuz Mohamed Ismail", house: "winter", transport: "4" },
  { name: "Vaibhav Vibin", house: "autumn", transport: "26" },
  { name: "Zayan Sayed Munaffer", house: "autumn", transport: "3" },
  { name: "Zayan Shafil Riyas Raymarakkar Puthanpurayil", house: "winter", transport: "39" },
  { name: "Zishan Mohammed Karathel", house: "autumn", transport: "7" },
];

// Roll numbers are assigned by alphabetical order of full name —
// Abhay comes out as 1, Zishan as the last number — computed from a
// sorted copy so this stays correct even if `raw` above is ever
// reordered or added to.
const rollByName = new Map(
  [...raw]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s, i) => [s.name, i + 1])
);

// This array is now SEED DATA and an offline/error fallback, not the
// live database. Once migrated, students/{id} in Firestore is the
// primary source — see loadStudents() and migrateStudentsToFirestore()
// below. Nothing here is sensitive: it's the same name/house/language/
// transport info that already shipped to every visitor's browser in
// this file, now just also mirrored into Firestore so monitors can
// edit it without a code deploy.
export const students = raw
  .map((s) => {
    const language = languageByName.get(s.name);
    if (!language && typeof console !== "undefined") {
      console.error(`[8CM] No language assigned for student: ${s.name}`);
    }
    return {
      ...s,
      id: slug(s.name),
      rollNumber: rollByName.get(s.name),
      language: language || null,
      active: true,
    };
  })
  .sort((a, b) => a.rollNumber - b.rollNumber);

// ------------------------------------------------
// Firestore-backed directory, with this file as fallback
// ------------------------------------------------
// Deliberately lazy-imported (dynamic import) so pages that only need
// the static array — like the identity-claim picker, which must be
// available synchronously before any Firestore round-trip — don't pay
// for pulling in the Firestore SDK at all.
let cachedFirestoreStudents = null;

export async function loadStudents({ forceRefresh = false } = {}) {
  if (cachedFirestoreStudents && !forceRefresh) return cachedFirestoreStudents;

  try {
    const { db } = await import("./firebase-config.js");
    const { collection, getDocs } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    // A plain collection read of ~30 docs, filtered client-side — an
    // inequality query here would need a composite index and would
    // silently exclude any doc missing the `active` field, which is
    // an easy way to lose a student from the directory by accident.
    const snap = await getDocs(collection(db, "students"));
    if (snap.empty) {
      // Collection not migrated yet (or a monitor cleared it out) —
      // fall back rather than showing an empty directory.
      return students;
    }
    const fromFirestore = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.active === false) return;
      fromFirestore.push({ id: docSnap.id, ...data });
    });
    fromFirestore.sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));
    cachedFirestoreStudents = fromFirestore;
    return fromFirestore;
  } catch (err) {
    console.error("[8CM] Falling back to local student list — Firestore read failed:", err);
    return students;
  }
}

// One-time, idempotent migration: writes every student in the local
// seed array into Firestore as students/{id}, skipping any id that's
// already there. Run this once from the browser console while signed
// in as a monitor:
//
//   import("./students.js").then(m => m.migrateStudentsToFirestore());
//
// Safe to re-run — it never overwrites an existing doc, so any edits
// a monitor has since made in Firestore are left alone.
export async function migrateStudentsToFirestore() {
  const { db } = await import("./firebase-config.js");
  const { doc, getDoc, writeBatch } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  let written = 0;
  let skipped = 0;
  const batch = writeBatch(db);

  for (const student of students) {
    const ref = doc(db, "students", student.id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      skipped++;
      continue;
    }
    batch.set(ref, student);
    written++;
  }

  await batch.commit();
  console.log(`[8CM] Migration complete — ${written} student(s) written, ${skipped} already present.`);
  return { written, skipped };
}
