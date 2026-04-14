const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function fixRole() {
  const email = 'khoilm@bbsc.com';
  const db = admin.firestore();
  
  const snap = await db.collection('users').where('email', '==', email).get();
  if (snap.empty) {
    console.log('User not found');
    return;
  }
  
  const doc = snap.docs[0];
  await doc.ref.update({
    role: 'Admin' // Uppercase A
  });
  
  console.log(`Successfully updated role to 'Admin' (Uppercase) for ${email}`);
}

fixRole().catch(console.error);
