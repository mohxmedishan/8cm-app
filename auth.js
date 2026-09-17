// UPDATED computeIsMonitor() IMPLEMENTATION
export async function computeIsMonitor(user) {
  if (!user) return false;
  if (emailMatchesAllowlist(user)) return true;

  try {
    const snap = await getDoc(monitorRef(user.uid));
    if (snap.exists()) return true;

    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists() && profile.data().monitor === true) return true;

    const email = (user.email || "").trim().toLowerCase();
    if (email) {
      const inviteSnap = await getDoc(doc(db, "monitorInvites", email));
      if (inviteSnap.exists()) return true;
    }

    return false;
  } catch (err) {
    console.error("Failed to check monitor status:", err);
    return false;
  }
}
