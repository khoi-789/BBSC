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
  { group: 'dept', key: 'Kho Nhập', value: 'Kho Nhập', order: 1 },
  { group: 'dept', key: 'Kho Lạnh', value: 'Kho Lạnh', order: 2 },
  { group: 'dept', key: 'QA', value: 'QA', order: 3 },
  { group: 'dept', key: 'Kho Biệt Trữ', value: 'Kho Biệt Trữ', order: 4 },
  
  // --- PIC ---
  { group: 'pic', key: 'Trình', value: 'Trình', order: 1 },
  { group: 'pic', key: 'Phúc', value: 'Phúc', order: 2 },
  { group: 'pic', key: 'Khôi', value: 'Khôi', order: 3 },
  { group: 'pic', key: 'Như', value: 'Như', order: 4 },
  
  // --- INCIDENT_TYPE ---
  { group: 'incident_type', key: 'Sai số lượng', value: 'Sai số lượng', order: 1 },
  { group: 'incident_type', key: 'Hư hỏng vật lý', value: 'Hư hỏng vật lý', order: 2 },
  { group: 'incident_type', key: 'Không đạt cảm quan', value: 'Không đạt cảm quan', order: 3 },
  { group: 'incident_type', key: 'Thiếu hồ sơ', value: 'Thiếu hồ sơ', order: 4 },

  // --- CLASSIFICATION ---
  { group: 'classification', key: 'HÀNG TRONG NƯỚC', value: 'HÀNG TRONG NƯỚC', order: 1 },
  { group: 'classification', key: 'HÀNG NHẬP KHẨU', value: 'HÀNG NHẬP KHẨU', order: 2 },

  // --- STATUS ---
  { group: 'status', key: 'Khởi tạo', value: 'Khởi tạo', order: 1 },
  { group: 'status', key: 'Chờ hết INV', value: 'Chờ hết INV', order: 2 },
  { group: 'status', key: 'Hoàn tất', value: 'Hoàn tất', order: 3 },
  { group: 'status', key: 'Hủy', value: 'Hủy', order: 4 },

  // --- UNIT ---
  { group: 'unit', key: 'Hộp', value: 'Hộp', order: 1 },
  { group: 'unit', key: 'Viên', value: 'Viên', order: 2 },
  { group: 'unit', key: 'Chai', value: 'Chai', order: 3 },
  { group: 'unit', key: 'Ống', value: 'Ống', order: 4 },
  { group: 'unit', key: 'Cái', value: 'Cái', order: 5 },

  // --- TAG ---
  { group: 'tag', key: 'Gấp', value: 'Gấp', order: 1 },
  { group: 'tag', key: 'COA', value: 'Chờ COA', order: 2 },
  { group: 'tag', key: 'Đã mail hàng (chưa phản hồi)', value: 'Đã mail hàng (chưa phản hồi)', order: 3 },
  { group: 'tag', key: 'Chờ chốt hết đợt', value: 'Chờ chốt hết đợt', order: 4 },
  { group: 'tag', key: 'HOLD chi nhánh', value: 'HOLD chi nhánh', order: 5 },
  { group: 'tag', key: 'Chờ nội bộ phản hồi', value: 'Chờ nội bộ phản hồi', order: 6 },
  { group: 'tag', key: 'Chờ HÀNG', value: 'Chờ HÀNG', order: 7 },
  { group: 'tag', key: 'Chưa scan', value: 'Chưa scan', order: 8 },
  { group: 'tag', key: 'Hết INV', value: 'Hết INV', order: 9 },

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
