const admin = require('firebase-admin');
const fs = require('fs');

// ==========================================
// CÔNG CỤ CHUYỂN ĐỔI DỮ LIỆU TỪ GOOGLE SHEETS SANG FIRESTORE
// ==========================================

// 1. Khởi tạo Admin SDK
const serviceAccountPath = './serviceAccountKey.json';
if (!fs.existsSync(serviceAccountPath)) {
  console.error('[LỖI]: Thiếu file credentials.');
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// 2. Định nghĩa cấu trúc data (Bạn cần xuất SpreadSheet ra thành file JSON)
// Chạy lệnh trong Google Apps Script: 
// Logger.log(JSON.stringify(sheet.getDataRange().getValues()))
// Hoặc xuất file Google Sheet thành JSON

const BBSC_LEGACY_JSON_PATH = './legacy_data.json';

async function migrate() {
  if (!fs.existsSync(BBSC_LEGACY_JSON_PATH)) {
    console.error(`\n[HƯỚNG DẪN]: Bạn cần đưa file JSON dữ liệu cũ vào -> scripts/legacy_data.json\n`);
    return;
  }

  const legacyData = JSON.parse(fs.readFileSync(BBSC_LEGACY_JSON_PATH, 'utf8'));
  console.log(`Đang phân tích ${legacyData.length} dòng dữ liệu...`);

  // Bỏ qua dòng đầu tiên nếu là Header
  const rows = legacyData.slice(1);

  // Lưu trữ tạm BBSC object để gộp các lines của cùng 1 biên bản
  const reports = {};

  rows.forEach(row => {
    // Tùy theo cấu trúc cột Google Sheet cũ của bạn
    // VD: [ID, NCC, LOAI_SC, NGAY_LAP, TRANG_THAI, ...]
    const reportId = row[0]; // Cột A
    
    if (!reports[reportId]) {
      // Header
      reports[reportId] = {
        reportId: reportId,
        header: {
          supplier: row[1] || '',
          incidentType: row[2] || '',
          createdDate: row[3] || '',
          status: row[4] || 'Khởi tạo',
          dept: row[5] || '',
          pic: row[6] || '',
          invoiceNo: row[7] || '',
          note: row[8] || ''
        },
        items: [],
        createdBy: 'migration_bot',
        createdByName: 'Hệ thống Cũ',
        isDeleted: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
    }
    
    // Items
    reports[reportId].items.push({
      itemCode: row[9] || '',
      itemName: row[10] || '',
      batchNo: row[11] || '',
      quantity: Number(row[12]) || 0,
      unit: row[13] || 'HOP',
      issueType: row[14] || '',
      note: row[15] || '',
      id: Math.random().toString(36).slice(2)
    });
  });

  const batchSize = 500;
  let batch = db.batch();
  let count = 0;

  console.log('\nĐang Upload lên Firestore...');

  for (const repId in reports) {
    const data = reports[repId];
    const docRef = db.collection('bbsc_reports').doc(); // Auto ID
    
    batch.set(docRef, data);
    count++;

    // Commit mỗi 500 records
    if (count % batchSize === 0) {
      await batch.commit();
      console.log(`✅ Đã commit ${count} records...`);
      batch = db.batch();
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
    console.log(`✅ Đã commit tổng cộng ${count} records!`);
  }

  console.log('🎉 QUÁ TRÌNH MIGRATION HOÀN TẤT!');
}

migrate();
