import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    // --- PRODUCTION (Vercel): Read from Environment Variables ---
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else if (process.env.NODE_ENV === 'development') {
      // --- LOCAL DEVELOPMENT ONLY ---
      try {
        // Use eval('require') to prevent Next.js from trying to bundle this file in Production
        const dynamicRequire = eval('require');
        const serviceAccount = dynamicRequire('../../scripts/serviceAccountKey.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } catch (e) {
        console.warn('Local serviceAccountKey.json not found, skipping admin init');
      }
    }
  } catch (error) {
    console.error('Firebase Admin init error:', error);
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
