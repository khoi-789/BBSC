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

// 2. Data from User (STATUS list)
// Map INCIDENT_STATUS to system 'status' group
const statuses = [
  { group: 'status', key: 'Khởi tạo', value: 'Khởi tạo', order: 1 },
  { group: 'status', key: 'Chờ hết INV', value: 'Chờ hết INV', order: 2 },
  { group: 'status', key: 'Hoàn tất', value: 'Hoàn tất', order: 3 },
  { group: 'status', key: 'Đóng', value: 'Đóng', order: 4 },
];

async function updateStatuses() {
  console.log('🚀 Đang cập nhật Danh mục Trạng thái (STATUS) lên Firebase...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();

  // Clean old statuses
  const existing = await colRef.where('group', '==', 'status').get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new ones
  statuses.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log('✅ Đã cập nhật xong 4 mục Trạng thái!');
}

updateStatuses().catch(err => console.error('Lỗi:', err.message));
