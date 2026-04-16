const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 1. Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

const EXCEL_FILE = 'BBSC_Data.xlsx';

async function clearCollection(colName) {
  console.log(`- Đang xóa sạch collection ${colName}...`);
  const snapshot = await db.collection(colName).get();
  const batchSize = 400;
  for (let i = 0; i < snapshot.size; i += batchSize) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log(`- Đã xóa xong ${snapshot.size} bản ghi cũ.`);
}

async function migrateSmart() {
  console.log('--- BẮT ĐẦU DI CƯ THÔNG MINH (KHÔNG TRÙNG LẶP) ---');
  
  const filePath = path.join(__dirname, EXCEL_FILE);
  if (!fs.existsSync(filePath)) {
    console.error('! Không tìm thấy file BBSC_Data.xlsx');
    process.exit(1);
  }

  await clearCollection('bbsc_reports');

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets['Incident_List'];
  if (!sheet) {
    console.error('! Không tìm thấy tab Incident_List');
    process.exit(1);
  }

  const rawRecords = XLSX.utils.sheet_to_json(sheet);
  console.log(`- Đọc được ${rawRecords.length} dòng từ Excel.`);

  // GROUP BY UUID and pick the best one
  const bestRows = new Map();
  rawRecords.forEach((row, idx) => {
    const uuid = row.UUID;
    if (!uuid) return;

    if (!bestRows.has(uuid)) {
      bestRows.set(uuid, row);
    } else {
      const existing = bestRows.get(uuid);
      const isNewDeleted = (row.IS_DELETED || '').toString().includes('DEL_');
      const isOldDeleted = (existing.IS_DELETED || '').toString().includes('DEL_');

      // logic: Prefer NON-DELETED rows. If both same, prefer the one appearing LATER in file.
      if (isOldDeleted && !isNewDeleted) {
        bestRows.set(uuid, row);
      } else if (isOldDeleted === isNewDeleted) {
        bestRows.set(uuid, row); // overwrite with later row
      }
    }
  });

  const finalRecords = Array.from(bestRows.values());
  console.log(`- Sau khi lọc trùng/phiên bản: Còn lại ${finalRecords.length} phiếu duy nhất.`);

  let count = 0;
  for (let i = 0; i < finalRecords.length; i += 400) {
    const batch = db.batch();
    const chunk = finalRecords.slice(i, i + 400);

    chunk.forEach(row => {
      try {
        const payload = JSON.parse(row.DATA_PAYLOAD);
        const isDeleted = (row.IS_DELETED || '').toString().includes('DEL_');
        
        // Use INCIDENT_NO from column B if payload is "(Tự động sinh)"
        let finalReportId = payload.header.incident_no;
        if (!finalReportId || finalReportId.includes('Tự động')) {
          finalReportId = row.INCIDENT_NO || "BBSC-IMPORT";
        }

        const fbData = {
          reportId: finalReportId,
          isDeleted: isDeleted,
          header: {
            supplier: payload.header.supplier || "",
            invoiceNo: payload.header.invoice_no || "",
            incidentType: payload.header.incident_type || "",
            dept: payload.header.dept || "",
            pic: payload.header.pic || "",
            subPic: payload.header.sub_pic || "",
            tags: payload.header.tags || "",
            note: payload.header.note || "",
            classification: payload.header.classification || "",
            createdDate: payload.header.created_date || "",
            status: payload.header.status || "Khởi tạo",
            completedDate: payload.header.completed_date || "",
            investigation: payload.header.investigation || "",
            immediateAction: payload.header.immediate_action || ""
          },
          items: (payload.items || []).map((it, idx) => ({
            id: `it_${Date.now()}_${idx}`,
            itemCode: it.item_code || "",
            itemName: it.product_name || "",
            batchNo: it.batch_no || "",
            expiryDate: it.expired_date || "",
            quantity: Number(it.quantity) || 0,
            unit: it.uom || "",
            lpn: it.lpn || "",
            asn: it.asn || "",
            issueType: it.problem_detail || "",
            detailedDescription: it.problem_detail || "",
            note: it.item_action || ""
          })),
          createdBy: "Migration",
          createdByName: "Hệ thống GAS",
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        };

        batch.set(db.collection('bbsc_reports').doc(row.UUID), fbData);
        count++;
      } catch (e) { }
    });
    await batch.commit();
    console.log(`  + Đã đẩy ${count} bản ghi...`);
  }

  process.exit(0);
}

migrateSmart().catch(console.error);
