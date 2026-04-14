import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    // --- PRODUCTION (Vercel): Read from Environment Variables ---
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          // Vercel stores \n as literal string, need to replace back
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      // --- LOCAL DEVELOPMENT: Read from JSON file ---
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require('../../scripts/serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (error) {
    console.error('Firebase Admin init error:', error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
