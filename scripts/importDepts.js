const admin = require('firebase-admin');
const path = require('path');

// 1. Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 2. Data from User (DEPT list)
const depts = [
  { group: 'dept', key: 'Phòng QA', value: 'Phòng QA', order: 1 },
  { group: 'dept', key: 'Kho Nhập', value: 'Kho Nhập', order: 2 },
  { group: 'dept', key: 'Kho Xuất', value: 'Kho Xuất', order: 3 },
  { group: 'dept', key: 'Kho Lạnh', value: 'Kho Lạnh', order: 4 },
  { group: 'dept', key: 'Team ĐGC2', value: 'Team ĐGC2', order: 5 },
];

async function updateDepts() {
  console.log('🚀 Đang cập nhật Danh mục Bộ phận (DEPT) lên Firebase...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();

  // Clean old depts first
  const existing = await colRef.where('group', '==', 'dept').get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new ones
  depts.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log('✅ Đã cập nhật xong 5 mục Bộ phận!');
}

updateDepts().catch(err => console.error('Lỗi:', err.message));
