const admin = require('firebase-admin');
const path = require('path');

// 1. Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const picUsers = [
  { displayName: 'Nguyễn Thị Như', linkedPic: 'Như', department: 'QA' },
  { displayName: 'Trương Văn Phúc', linkedPic: 'Phúc', department: 'Kho' },
  { displayName: 'Lê Văn Trình', linkedPic: 'Trình', department: 'Kho' },
  { displayName: 'Lê Minh Khôi', linkedPic: 'Khôi', department: 'QA' },
];

async function seedUsers() {
  console.log('🚀 Đang khởi tạo danh sách PIC users...');
  
  const colRef = db.collection('users');
  
  for (const user of picUsers) {
    // We use linkedPic as a simple ID part or just search by it
    // For seeding, we can just create them if they don't exist
    const snapshot = await colRef.where('linkedPic', '==', user.linkedPic).get();
    
    if (snapshot.empty) {
      const docRef = colRef.doc(); // Auto ID
      await docRef.set({
        ...user,
        email: `${user.linkedPic.toLowerCase()}@bbsc.com`,
        role: 'Staff',
        isPic: true,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Đã tạo user PIC: ${user.displayName} (${user.linkedPic})`);
    } else {
      console.log(`ℹ️ User PIC đã tồn tại: ${user.linkedPic}`);
      // Ensure isPic is true
      await snapshot.docs[0].ref.update({ isPic: true });
    }
  }

  console.log('🎉 Xong!');
  process.exit(0);
}

seedUsers().catch(console.error);
