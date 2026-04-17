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

// 2. Standard Depts
const standardDepts = [
  'Kho Nhập', 'Kho Lạnh', 'Phòng QA', 'Kho Biệt Trữ', 'Kho Xuất', 'Team ĐGC2'
];

async function cleanDepts() {
  console.log('🧹 Đang dọn dẹp cấu hình Bộ Phận...');
  
  const colRef = db.collection('master_data');
  const snapshot = await colRef.where('group', '==', 'dept').get();
  
  if (snapshot.empty) {
    console.log('ℹ️ Không tìm thấy dữ liệu Bộ phận cũ.');
  } else {
    const deleteBatch = db.batch();
    snapshot.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    console.log(`🗑️ Đã xóa ${snapshot.size} bản ghi Bộ phận cũ/sai.`);
  }

  console.log('✨ Đang nạp danh sách Bộ Phận chuẩn...');
  const addBatch = db.batch();
  standardDepts.forEach((dept, index) => {
    const docRef = colRef.doc();
    addBatch.set(docRef, {
      group: 'dept',
      key: dept,
      value: dept,
      order: index + 1,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await addBatch.commit();
  console.log('✅ Đã làm sạch và cập nhật cấu hình Bộ Phận thành công!');
}

cleanDepts().catch(err => console.error('Lỗi khi xử lý:', err));
