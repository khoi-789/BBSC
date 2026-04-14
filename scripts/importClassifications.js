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

// 2. Data from User (CLASSIFICATION list)
const classifications = [
  { group: 'classification', key: 'HÀNG NHẬP KHẨU', value: 'HÀNG NHẬP KHẨU', order: 1 },
  { group: 'classification', key: 'HÀNG TRONG NƯỚC', value: 'HÀNG TRONG NƯỚC', order: 2 },
  { group: 'classification', key: 'HÀNG TRẢ VỀ', value: 'HÀNG TRẢ VỀ', order: 3 },
  { group: 'classification', key: 'CN. HÀ NỘI', value: 'CN. HÀ NỘI (Điều chuyển)', order: 4 },
  { group: 'classification', key: 'CN. ĐÀ NẴNG', value: 'CN. ĐÀ NẴNG (Điều chuyển)', order: 5 },
  { group: 'classification', key: 'CN. HƯNG YÊN', value: 'CN. HƯNG YÊN (Điều chuyển)', order: 6 },
  { group: 'classification', key: 'HÀNG LÀM DỊCH VỤ', value: 'HÀNG LÀM DỊCH VỤ', order: 7 },
];

async function updateClassifications() {
  console.log('🚀 Đang cập nhật Danh mục Phân loại hàng lên Firebase...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();

  // Clean old classifications first (to avoid duplicates/mess)
  const existing = await colRef.where('group', '==', 'classification').get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new ones
  classifications.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log('✅ Đã cập nhật xong 7 mục Phân loại hàng!');
}

updateClassifications().catch(err => console.error('Lỗi:', err.message));
