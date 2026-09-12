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

export const students = raw.map((s) => ({ ...s, id: slug(s.name) }));
