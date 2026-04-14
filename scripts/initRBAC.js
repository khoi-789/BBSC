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

// Match exactly with src/lib/services/rbac.ts
const COL = 'rbac_config'; 
const roles = ['QA', 'Bộ phận khác']; // Specific roles used in BBSC logic
const statuses = ['Khởi tạo', 'Đang xử lý', 'Hoàn tất', 'Hủy', 'Chờ hết INV', 'Chờ xác nhận'];
const fields = [
  'createdDate', 'supplier', 'classification', 'incidentType', 
  'invoiceNo', 'dept', 'pic', 'subPic', 'tags', 'status', 
  'completedDate', 'note', 'items', 'investigation', 'immediateAction'
];

async function initRBAC() {
  console.log('🚀 Đang khôi phục cấu hình Phân quyền (RBAC)...');
  
  const batch = db.batch();
  const colRef = db.collection(COL);

  for (const role of roles) {
    const docRef = colRef.doc(role);
    
    // Structure: { fields: { [fieldKey]: { isRequired, statusPermissions: { [status]: boolean } } } }
    const fieldData = {};
    fields.forEach(field => {
      fieldData[field] = {
        isRequired: ['createdDate', 'supplier', 'incidentType', 'status'].includes(field),
        statusPermissions: {}
      };
      
      statuses.forEach(status => {
        // Default: can edit in 'Khởi tạo'
        fieldData[field].statusPermissions[status] = (status === 'Khởi tạo');
      });
    });

    batch.set(docRef, {
      fields: fieldData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // Also init global_fields if needed
  const globalRef = colRef.doc('global_fields');
  const globalData = {};
  fields.forEach(f => globalData[f] = ['createdDate', 'supplier', 'incidentType', 'status'].includes(f));
  batch.set(globalRef, globalData);

  await batch.commit();
  console.log('✅ Khôi phục RBAC thành công!');
}

initRBAC().catch(err => console.error('Lỗi khôi phục RBAC:', err));
