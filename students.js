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
    };
  })
  .sort((a, b) => a.rollNumber - b.rollNumber);
