const admin = require('firebase-admin');
const path = require('path');

// 1. Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 2. Data from User (INCIDENT_TYPE list)
const incidentTypes = [
  { group: 'incident_type', key: 'Không đạt Cảm quan', value: 'Không đạt Cảm quan', order: 1 },
  { group: 'incident_type', key: 'Vượt Nhiệt độ', value: 'Vượt Nhiệt độ', order: 2 },
  { group: 'incident_type', key: 'Sai khác AW', value: 'Sai khác AW', order: 3 },
  { group: 'incident_type', key: 'Sai chứng từ', value: 'Sai chứng từ', order: 4 },
  { group: 'incident_type', key: 'Sai số lượng', value: 'Sai số lượng', order: 5 },
];

async function updateIncidentTypes() {
  console.log('🚀 Đang cập nhật Danh mục Loại sự cố (INCIDENT_TYPE) lên Firebase...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();

  // Clean old types
  const existing = await colRef.where('group', '==', 'incident_type').get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new ones
  incidentTypes.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log(`✅ Đã cập nhật xong ${incidentTypes.length} Loại sự cố!`);
}

updateIncidentTypes().catch(err => console.error('Lỗi:', err.message));
