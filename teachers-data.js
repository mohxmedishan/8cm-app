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
  { id: "mathematics",        honorific: "", name: "Ashley Retnam",        subject: "Mathematics",           email: "", notes: "" },
  { id: "english",            honorific: "", name: "Melinda D'Souza",      subject: "English",               email: "", notes: "" },
  { id: "french",             honorific: "", name: "Etienne Arpoudarajou", subject: "French",                email: "", notes: "Second-language rotation" },
  { id: "hindi",              honorific: "", name: "Subodh Shukla",        subject: "Hindi",                 email: "", notes: "Second-language rotation" },
  { id: "malayalam",          honorific: "", name: "Roshna K.B.",          subject: "Malayalam",             email: "", notes: "Second-language rotation" },
  { id: "biology",            honorific: "", name: "Zeenath Zakeer",       subject: "Biology",               email: "", notes: "Science rotation" },
  { id: "chemistry",          honorific: "", name: "Deepa Praveen",        subject: "Chemistry",             email: "", notes: "Science rotation" },
  { id: "physics",            honorific: "", name: "Manju Subhash",        subject: "Physics",               email: "", notes: "Science rotation" },
  { id: "social-science-mscs1", honorific: "", name: "Tamseel Sayed",      subject: "Social Science / MSCS-1", email: "", notes: "" },
  { id: "arabic",             honorific: "", name: "Wafaa Ashour",         subject: "Arabic",                email: "", notes: "" },
  { id: "computer-science-ai", honorific: "", name: "Neethu Renjith",      subject: "Computer Science/AI",   email: "", notes: "" },
  { id: "islamic",            honorific: "", name: "Moheenudeen",         subject: "Islamic",               email: "", notes: "IVE rotation" },
  { id: "value-education",    honorific: "", name: "Mary Tincy",           subject: "Value Education",       email: "", notes: "IVE rotation" },
  { id: "art",                honorific: "", name: "Prosun Sarkar",        subject: "Art",                   email: "", notes: "Creative arts rotation" },
  { id: "dance",              honorific: "", name: "Balaji Jeyaraman",     subject: "Dance",                 email: "", notes: "Creative arts rotation" },
  { id: "music",              honorific: "", name: "Solomon Raj",          subject: "Music",                 email: "", notes: "Creative arts rotation" },
  { id: "library",            honorific: "", name: "Rajkumar",             subject: "Library",               email: "", notes: "" },
  { id: "mscs2",              honorific: "", name: "Shikha Prabhakaran",   subject: "MSCS-2",                email: "", notes: "" },
  { id: "physical-education", honorific: "", name: "Pavan",                subject: "Physical Education",    email: "", notes: "" },
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
