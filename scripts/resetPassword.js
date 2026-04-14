const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function resetPassword() {
  const email = 'khoilm@bbsc.com';
  const newPassword = '123456'; // Default password for recovery
  
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, {
      password: newPassword
    });
    console.log(`Successfully reset password for ${email} to: ${newPassword}`);
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

resetPassword().catch(console.error);
