const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkIds() {
  const targetId = 'BBSC-0125-0326';
  const targetUUID = 'cb641747-379c-4758-ac2a-cef3c963fa7b';
  
  console.log(`Checking reports with ID: ${targetId}`);
  const snap = await db.collection('bbsc_reports').where('reportId', '==', targetId).get();
  console.log(`Found ${snap.size} documents by reportId.`);

  const allActive = await db.collection('bbsc_reports').where('isDeleted', '==', false).count().get();
  console.log(`Total ACTIVE in DB: ${allActive.data().count}`);
  
  const allDeleted = await db.collection('bbsc_reports').where('isDeleted', '==', true).count().get();
  console.log(`Total DELETED in DB: ${allDeleted.data().count}`);

  console.log(`\nChecking reports with UUID: ${targetUUID}`);
  const snapUUID = await db.collection('bbsc_reports').doc(targetUUID).get();
  if (snapUUID.exists) {
    console.log(`Found doc by UUID!`);
    const data = snapUUID.data();
    console.log(`  reportId: ${data.reportId}`);
    console.log(`  isDeleted: ${data.isDeleted}`);
  } else {
    console.log(`Not found by UUID either.`);
  }
  
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Doc ID: ${doc.id}`);
    console.log(`  isDeleted: ${data.isDeleted}`);
    console.log(`  lastUpdated: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'N/A'}`);
    console.log(`  createdBy: ${data.createdBy}`);
  });

  console.log('\nFetching top 100 overall to check sample distribution...');
  const activeSnap = await db.collection('bbsc_reports')
    .limit(100)
    .get();
  
  const sorted = activeSnap.docs
    .map(d => ({id: d.id, ...d.data()}))
    .filter(d => !d.isDeleted)
    .sort((a, b) => b.reportId.localeCompare(a.reportId))
    .slice(0, 10);

  console.log('\nTop 10 ACTIVE reports (from 100 sample, desc by reportId):');
  sorted.forEach(d => {
    console.log(`${d.reportId}`);
  });
}

checkIds().catch(console.error);
