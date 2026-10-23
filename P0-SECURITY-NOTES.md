# P0 security + foundation upgrade — what changed and what you need to do

This covers the first phase of the CM production upgrade (security + foundation).
Read this before deploying.

## The bug that made this urgent

Historical note: the earlier `firestore.rules` let any signed-in user update their own `users/{uid}`
doc with no restriction on which fields changed:

```
allow update: if request.auth != null && (
  ... ||
  request.auth.uid == userId
);
```

`admin` was just a field on that same doc, and `computeIsAdmin()` in `auth.js`
trusted `profile.admin === true`. Any signed-in student could open devtools and
run one `updateDoc` call to set `admin: true` on themselves and get full write
access to `tasks` (and anything else gated the same way).

**Before you do anything else: open the Firebase console → Firestore →
`users` collection and check whether any account other than the real owner
already has `admin: true` set.** If one does, delete that field from the doc —
the new rules stop it from being re-added this way, but they can't undo a
grant that already happened.

## What changed

- **`firestore.rules`** — monitor authority must come only from the bootstrap
  email allowlist, `monitors/{uid}`, or `monitorInvites/{email}`. Profile role flags
  are not trusted. Self-service profile writes are limited to known profile fields,
  and claim mirrors must match a claim owned by the same UID. Also
  added: a `claims/{studentId}` collection that makes identity-claiming
  atomic at the database level (see below), and rules for every collection
  in the target architecture (`assignments`, `announcements`, `events`,
  `notifications`, `gallery`, `activityLogs`, etc.) so later phases can build
  directly on secure rules instead of needing another rules pass.
- **`auth.js`** — `claimStudentIdentity` / `switchStudentIdentity` use a Firestore
  transaction to manage the authoritative `claims/{studentId}` records. The
  `users/{uid}` profile mirror is written after the claim transaction commits,
  because the profile rules validate it against the committed claim document.
  A second account cannot overwrite an existing claim through the student
  create path; claim updates are monitor-only.
- **"admin" → "monitor"** renamed throughout `auth.js`, `auth-ui.js`,
  `tasks.js`, `index.html`, `style.css` (state field, CSS classes, UI copy).
  No user-facing behavior changes here beyond the label.
- **`students.js`** — the hardcoded array is now seed/fallback data, not the
  live source. Added `loadStudents()` (reads `students/{id}` from Firestore,
  falls back to the local array on any error or if the collection is empty)
  and `migrateStudentsToFirestore()` (one-time, idempotent, writes the seed
  array into Firestore without overwriting anything already there).

## What you need to do before/while deploying

1. **Add your other two monitors' emails** in two places, kept in sync:
   - `firestore.rules` → `isMonitorEmail()`
   - `auth.js` → `MONITOR_EMAILS`

   (Alternative to hardcoding all 3: once you're signed in as the owner, you
   can add the other two as monitors dynamically later by writing a doc to
   `monitors/{their-uid}` — but you need their uid, which means they need to
   sign in at least once first. Easiest to just add the 3 emails for now.)

2. **Publish the new rules**: Firebase console → Firestore Database → Rules →
   paste in `firestore.rules` → Publish.

3. **Test with the Firebase Emulator Suite before trusting this in
   production.** I wrote and reviewed these rules carefully, including the
   `claims`/`users` cross-document validation (`get()` calls checking a
   sibling document inside the same transaction), which is a well-documented
   Firestore pattern but genuinely needs a real Firestore engine to confirm —
   I don't have network access in this environment to run `firebase
   emulators:start` myself. At minimum, manually test:
   - Two accounts racing to claim the same student — exactly one should win.
   - A signed-in student trying to `updateDoc` their own profile with
     `claimedStudentId` set to something with no matching `claims` doc —
     should be rejected.
   - Trying to write anything to `monitors/{uid}` as a non-monitor — should
     be rejected.

4. **Run the student migration once**, signed in as a monitor, from the
   browser console on a page that's loaded `students.js` as a module:
   ```js
   import("./students.js").then(m => m.migrateStudentsToFirestore());
   ```
   Re-running it later is safe — it skips any student doc that already
   exists.

## Known gap / next phase

`students.js`'s `students` export (the synchronous array) is still what the
identity-claim picker and the directory pages read from directly — it isn't
wired up to `loadStudents()` yet. That's deliberate for this pass: changing
every page that touches `students` to be async is real UI-layer work
(P1: "personal dashboard" / directory pages), not a security fix, and doing
it hastily alongside the rules rewrite risked breaking the picker. Firestore
is now the source of truth for monitors editing data; wiring the read side
everywhere is next.


## Current security review (2026-10-16)

The uploaded V18 source still contained a legacy `isMonitorFlag()` rule path and a matching client-side `computeIsMonitor()` profile check, despite the historical notes above. The current patch removes both paths, restricts self-service profile writes to an explicit allowlist of fields, validates both claim mirror fields together, and tightens ownership checks for `assignmentStatus` updates.

The rules have not been deployed to Firebase by this patch. The Firebase CLI and an existing emulator test setup were not present in the uploaded project, so emulator-based authorization tests still need to be run before deployment. Existing profile documents may retain a stale `monitor` field, but that field must no longer grant authority. Do not remove production data as part of this code patch.

The current claim design prevents a second account from taking an identity that is already claimed. It does **not** prove the real-world identity of a person claiming an otherwise unclaimed roster entry; the current product has no trusted verification token or approval step for that. Solving that fully requires a separate identity-verification workflow and should not be falsely represented as solved by Firestore rules alone.
