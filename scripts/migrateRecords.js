const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// 1. Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// 2. Configuration
// We will process 'data_list.csv' (UTF-8) provided by user
const FILES_TO_PROCESS = [
  { path: 'data_list.csv', isTrash: false }
];

async function migrate() {
  console.log('--- BẮT ĐẦU DI CƯ DỮ LIỆU TỪ GAS (UTF-8) ---');

  for (const fileDef of FILES_TO_PROCESS) {
    const filePath = path.join(__dirname, fileDef.path);
    if (!fs.existsSync(filePath)) {
      console.warn(`! Không tìm thấy file: ${fileDef.path}. Bỏ qua.`);
      continue;
    }

    console.log(`\n> Đang xử lý file: ${fileDef.path}...`);
    // Reading with UTF-8 to preserve marks
    const fileContent = fs.readFileSync(filePath, 'utf8');

    let records;
    try {
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        delimiter: ','
      });
    } catch (e) {
      console.log(' Thử lại với dấu phân tách Tab (TSV)...');
       records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        delimiter: '\t'
      });
    }

    console.log(`- Tìm thấy ${records.length} dòng dữ liệu.`);

    let successCount = 0;
    
    // Process in batches
    for (let i = 0; i < records.length; i += 400) {
      const batch = db.batch();
      const chunk = records.slice(i, i + 400);

      for (const row of chunk) {
        try {
          const rawPayload = row.DATA_PAYLOAD || row['"DATA_PAYLOAD"'];
          if (!rawPayload) continue;

          const payload = JSON.parse(rawPayload.replace(/^"|"$/g, '').replace(/""/g, '"'));
          const docId = row.UUID || `MIGRATE_${Date.now()}_${Math.random()}`;
          const isDeleted = fileDef.isTrash || (row.IS_DELETED && row.IS_DELETED.includes('DEL_'));

          const fbData = {
            reportId: payload.header.incident_no || row.INCIDENT_NO || "MIGRATE",
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
            items: (payload.items || []).map((item, idx) => ({
              id: `item_${idx}_${Date.now()}`,
              itemCode: item.item_code || "",
              itemName: item.product_name || "",
              batchNo: item.batch_no || "",
              expiryDate: item.expired_date || "",
              quantity: Number(item.quantity) || 0,
              unit: item.uom || "",
              issueType: payload.header.classification || "",
              detailedDescription: item.problem_detail || "",
              action: item.item_action || ""
            })),
            createdBy: "Migration",
            createdByName: "GAS System",
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          };

          const docRef = db.collection('reports').doc(docId);
          batch.set(docRef, fbData);
          successCount++;
        } catch (e) {
          // Skip errors quietly to keep console clean
        }
      }

      await batch.commit();
      console.log(`  + Đã đẩy ${successCount} bản ghi...`);
    }

    console.log(`\n=> THÀNH CÔNG: ${successCount} bản ghi.`);
  }

  process.exit(0);
}

migrate();
