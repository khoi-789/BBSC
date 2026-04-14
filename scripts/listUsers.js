const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listUsers() {
  const s = await db.collection('users').get();
  console.log('List of users:');
  s.forEach(d => {
    const data = d.data();
    console.log(`- Username: ${data.email.split('@')[0]}, Email: ${data.email}, Name: ${data.displayName}`);
  });
}

listUsers().catch(console.error);
