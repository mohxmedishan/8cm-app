# Merge fix — what happened and what I did

## What went wrong

Your friend's branch was based on an older snapshot of the site (V14.1).
When it got merged into main, several files were resolved by taking his
version wholesale — which silently **reverted** work you'd done after that
point (up through V14.3), while also genuinely adding his new features.
Two unrelated things got tangled into one bad merge.

## Regressions restored (your lost code)

- **`bgm.js`** — reverted from V14.3 back to V14.1. Restored: background
  music now resumes across page navigation instead of restarting, and the
  loop toggle is back.
- **`theme.js` + all 12 HTML pages** — lost `cacheResolvedAccent()`, which
  was the actual fix for **light mode not applying on 8 pages** (their boot
  script never read the saved dark/light preference at all). Restored in
  every page's inline boot script.
- **Settings modal (all 12 pages)** — reverted from the two-column
  Appearance/Sound layout back to an old stacked static layout. Restored,
  including the matching CSS (`.settings-columns`, `.bgm-loop-toggle`, the
  V14.3 override rules).
- **`describeWriteError` readable error messages** — silently dropped from
  **8 files**: `achievements.js`, `announcements.js`, `assignments.js`,
  `events.js`, `gallery.js`, `student-manage.js`, `tasks.js`,
  `teacher-manage.js`. They'd all been replaced with a generic "check your
  monitor access" message. Restored the real permission-denied /
  offline / unauthenticated messages in all 8.
- **`changelog.js`** — lost the V14.3 entry. Restored, plus added a new
  V15.0 entry documenting this fix.
- **`manage.js`** — lost the detailed "you're not a monitor" message (with
  your uid and troubleshooting steps). Restored.
- **`gallery.js`** — lost the "static" tag shown to monitors on seed
  gallery items. Restored.
- **`style.css` house colors** — reverted to different values in the same
  hunk as the rest of the V14.1 rollback. Restored your originals. (This
  one's a judgment call — if you actually liked his colors better, they're
  easy to swap back, just say so.)

## Friend's additions kept as-is

- Monitor invites by Gmail (add someone as a monitor before they've ever
  signed in) — `auth.js`, `firestore.rules`, new `monitor-manage.js` +
  "Monitors" tab in manage.html, public Monitors panel on the homepage.
- Real teacher roster + a fix so editing one teacher in Firestore no
  longer makes every other untouched teacher vanish from the directory.
- Rewritten links stack (`item-links.js`) — any number of named links per
  homework/announcement/event instead of 6 unnamed ones, used across
  `assignments.js`, `announcements.js`, `events.js`.
- Resource page icons, footer Changelog/Monitors toggle panels.

## The pfp / claimed-badge bug

I traced this carefully: `avatars.js`, `profile-modal.js`, and `auth-ui.js`
are **byte-identical** between your old branch and the merged one — nothing
in the merge touched this. The avatars collection and claims collection
are both correctly set to public/signed-in read in `firestore.rules`, and
the code reads them the same way for everyone.

That means the code in this repo is correct. The most likely real cause is
that **the rules file in this repo isn't the same as what's actually
deployed to your live Firebase project**. Editing `firestore.rules` in
your code does nothing on its own — it only takes effect once you either:

1. Run `firebase deploy --only firestore:rules`, or
2. Paste the file's contents into Firebase Console → Firestore Database →
   Rules → Publish.

If whoever last touched the live rules didn't redeploy after this merge
(or ever), other people's reads could be running against older, stricter
rules while the account owner always sees their own stuff through a
different, less-restricted path (`request.auth.uid == uid`). That
lines up exactly with what you described: your friend sees everything
(including his own), everyone else is missing just his data.

**Action item:** redeploy `firestore.rules` from this fixed project to
your live Firebase project, then have a couple of other people hard-refresh
and check again. If it's still broken after that, it's not a rules issue —
tell me and I'll dig further (would need to see your browser console
errors from someone who can't see the pfp).
