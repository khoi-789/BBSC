const admin = require('firebase-admin');
const fs = require('path');
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
const auth = admin.auth();

async function createAdmin() {
  const email = 'leminhkhoi780789@gmail.com';
  const password = '764222';
  const displayName = 'Mr. Khôi (Admin)';

  console.log(`🚀 Đang thiết lập tài khoản Admin cho: ${email}...`);

  try {
    let user;
    try {
      user = await auth.getUserByEmail(email);
      console.log('ℹ️ Tài khoản đã tồn tại trong Auth.');
      // Update password just in case
      await auth.updateUser(user.uid, { password });
    } catch (e) {
      user = await auth.createUser({
        email,
        password,
        displayName
      });
      console.log('✅ Đã tạo tài khoản Auth mới thành công.');
    }

    // Assign Admin role in 'users' collection
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: email,
      displayName: displayName,
      role: 'Admin', // Quyền cao nhất
      department: 'QA',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('✅ Đã cấp quyền Admin tối cao trong Firestore.');
    console.log('🎉 XONG! Bạn có thể đăng nhập ngay bây giờ.');

  } catch (err) {
    console.error('❌ Lỗi thiết lập Admin:', err.message);
  }
}

createAdmin();
