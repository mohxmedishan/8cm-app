# Collective Minds — Phase 1 handoff

Date: 2026-10-16
Input snapshot: `8cm-app-main (2).zip` (V18-era project)
Completed scope: Phase 0 source audit and Phase 1 security patch.

## Findings verified in source

- `firestore.rules` included a `users/{uid}.monitor`-based monitor authorization path even though comments/docs said profile role flags were not trusted.
- `auth.js` also treated `profile.monitor === true` as monitor status for the UI.
- Self-service profile updates were not restricted to a set of permitted fields.
- Profile claim-mirror validation checked the ID but did not consistently validate the paired claimed student name.
- `assignmentStatus` updates checked the new `uid`, but did not also require the existing record to belong to that UID or enforce the expected document ID on updates.

## Changes in this patch

- Removed profile-boolean authorization from Firestore rules and client monitor detection. Remaining role sources are the bootstrap email allowlist, `monitors/{uid}`, and `monitorInvites/{email}`.
- Restricted user profile creation to known profile fields and self-service updates to an explicit changed-field allowlist.
- Validated `claimedStudentId` and `claimedStudentName` together against a claim document owned by the signed-in UID.
- Tightened `assignmentStatus` creation/update checks for ownership, document ID, allowed fields, and valid status values.
- Updated README, security notes, monitor error messages, and management-page guidance to remove obsolete profile-flag instructions.

## Validation performed

- `node --check` passed for every project JavaScript file.
- Focused static assertions passed for the role-path removal, profile field restrictions, claim-mirror checks, and assignment-status ownership conditions.
- Firebase CLI and an existing emulator test harness were not present in the project/environment. Firestore rules have NOT been compiled or exercised by the Firebase Emulator Suite.

## Required before deployment

1. Review the changed `firestore.rules` file.
2. Set up Firebase Emulator Suite and `@firebase/rules-unit-testing` in a separate test harness, then test student/monitor/unauthenticated cases before publishing.
3. Specifically verify that ordinary students cannot set their own `monitor` field to gain access, cannot modify another student's status, cannot overwrite an existing claim, and can still update permitted profile fields.
4. Verify legitimate monitor email allowlist, monitor document, and invite flows.
5. Deploy rules only after emulator tests pass. This patch does not deploy rules or touch live Firebase data.

## Known limitation

The existing claim system enforces exclusive ownership of an already-claimed roster identity, but it does not verify the real-world identity of a person claiming an otherwise unclaimed student. Full impersonation prevention for unclaimed entries requires a trusted approval or claim-code workflow and is outside this patch's scope.

## Patch application

The accompanying ZIP contains only changed/new files, with original relative paths. Merge those files into the project root. No production data deletion is required. Continue with Phase 2 only after the security rules have been reviewed and tested.
