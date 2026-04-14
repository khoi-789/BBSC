const admin = require('firebase-admin');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '../.env.local' });

// ==========================================
// 1. CẤU HÌNH FIREBASE ADMIN
// ==========================================
// Bạn phải tải file serviceAccountKey.json từ:
// Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
// và lưu vào thư mục scripts/ này
const serviceAccountPath = './serviceAccountKey.json';

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\n[LỖI]: Không tìm thấy serviceAccountKey.json.');
  console.log('Bạn cần tải nó từ Firebase Console -> Project Settings -> Service Accounts -> Generate new private key');
  console.log('Sau đó lưu vào d:/Tool/2.BBSC/bbsc-app/scripts/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// ==========================================
// 2. DỮ LIỆU MẪU MASTER DATA
// ==========================================
const masterDataInitial = [
  { group: 'dept', key: 'QA', value: 'Quản lý chất lượng', order: 1 },
  { group: 'dept', key: 'WH', value: 'Kho vận', order: 2 },
  { group: 'dept', key: 'PROD', value: 'Sản xuất', order: 3 },
  { group: 'incident_type', key: 'HANG_HONG', value: 'Hàng hỏng vỡ', order: 1 },
  { group: 'incident_type', key: 'THIEU_HANG', value: 'Thiếu hàng', order: 2 },
  { group: 'incident_type', key: 'SAI_TEM', value: 'Sai tem nhãn', order: 3 },
  { group: 'supplier', key: 'NCC_A', value: 'Công ty Cổ phần A', order: 1 },
  { group: 'pic', key: 'PIC_QA01', value: 'Nguyễn Văn QA', order: 1 }
];

async function setupSystem() {
  console.log('🚀 Bắt đầu thiết lập hệ thống BBSC...');

  try {
    // ----------------------------------------
    // TẠO MASTER DATA
    // ----------------------------------------
    console.log('\n📦 Đang tạo Master Data...');
    const masterRef = db.collection('master_data');
    
    // Kiểm tra xem đã có data chưa
    const existing = await masterRef.limit(1).get();
    if (existing.empty) {
      let count = 0;
      for (const item of masterDataInitial) {
        await masterRef.add({ ...item, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        count++;
      }
      console.log(`✅ Đã thêm ${count} cấu hình mẫu.`);
    } else {
      console.log('ℹ️ Master data đã tồn tại, bỏ qua tạo mới.');
    }

    // ----------------------------------------
    // TẠO ADMIN USER
    // ----------------------------------------
    console.log('\n👤 Đang thiết lập tài khoản Admin...');
    const adminEmail = 'admin@bbsc.com';
    const adminPassword = 'Password123!';
    let adminRecord;

    try {
      adminRecord = await auth.getUserByEmail(adminEmail);
      console.log(`ℹ️ Admin user (${adminEmail}) đã tồn tại.`);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        adminRecord = await auth.createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: 'System Admin',
        });
        console.log(`✅ Đã tạo tài khoản Auth Admin: ${adminEmail} / ${adminPassword}`);
      } else {
        throw e;
      }
    }

    // Ghi vào collection 'users' để app nhận diện Role
    await db.collection('users').doc(adminRecord.uid).set({
      uid: adminRecord.uid,
      email: adminEmail,
      displayName: 'System Admin',
      department: 'IT',
      role: 'Admin',    // Role cao nhất
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`✅ Đã cấp quyền Admin cho ${adminEmail} trong Firestore.`);

    console.log('\n🎉 THIẾT LẬP HOÀN TẤT!');
    console.log(`👉 Bạn có thể đăng nhập bằng: ${adminEmail} / ${adminPassword}`);

  } catch (error) {
    console.error('\n❌ Lỗi trong quá trình thiết lập:', error);
  } finally {
    process.exit(0);
  }
}

setupSystem();
