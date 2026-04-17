const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized.');
} catch (err) {
  console.error('Lỗi khởi tạo Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();
const CSV_PATH = 'D:\\Tool\\2.BBSC\\Tool BBSC HD LIVE v1.0 - Incident_List.csv';

async function seedMasterData() {
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  
  const results = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = results.data;
  
  const csvSuppliers = new Set();
  const csvDepts = new Set();
  const csvIncidents = new Set();
  const csvClasses = new Set();
  const csvUnits = new Set();

  rows.forEach(row => {
    try {
      const payload = JSON.parse(row.DATA_PAYLOAD);
      const h = payload.header || {};
      if (h.supplier?.trim()) csvSuppliers.add(h.supplier.trim());
      if (h.dept?.trim()) csvDepts.add(h.dept.trim());
      if (h.incident_type?.trim()) csvIncidents.add(h.incident_type.trim());
      if (h.classification?.trim()) csvClasses.add(h.classification.trim());
      
      const rawItems = payload.items || [];
      rawItems.forEach(it => {
        if (it.uom?.trim()) csvUnits.add(it.uom.trim());
      });
    } catch(e) {
      // skip
    }
  });

  console.log(`Found in CSV:`);
  console.log(`- ${csvSuppliers.size} Suppliers`);
  console.log(`- ${csvDepts.size} Depts`);
  console.log(`- ${csvIncidents.size} Incident Types`);
  console.log(`- ${csvClasses.size} Classifications`);
  console.log(`- ${csvUnits.size} Units`);

  const mdSnap = await db.collection('master_data').get();
  
  // Create a map to quickly update statuses if they are hidden
  const existingMaster = new Map(); // key: "group|key", value: docId
  const inactiveDocs = [];
  
  mdSnap.docs.forEach(d => {
    const data = d.data();
    if (data.group && data.key) {
      existingMaster.set(`${data.group}|${data.key}`, d.id);
      if (data.isActive === false) {
        inactiveDocs.push(d.id);
      }
    }
  });

  const toAdd = [];
  Array.from(csvSuppliers).forEach(v => { if (!existingMaster.has(`supplier|${v}`)) toAdd.push({group: 'supplier', key: v}); else inactiveDocs.push(existingMaster.get(`supplier|${v}`)); });
  Array.from(csvDepts).forEach(v => { if (!existingMaster.has(`dept|${v}`)) toAdd.push({group: 'dept', key: v}); else inactiveDocs.push(existingMaster.get(`dept|${v}`)); });
  Array.from(csvIncidents).forEach(v => { if (!existingMaster.has(`incident_type|${v}`)) toAdd.push({group: 'incident_type', key: v}); else inactiveDocs.push(existingMaster.get(`incident_type|${v}`)); });
  Array.from(csvClasses).forEach(v => { if (!existingMaster.has(`classification|${v}`)) toAdd.push({group: 'classification', key: v}); else inactiveDocs.push(existingMaster.get(`classification|${v}`)); });
  Array.from(csvUnits).forEach(v => { if (!existingMaster.has(`unit|${v}`)) toAdd.push({group: 'unit', key: v}); else inactiveDocs.push(existingMaster.get(`unit|${v}`)); });

  const batch = db.batch();
  let ops = 0;

  console.log(`Activating ${inactiveDocs.length} existing items...`);
  // Un-hide all inactive documents that are needed
  for (const docId of Array.from(new Set(inactiveDocs))) {
      batch.update(db.collection('master_data').doc(docId), { isActive: true });
      ops++;
  }

  console.log(`Adding ${toAdd.length} NEW master data items...`);
  // Add new items
  for (const item of toAdd) {
     const ref = db.collection('master_data').doc();
     batch.set(ref, {
         group: item.group,
         key: item.key,
         value: item.key,
         order: 99,
         isActive: true,
         createdAt: admin.firestore.FieldValue.serverTimestamp()
     });
     ops++;
  }

  if (ops > 0) {
    await batch.commit();
    console.log(`Done! Committed ${ops} operations.`);
  } else {
    console.log(`Done! Nothing to update.`);
  }
}

seedMasterData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
