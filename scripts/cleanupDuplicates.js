const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function cleanupDuplicates() {
  const db = admin.firestore();
  const auth = admin.auth();
  
  // 1. Get real auth UID for khoilm
  const realUser = await auth.getUserByEmail('khoilm@bbsc.com');
  const realUid = realUser.uid;
  console.log(`Real Auth UID for khoilm@bbsc.com is: ${realUid}`);
  
  // 2. Find all firestore docs with that email
  const snap = await db.collection('users').where('email', '==', 'khoilm@bbsc.com').get();
  
  for (const d of snap.docs) {
    if (d.id !== realUid) {
      console.log(`Deleting duplicate Firestore doc: ${d.id}`);
      await d.ref.delete();
    }
  }
  
  // 3. Reset real password to BBSC123456
  await auth.updateUser(realUid, {
    password: 'BBSC123456'
  });
  console.log(`Successfully reset password to: BBSC123456`);
}

cleanupDuplicates().catch(console.error);
