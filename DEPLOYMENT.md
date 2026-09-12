# 8CM deployment

1. In Vercel, add these environment variables from Firebase Project Settings > Your apps > Web app:
   FIREBASE_API_KEY
   FIREBASE_AUTH_DOMAIN
   FIREBASE_PROJECT_ID
   FIREBASE_STORAGE_BUCKET
   FIREBASE_MESSAGING_SENDER_ID
   FIREBASE_APP_ID

2. In Firebase Authentication, enable Google and Email/Password.
3. Add the deployed Vercel hostname to Firebase Authentication > Settings > Authorized domains.
4. Publish firestore.rules in Firestore.
5. Redeploy on Vercel and test in a private window.

The frontend is intentionally independent from Firebase boot. A Firebase failure cannot prevent the main page, navbar, directory, statistics, or hero bars from loading.
