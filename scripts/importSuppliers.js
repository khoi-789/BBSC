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

// 2. Data from User (SUPPLIER list)
const rawData = `SUPPLIER	ABBOTT	ABBOTT
SUPPLIER	ALLEVIARE	ALLEVIARE
SUPPLIER	ASCENCIA	ASCENSIA
SUPPLIER	ASTRAZENECA	ASTRAZENECA
SUPPLIER	BESIN	BESIN
SUPPLIER	BIOTRONIK	BIOTRONIK
SUPPLIER	CPC1	CPC1
SUPPLIER	DANONE	DANONE
SUPPLIER	DAVIPHARM	DAVIPHARM
SUPPLIER	DKSH	DKSH
SUPPLIER	Dr.Reddy's	Dr.Reddy's
SUPPLIER	ELOVI	ELOVI
SUPPLIER	GETZ	GETZ
SUPPLIER	HAPHARCO	HAPHARCO
SUPPLIER	HETERO	HETERO
SUPPLIER	HOE	HOE
SUPPLIER	HYPHENS	HYPHENS
SUPPLIER	IMEXPHARM	IMEXPHARM
SUPPLIER	J&J	J&J
SUPPLIER	LUYE	LUYE
SUPPLIER	MAYOLY	MAYOLY
SUPPLIER	MEGA (MAXXCARE)	MEGA (MAXXCARE)
SUPPLIER	NOVARTIS	NOVARTIS
SUPPLIER	NUMED	NUMED
SUPPLIER	ORIENT	ORIENT
SUPPLIER	PARADIGM	PARADIGM
SUPPLIER	ROHTO	ROHTO
SUPPLIER	RXILIENT	RXILIENT
SUPPLIER	SANDOZ	SANDOZ
SUPPLIER	SANG	SANG
SUPPLIER	SANOFI	SANOFI
SUPPLIER	SIV	SIV
SUPPLIER	TORRENT	TORRENT
SUPPLIER	TRƯỜNG SƠN	TRƯỜNG SƠN
SUPPLIER	UNITED	UNITED
SUPPLIER	VE PHARMA	VE PHARMA
SUPPLIER	VIATRIS	VIATRIS
SUPPLIER	WW	WW
SUPPLIER	YHV	YHV
SUPPLIER	NA	NA`;

const suppliers = rawData.split('\n').map((line, idx) => {
  const parts = line.split('\t');
  return {
    group: 'supplier',
    key: parts[1],
    value: parts[2],
    order: idx + 1
  };
});

async function updateSuppliers() {
  console.log('🚀 Đang cập nhật Danh mục Nhà cung cấp (SUPPLIER) lên Firebase...');
  
  const colRef = db.collection('master_data');
  const batch = db.batch();

  // Clean old suppliers
  const existing = await colRef.where('group', '==', 'supplier').get();
  existing.forEach(doc => batch.delete(doc.ref));

  // Add new ones
  suppliers.forEach(item => {
    const docRef = colRef.doc();
    batch.set(docRef, {
      ...item,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log(`✅ Đã cập nhật xong ${suppliers.length} Nhà cung cấp!`);
}

updateSuppliers().catch(err => console.error('Lỗi:', err.message));
