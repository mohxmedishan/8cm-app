# 8CM production deployment

This project is a plain HTML/CSS/ES-module site with Firebase Authentication and Firestore.

## Vercel environment variables

Create these six Environment Variables in the Vercel project:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Use the Web App configuration from Firebase Console → Project settings → General → Your apps.

## Firebase Authentication

Enable these providers under Authentication → Sign-in method:

- Google
- Email/Password

Add the deployed site hostname to Authentication → Settings → Authorized domains.

## Firestore

Create the database and publish `firestore.rules`.

The application uses these collections:

- `users/{uid}`
- `tasks/{taskId}`
- `studentClaims/{studentId}`

The `studentClaims` collection is used as the server-enforced uniqueness lock for directory identities. The client-side `/users` lookup is only a fast human-readable check; the Firestore transaction and rules are the authority.

## Admin

The special admin email is `mohamedishankunnummal@gmail.com`.

Any other administrator must have `admin: true` in their own Firestore `users/{uid}` document. A normal client cannot change that field because the security rules require the value to remain unchanged during self-service profile updates.
