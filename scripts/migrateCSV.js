const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// 1. Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// FILE SETTINGS
const CSV_FILE = 'D:\\Tool\\2.BBSC\\Tool BBSC HD LIVE v1.0 - Incident_List.csv';

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

// CACHE TO AVOID REDUNDANT QUERIES
const picCache = new Set();
const tagCache = new Set();

async function initCaches() {
  const users = await db.collection('users').get();
  users.forEach(doc => {
    const data = doc.data();
    if (data.linkedPic) picCache.add(data.linkedPic);
  });
  
  const master = await db.collection('master_data').where('group', '==', 'tag').get();
  master.forEach(doc => {
    const data = doc.data();
    if (data.key) tagCache.add(data.key);
  });
}

async function ensurePicExists(picName) {
  if (!picName || picCache.has(picName)) return;
  console.log(`  + Tự động tạo PIC: ${picName}`);
  await db.collection('users').add({
    displayName: picName,
    linkedPic: picName,
    role: picName.includes('Admin') ? 'Admin' : 'Staff',
    isPic: true,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  picCache.add(picName);
}

async function ensureTagExists(tagStr) {
  if (!tagStr) return;
  const tags = tagStr.split(',').map(t => t.trim()).filter(Boolean);
  for (const t of tags) {
    if (tagCache.has(t)) continue;
    console.log(`  + Tự động tạo TAG: ${t}`);
    await db.collection('master_data').add({
      group: 'tag',
      key: t,
      value: t,
      order: 99,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tagCache.add(t);
  }
}

async function migrateCSV() {
  console.log('--- BẮT ĐẦU DI CƯ TỪ FILE CSV (GOOGLE APPS SCRIPT) ---');
  
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`! Không tìm thấy file: ${CSV_FILE}`);
    process.exit(1);
  }

  await initCaches();
  await clearCollection('bbsc_reports');

  const fileContent = fs.readFileSync(CSV_FILE, 'utf8');
  const results = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
  const rawRecords = results.data;
  console.log(`- Đọc được ${rawRecords.length} dòng từ CSV.`);

  // Deduplication
  const bestRows = new Map();
  rawRecords.forEach((row) => {
    const uuid = row.UUID || row.uuid;
    if (!uuid) return;
    const existing = bestRows.get(uuid);
    const isNewDel = (row.IS_DELETED || row.is_deleted || '').toString().includes('DEL_');
    const isOldDel = (existing?.IS_DELETED || existing?.is_deleted || '').toString().includes('DEL_');

    if (!existing || (isOldDel && !isNewDel)) {
      bestRows.set(uuid, row);
    }
  });

  const finalRecords = Array.from(bestRows.values());
  console.log(`- Sau khi lọc trùng: Còn lại ${finalRecords.length} bản ghi.`);

  let count = 0;
  for (let i = 0; i < finalRecords.length; i += 400) {
    const batch = db.batch();
    const chunk = finalRecords.slice(i, i + 400);

    for (const row of chunk) {
      try {
        const payloadStr = row.DATA_PAYLOAD || row.payload;
        if (!payloadStr) continue;

        const payload = JSON.parse(payloadStr);
        const h = payload.header || {};
        const uuid = row.UUID || row.uuid;
        const isDeleted = (row.IS_DELETED || row.is_deleted || '').toString().includes('DEL_');

        // Auto seeding
        if (h.pic) await ensurePicExists(h.pic);
        if (h.sub_pic) await ensurePicExists(h.sub_pic);
        if (h.tags) await ensureTagExists(h.tags);

        // Map to Firestore schema
        const fbData = {
          reportId: h.incident_no || row.INCIDENT_NO || "BBSC-IMPORT",
          header: {
            supplier: h.supplier || "",
            invoiceNo: h.invoice_no || "",
            incidentType: h.incident_type || "",
            dept: h.dept || "",
            pic: h.pic || "",
            subPic: h.sub_pic || "",
            tags: h.tags || "",
            note: h.note || "",
            classification: h.classification || "",
            createdDate: h.created_date || "",
            status: h.status || "Khởi tạo",
            completedDate: h.completed_date || "",
            investigation: h.investigation || "",
            immediateAction: h.immediate_action || ""
          },
          items: (payload.items || []).map((it, idx) => ({
            id: `it_${uuid}_${idx}`,
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
          isDeleted: isDeleted,
          createdBy: "Migration_CSV",
          createdByName: "Hệ thống GAS",
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        };

        batch.set(db.collection('bbsc_reports').doc(uuid), fbData);
        count++;
      } catch (e) {
        console.error(`! Lỗi: ${row.UUID}`, e.message);
      }
    }
    await batch.commit();
    console.log(`  + Đã đẩy ${count} bản ghi...`);
  }

  process.exit(0);
}

migrateCSV().catch(console.error);
