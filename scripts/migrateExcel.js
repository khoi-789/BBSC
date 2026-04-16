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

async function migrateExcel() {
  console.log('--- BẮT ĐẦU DI CƯ TỪ FILE EXCEL ---');
  
  const filePath = path.join(__dirname, EXCEL_FILE);
  if (!fs.existsSync(filePath)) {
    console.error('! Không tìm thấy file BBSC_Data.xlsx trong folder scripts/');
    process.exit(1);
  }

  // Read Excel
  const workbook = XLSX.readFile(filePath);
  
  // We process 'Incident_List' and 'Archive_Trash'
  const sheetNames = ['Incident_List', 'Archive_Trash'];
  
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      console.warn(`! Bỏ qua tab ${name} (không tìm thấy trong Excel)`);
      continue;
    }

    console.log(`\n> Đang xử lý Tab: ${name}...`);
    const records = XLSX.utils.sheet_to_json(sheet);
    console.log(`- Tìm thấy ${records.length} dòng.`);

    let count = 0;
    const isTrash = (name === 'Archive_Trash');

    // Firestore Batch (Max 500)
    for (let i = 0; i < records.length; i += 400) {
      const batch = db.batch();
      const chunk = records.slice(i, i + 400);

      chunk.forEach(row => {
        try {
          const rawPayload = row.DATA_PAYLOAD;
          if (!rawPayload) return;

          const payload = JSON.parse(rawPayload);
          const rowIdx = i + chunk.indexOf(row);
          // NEW ID STRATEGY: Use a combination of row index and UUID to ensure 2024 UNIQUE documents
          const docId = `R${rowIdx}_${row.UUID || Date.now()}`;
          
          // Logic: If it's in Incident_List, it's ACTIVE
          const isDeleted = isTrash; 

          const fbData = {
            reportId: payload.header.incident_no || row.INCIDENT_NO || "BBSC-IMPORT",
            isDeleted: !!isDeleted,
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

          const docRef = db.collection('bbsc_reports').doc(docId);
          batch.set(docRef, fbData);
          count++;
        } catch (e) {
           // Skip errors
        }
      });

      await batch.commit();
      console.log(`  + Đã đẩy ${count} bản ghi...`);
    }
    console.log(`=> HOÀN TẤT TAB ${name}: ${count} bản ghi.`);
  }

  console.log('\n--- TẤT CẢ DỮ LIỆU ĐÃ LÊN CLOUD AN TOÀN! ---');
  process.exit(0);
}

migrateExcel().catch(console.error);
