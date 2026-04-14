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

// 2. Sample Data
const categories = [
  // --- DEPT ---
  { group: 'dept', value: 'Kho Nhập', order: 1 },
  { group: 'dept', value: 'Kho Lạnh', order: 2 },
  { group: 'dept', value: 'QA', order: 3 },
  { group: 'dept', value: 'Kho Biệt Trữ', order: 4 },
  
  // --- PIC ---
  { group: 'pic', value: 'Trình', order: 1 },
  { group: 'pic', value: 'Phúc', order: 2 },
  { group: 'pic', value: 'Khôi', order: 3 },
  { group: 'pic', value: 'Như', order: 4 },
  
  // --- INCIDENT_TYPE ---
  { group: 'incident_type', value: 'Sai số lượng', order: 1 },
  { group: 'incident_type', value: 'Hư hỏng vật lý', order: 2 },
  { group: 'incident_type', value: 'Không đạt cảm quan', order: 3 },
  { group: 'incident_type', value: 'Thiếu hồ sơ', order: 4 },

  // --- CLASSIFICATION ---
  { group: 'classification', value: 'HÀNG TRONG NƯỚC', order: 1 },
  { group: 'classification', value: 'HÀNG NHẬP KHẨU', order: 2 },

  // --- STATUS ---
  { group: 'status', value: 'Khởi tạo', order: 1 },
  { group: 'status', value: 'Chờ hết INV', order: 2 },
  { group: 'status', value: 'Đã hoàn tất', order: 3 },
];

async function init() {
  console.log('🚀 Đang khởi tạo Master Data trên Project mới...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();
  
  // Clean existing (optional, but good for Fresh Start)
  const existing = await colRef.get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new data
  categories.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log('✅ Khởi tạo Master Data thành công!');
  console.log('🎉 Project HoangDuc-BBSC hiện đã có dữ liệu danh mục.');
}

init().catch(err => console.error('Lỗi khi đẩy dữ liệu:', err));
