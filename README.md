# CM. — Collective Minds

A ground-up visual overhaul for the 8CM class hub.

## Included

- New responsive visual system with dark/light themes
- Persistent theme preference
- Firebase Google + email authentication
- Persistent student identity claiming
- Monitor-only homework and announcement publishing
- Firestore-backed live class chat
- Student directory with search + house filters
- Responsive mobile navigation
- Reduced-motion-friendly CSS transitions
- Accessible labels, focusable controls, semantic sections
- Vercel headers for Google popup compatibility

## Deploy

This is a plain static site. Put the folder on Vercel with no build command.

Before using Firebase features, make sure Authentication and Firestore are enabled and publish `firestore.rules`.

## Important

The Firebase web configuration is client-side configuration, not a password. Real protection is provided by Firestore Security Rules.

The current monitor allowlist contains `mohamedishankunnummal@gmail.com`, matching the existing project configuration.
