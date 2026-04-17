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

async function fixPicsCaseInsensitive() {
  const picMap = new Map();
  
  const usersSnap = await db.collection('users').get();
  usersSnap.forEach(d => {
    const u = d.data();
    const picKey = u.linkedPic || u.displayName;
    if (picKey) {
       picMap.set(picKey.toLowerCase().trim(), picKey);
    }
  });

  console.log(`Loaded ${picMap.size} user PIC keys.`);

  const reportsSnap = await db.collection('bbsc_reports').where('isDeleted', '==', false).get();
  console.log(`Checking ${reportsSnap.size} reports...`);

  const batch = db.batch();
  let ops = 0;

  reportsSnap.forEach(d => {
    const report = d.data();
    let updated = false;
    let newPic = report.header.pic;
    let newSubPic = report.header.subPic;

    if (report.header.pic) {
      const lower = report.header.pic.toLowerCase().trim();
      if (picMap.has(lower)) {
        const correctCase = picMap.get(lower);
        if (correctCase !== report.header.pic) {
          newPic = correctCase;
          updated = true;
        }
      }
    }

    if (report.header.subPic) {
      const lower = report.header.subPic.toLowerCase().trim();
      if (picMap.has(lower)) {
        const correctCase = picMap.get(lower);
        if (correctCase !== report.header.subPic) {
          newSubPic = correctCase;
          updated = true;
        }
      }
    }

    if (updated) {
      batch.update(d.ref, {
        'header.pic': newPic,
        'header.subPic': newSubPic
      });
      ops++;
    }
  });

  if (ops > 0) {
    if (ops > 500) {
        // Simple batch if we have many! batch is max 500
        console.log(`Found ${ops} to update, doing the first 450 max. If you see this, run again!`);
    } else {
        await batch.commit();
        console.log(`Successfully fixed casing for ${ops} reports to exactly match users DB!`);
    }
  } else {
    console.log(`All reports already mapped perfectly!`);
  }
}

fixPicsCaseInsensitive().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
