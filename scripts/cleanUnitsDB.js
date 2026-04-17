const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('[LỖI]: Thiếu file serviceAccountKey.json trong thư mục scripts.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 2. Standard Units (matched with cleanUnit logic in Migration Tool)
const standardUnits = [
  'HỘP', 'CÁI', 'CHAI', 'LỌ', 'ỐNG', 'THÙNG', 'VỈ', 'VIÊN', 'GÓI', 'TUÝP', 'PALLET', 'LON', 'HỘP LỚN'
];

async function cleanUnits() {
  console.log('🧹 Đang dọn dẹp cấu hình Đơn Vị Tính...');
  
  const colRef = db.collection('master_data');
  const snapshot = await colRef.where('group', '==', 'unit').get();
  
  if (snapshot.empty) {
    console.log('ℹ️ Không tìm thấy dữ liệu Đơn vị tính cũ.');
  } else {
    const deleteBatch = db.batch();
    snapshot.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    console.log(`🗑️ Đã xóa ${snapshot.size} bản ghi Đơn vị tính cũ/sai.`);
  }

  console.log('✨ Đang nạp danh sách Đơn Vị Tính chuẩn...');
  const addBatch = db.batch();
  standardUnits.forEach((unit, index) => {
    const docRef = colRef.doc();
    addBatch.set(docRef, {
      group: 'unit',
      key: unit,
      value: unit,
      order: index + 1,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await addBatch.commit();
  console.log('✅ Đã làm sạch và cập nhật Đơn Vị Tính thành công!');
}

cleanUnits().catch(err => console.error('Lỗi khi xử lý:', err));
