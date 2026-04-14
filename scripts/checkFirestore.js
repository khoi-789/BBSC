const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkData() {
  try {
    const snapshot = await db.collection('reports').limit(2).get();
    if (snapshot.empty) {
      console.log('--- KHÔNG TÌM THẤY DỮ LIỆU TRÊN FIRESTORE! ---');
    } else {
      console.log('--- DỮ LIỆU TRÊN FIRESTORE ---');
      snapshot.forEach(doc => {
        console.log(`Document ID: ${doc.id}`);
        console.log(JSON.stringify(doc.data(), null, 2));
        console.log('---');
      });
    }
  } catch (error) {
    console.error('Lỗi kiểm tra dữ liệu:', error);
  }
}

checkData();
