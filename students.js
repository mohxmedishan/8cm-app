// ============================================
// 8CM — Student directory data
// ------------------------------------------------
// The students export below is SEED DATA and an offline/error
// fallback. Firestore students/{id} is the live source of truth —
// use loadStudents() (async, cached) or getStudentsSync() (best-effort
// synchronous read of whatever's been loaded) instead of importing
// the raw array directly.
// ============================================

function slug(name) {
return name
.toLowerCase()
.replace(/[^a-z0-9]+/g, "-")
.replace(/(^-|-$)/g, "");
}

const LANGUAGE_GROUPS = {
Hindi: [
"Abhay Sriram Kolluru","Advitya","Ashwin Verma","Mohammed Akhsar",
"Dhruvlal Kalathingal","Garvit Bhola","Sarvesh Prabhu",
],
Malayalam: [
"Ihsan Sajidh Karappamveettil","Mohamed Ishan Kunnummal","Naresh Nair Narayanan",
"Parthiv Suresh Babu","Pranav Rakesh Nair","Saathvik Chooranath Sajithkumar",
"Shahbaz Shamsudeen","Suhail Saidu Mohammed",
"Zayan Shafil Riyas Raymarakkar Puthanpurayil","Zishan Mohammed Karathel",
],
French: [
"Abhinav Biju","Khush Bimal Thakkar","Mohammed Isam Hussain","Rushdi Nasar",
"Tazeem Mahfuz Mohamed Ismail","Vaibhav Vibin","Zayan Sayed Munaffer",
"Adithya Sunil Kumar","Mohammed Ali Al Jabri","Muhammad Ibrahim",
"Muhammed Mishal Ali Kuzhiyanchery","Pranav Sathyam","Sayed Ahmed Faizaan Hirdh",
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

const rollByName = new Map(
[...raw]
.sort((a, b) => a.name.localeCompare(b.name))
.map((s, i) => [s.name, i + 1])
);

export const students = raw
.map((s) => {
const language = languageByName.get(s.name);
if (!language && typeof console !== "undefined") {
console.error([8CM] No language assigned for student: ${s.name});
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
// Live cache + pub/sub
// ------------------------------------------------
let liveStudents = null; // set once Firestore resolves
let inflightLoad = null;
const changeListeners = new Set();

function broadcastStudents() {
const list = liveStudents || students;
changeListeners.forEach((cb) => {
try { cb(list); } catch (e) { console.error(e); }
});
}

/** Best-effort synchronous read. Returns Firestore-loaded students

when available, else the local seed array. Use this in code paths
that must render immediately (claim picker, profile pill) — pair
with loadStudents() or onStudents() to catch the async update. */
export function getStudentsSync() {
return liveStudents || students;
}

/** Subscribe to student-list changes. Fires immediately with whatever

is currently known, then again whenever Firestore resolves or the
cache is invalidated. Returns an unsubscribe function. */
export function onStudents(callback) {
changeListeners.add(callback);
callback(getStudentsSync());
return () => changeListeners.delete(callback);
}

/** Loads students from Firestore (once, cached). Falls back to the

local seed array on any error or if the collection is empty (i.e.
migration hasn't been run yet). */
export async function loadStudents({ forceRefresh = false } = {}) {
if (liveStudents && !forceRefresh) return liveStudents;
if (inflightLoad) return inflightLoad;

inflightLoad = (async () => {
try {
const { db } = await import("./firebase-config.js");
const { collection, getDocs } = await import(
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
);
// Plain collection read of ~30 docs, filtered client-side — an
// inequality query on active would need a composite index and
// would silently drop docs missing the field.
const snap = await getDocs(collection(db, "students"));
if (snap.empty) return students; // not migrated yet
const list = [];
snap.forEach((docSnap) => {
const data = docSnap.data();
if (data.active === false) return;
list.push({ id: docSnap.id, ...data });
});
list.sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));
return list;
} catch (err) {
console.error("[8CM] Falling back to local student list — Firestore read failed:", err);
return students;
}
})().then((list) => {
liveStudents = list;
inflightLoad = null;
broadcastStudents();
return liveStudents;
});

return inflightLoad;
}

/** Drops the cache and re-fetches. Call after a monitor add/edit so

every live view (directory, picker, dashboard) updates without a
reload. */
export async function invalidateStudentsCache() {
liveStudents = null;
inflightLoad = null;
broadcastStudents(); // signal "back to seed" moment for anyone watching
return loadStudents({ forceRefresh: true });
}

// ------------------------------------------------
// One-time idempotent migration (unchanged from P0)
// ------------------------------------------------
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
console.log([8CM] Migration complete — ${written} student(s) written, ${skipped} already present.);
return { written, skipped };
}
