// ============================================
// 8CM — Teacher roster
// ------------------------------------------------
// Fallback + seed data. Once the Firestore `teachers` collection has
// any docs, loadTeachers() returns those instead — same pattern as
// students.js. A monitor can edit teachers from the Firestore console
// or (later) a manage-panel tab.
//
// Honorifics: "Mr." or "Mrs." — never leave blank.
// ============================================

export const TEACHERS_SEED = [
  { id: "mr-anil-kumar",        honorific: "Mr.",  name: "Anil Kumar",           subject: "Mathematics",        email: "", notes: "Class teacher, 8CM" },
  { id: "mrs-priya-nair",       honorific: "Mrs.", name: "Priya Nair",           subject: "English",            email: "", notes: "" },
  { id: "mr-rajesh-menon",      honorific: "Mr.",  name: "Rajesh Menon",         subject: "Physics",            email: "", notes: "" },
  { id: "mrs-anjali-sharma",    honorific: "Mrs.", name: "Anjali Sharma",        subject: "Chemistry",          email: "", notes: "" },
  { id: "mr-suresh-pillai",     honorific: "Mr.",  name: "Suresh Pillai",        subject: "Biology",            email: "", notes: "" },
  { id: "mrs-fatima-al-hosani", honorific: "Mrs.", name: "Fatima Al Hosani",     subject: "Arabic",             email: "", notes: "" },
  { id: "mr-ahmed-al-mansoori", honorific: "Mr.",  name: "Ahmed Al Mansoori",    subject: "Islamic Education",  email: "", notes: "" },
  { id: "mrs-lakshmi-iyer",     honorific: "Mrs.", name: "Lakshmi Iyer",         subject: "Hindi",              email: "", notes: "" },
  { id: "mr-george-thomas",     honorific: "Mr.",  name: "George Thomas",        subject: "Malayalam",          email: "", notes: "" },
  { id: "mrs-claire-dubois",    honorific: "Mrs.", name: "Claire Dubois",        subject: "French",             email: "", notes: "" },
  { id: "mr-vikram-singh",      honorific: "Mr.",  name: "Vikram Singh",         subject: "Social Studies",     email: "", notes: "" },
  { id: "mrs-neha-gupta",       honorific: "Mrs.", name: "Neha Gupta",           subject: "Computer Science",   email: "", notes: "" },
  { id: "mr-daniel-fernandes",  honorific: "Mr.",  name: "Daniel Fernandes",     subject: "Physical Education", email: "", notes: "" },
  { id: "mrs-rekha-menon",      honorific: "Mrs.", name: "Rekha Menon",          subject: "Value Education",    email: "", notes: "" },
  { id: "mr-omar-haddad",       honorific: "Mr.",  name: "Omar Haddad",          subject: "Creative Arts",      email: "", notes: "Music, dance, visual art" },
  { id: "mrs-susan-mathew",     honorific: "Mrs.", name: "Susan Mathew",         subject: "Artificial Intelligence", email: "", notes: "" },
];

let liveTeachers = null;
let inflight = null;
const listeners = new Set();

function broadcast() {
  const list = liveTeachers || TEACHERS_SEED;
  listeners.forEach((cb) => {
    try { cb(list); } catch (err) { console.error(err); }
  });
}

export function getTeachersSync() {
  return liveTeachers || TEACHERS_SEED;
}

export function onTeachers(cb) {
  listeners.add(cb);
  cb(getTeachersSync());
  return () => listeners.delete(cb);
}

export async function loadTeachers({ forceRefresh = false } = {}) {
  if (liveTeachers && !forceRefresh) return liveTeachers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { db } = await import("./firebase-config.js");
      const { collection, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const snap = await getDocs(collection(db, "teachers"));
      if (snap.empty) return TEACHERS_SEED;
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.active === false) return;
        list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return list;
    } catch (err) {
      console.error("[8CM] Falling back to seed teachers — Firestore read failed:", err);
      return TEACHERS_SEED;
    }
  })().then((list) => {
    liveTeachers = list;
    inflight = null;
    broadcast();
    return liveTeachers;
  });

  return inflight;
}

export async function invalidateTeachersCache() {
  liveTeachers = null;
  inflight = null;
  broadcast();
  return loadTeachers({ forceRefresh: true });
}
