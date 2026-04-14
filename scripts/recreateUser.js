const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function recreateUser() {
  const email = 'khoilm@bbsc.com';
  const password = '123456';
  
  try {
    // Try to delete first (to clear any weird state)
    try {
      const oldUser = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(oldUser.uid);
      console.log(`Deleted existing user ${email}`);
    } catch (e) {
        // user might not exist
    }

    // Create fresh
    const newUser = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: 'Mr. Khôi'
    });
    
    // Add profile back to Firestore
    await admin.firestore().collection('users').doc(newUser.uid).set({
      email: email,
      displayName: 'Mr. Khôi',
      role: 'admin',
      dept: 'Kho Nhập',
      status: 'active'
    });

    console.log(`Successfully RE-CREATED user ${email} with password: ${password}`);
  } catch (error) {
    console.error('Error re-creating user:', error);
  }
}

recreateUser().catch(console.error);
