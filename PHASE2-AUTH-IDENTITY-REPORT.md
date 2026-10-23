# Phase 2 — Authentication and student identity

Date: 2026-10-16

## Changes made

- Removed the cached-auth UI shortcut. The navbar no longer trusts stale localStorage profile/monitor state before Firebase resolves the real session.
- Added explicit `identityStatus` states (`loading`, `ready`, `error`) so the student-claim modal only appears after the authoritative identity lookup succeeds. A failed lookup no longer gets misinterpreted as an unclaimed account.
- Added a generation guard to the single auth-state listener so a slow result from an older sign-in event cannot overwrite a newer session.
- Reconciled `users/{uid}` claim mirrors against `claims/` on each successful profile read, including stale mirrors after a switch/released claim.
- Stopped using localStorage claim cache as an onboarding decision source.
- Made profile creation timestamps stable. `createdAt` is written only when a profile is first created and can no longer be edited by ordinary self-profile updates.
- Added explicit timeout/error handling to the sign-in completion wait.
- Made the wrong-account sign-out action await completion and show a visible error instead of silently swallowing a failure.
- Added Firestore rule tests for profile timestamp immutability, claim mirror repair, and paired clearing of stale claim fields.
- Added Node-only auth contract tests that can run without downloading dependencies.

## Checks actually executed

- JavaScript syntax check: **44/44 files passed**.
- Static HTML asset/ID audit: **15 pages, 0 errors, 0 warnings**.
- Auth contract tests: **4/4 passed**.
- ZIP integrity: checked before delivery.

## Not executed

- Firestore Emulator authorization suite: **not run**. `npm test` reaches the emulator step and fails because the `firebase` CLI is not installed (`firebase: not found`). The environment cannot currently install missing npm packages. The new Firestore rule tests therefore remain authored but unverified against the emulator.
- Live Google/email sign-in, browser redirects, and multi-account switching: **not run** because this environment does not have a connected test Firebase project or browser session.

## Remaining known issue

The app still cannot prove that a person is the real student whose public roster entry they select. Firestore rules can validate that a name/ID exists and is not already claimed, but a public roster is not proof of identity. Solving this requires a product decision, such as monitor approval for first-time claims or a trusted pre-provisioned account-to-student mapping. This phase does not pretend to solve that with client-side code.

## Apply

Overlay these changed files on a copy of the Phase 1 project. Do not deploy the rules to the live project until the Firestore Emulator suite passes and a monitor has reviewed the identity-claim policy.
