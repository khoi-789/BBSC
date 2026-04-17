import {
  collection, doc, query, where, orderBy,
  getDocs, getDoc, addDoc, updateDoc, Timestamp, runTransaction,
  startAfter, QueryDocumentSnapshot, or, getCountFromServer
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BBSCReport, FilterState, ReportStatus } from '@/types';
import { writeAuditLog } from './audit';
import { format } from 'date-fns';

const COL = 'bbsc_reports';
const SETTINGS_COL = 'app_settings';

// ---- Generate report ID: BBSC-xxxx-mmyy (xxxx resets yearly) ----
async function generateReportNo(dateStr: string): Promise<string> {
  const date = new Date(dateStr);
  const year = format(date, 'yyyy');
  const mm   = format(date, 'MM');
  const yy   = format(date, 'yy');
  
  const counterRef = doc(db, SETTINGS_COL, `counter_year_${year}`);
  
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let nextSeq = 1;
    if (snap.exists()) {
      nextSeq = (snap.data().lastSeq || 0) + 1;
    }
    tx.set(counterRef, { lastSeq: nextSeq }, { merge: true });
    
    const xxxx = String(nextSeq).padStart(4, '0');
    return `BBSC-${xxxx}-${mm}${yy}`;
  });
}

function parseYearAndSeq(reportNo: string): { seq: number, mmyy: string } {
  const parts = reportNo.split('-');
  return {
    seq: parseInt(parts[1] || '0', 10),
    mmyy: parts[2] || '',
  };
}

// ---- READ: Get Active Reports (Real-time) ----
import { onSnapshot, limit } from 'firebase/firestore';

export function subscribeToActiveReports(callback: (reports: BBSCReport[]) => void): () => void {
  // To avoid requiring a composite index immediately, we query by status
  // and sort/filter the rest on the client side since the active set is small (< 300).
  const q = query(
    collection(db, COL),
    where('header.status', 'in', ['Khởi tạo', 'Đang xử lý', 'Chờ xác nhận', 'Chờ hết INV'])
  );

  return onSnapshot(q, (snap) => {
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BBSCReport));
    // Client-side filter for isDeleted
    docs = docs.filter(r => !r.isDeleted);
    // Client-side sort by createdAt desc
    docs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    callback(docs);
  });
}

// ---- READ: Get Reports (Unified Paginated Fetcher) ----
export async function getReports(
  filters: { 
    dept?: string; 
    supplier?: string;
    class?: string;
    type?: string;
    tag?: string;
    status?: string | string[];
    // Smart Search
    reportId?: string;
    itemCode?: string;
    lotNumber?: string;
    itemName?: string;
    globalItemSearch?: string;
  }, 
  lastVisible?: any, 
  pageSize = 25
): Promise<{
  data: BBSCReport[],
  lastVisible: any,
  indexError?: string
}> {
  try {
    let queryConstraints: any[] = [
      where('isDeleted', '==', false)
    ];

    // 1. Partial Report ID Search (Range Query)
    if (filters.reportId && filters.reportId.length > 0) {
      const term = filters.reportId.trim().toUpperCase();
      // Use string range query for partial matches (e.g. "0162" -> "BBSC-0162...")
      // If user typed '0162', we want to match BBSC-0162...
      // Since report IDs always start with BBSC-, if term doesn't start with BBSC-, we prepend it for the range query to work properly, or we just rely on the user input.
      const searchPrefix = term.startsWith('BBSC-') ? term : `BBSC-${term}`;
      
      queryConstraints.push(
        where('reportId', '>=', searchPrefix),
        where('reportId', '<=', searchPrefix + '\uf8ff')
      );
      // When using inequality operator, we cannot use other inequality or orderBy on different fields easily without composite indexes.
      // So we return early for ID searches just like before, but now supporting partials.
      const q = query(collection(db, COL), ...queryConstraints, limit(pageSize));
      const snap = await getDocs(q);
      return { data: snap.docs.map(d => ({ id: d.id, ...d.data() } as BBSCReport)), lastVisible: null };
    }

    // 2. Priority 2: Smart Search via Array-Contains (Fast & Cheap)
    if (filters.globalItemSearch) {
      const term = filters.globalItemSearch.trim();
      queryConstraints.push(
        or(
          where('itemNames', 'array-contains', term),
          where('lotNumbers', 'array-contains', term)
        )
      );
    } else if (filters.itemCode) {
      queryConstraints.push(where('itemCodes', 'array-contains', filters.itemCode));
    } else if (filters.lotNumber) {
      queryConstraints.push(where('lotNumbers', 'array-contains', filters.lotNumber));
    } else if (filters.itemName) {
      queryConstraints.push(where('itemNames', 'array-contains', filters.itemName));
    }

    // 3. Regular Filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        queryConstraints.push(where('header.status', 'in', filters.status));
      } else {
        queryConstraints.push(where('header.status', '==', filters.status));
      }
    }

    if (filters.dept) queryConstraints.push(where('header.dept', '==', filters.dept));
    if (filters.supplier) queryConstraints.push(where('header.supplier', '==', filters.supplier));
    if (filters.class) queryConstraints.push(where('header.classification', '==', filters.class));
    if (filters.type) queryConstraints.push(where('header.incidentType', '==', filters.type));
    if (filters.tag) queryConstraints.push(where('header.tags', '==', filters.tag));

    // Order and Page
    // Only order by createdAt if we aren't doing complex equality queries that would require endless exact-match composite indices.
    // If status is filtered, we sort by status.
    if (filters.status) {
      queryConstraints.push(orderBy('header.status', 'asc')); 
    }
    // To allow arbitrary filters (like supplier, type, etc) without creating 20+ composite indexes, 
    // we omit the server-side createdAt orderBy when using those filters. 
    // We will rely on NextJS/React client-side sorting since the active set per filter is small enough, 
    // OR we just accept standard index behavior but remove `createdAt` to rely on auto-index for equality matches.
    const hasComplexFilters = filters.dept || filters.supplier || filters.class || filters.type || filters.tag;
    
    if (!hasComplexFilters) {
       queryConstraints.push(orderBy('createdAt', 'desc'));
    }
    
    if (lastVisible) {
      queryConstraints.push(startAfter(lastVisible));
    }
    queryConstraints.push(limit(pageSize));

    const q = query(collection(db, COL), ...queryConstraints);
    const snap = await getDocs(q);
    
    return {
      data: snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BBSCReport)),
      lastVisible: snap.docs[snap.docs.length - 1]
    };
  } catch (err: any) {
    console.error('getReports Error:', err);
    if (err.message?.includes('index')) {
      return { data: [], lastVisible: null, indexError: err.message };
    }
    throw err;
  }
}
// ---- READ: Get Reports Count (Cheap: 1 read per 1000 docs) ----
export async function getReportsCount(
  filters: { 
    dept?: string; 
    supplier?: string;
    class?: string;
    type?: string;
    tag?: string;
    status?: string | string[];
    reportId?: string;
    itemCode?: string;
    lotNumber?: string;
    itemName?: string;
    globalItemSearch?: string;
  }
): Promise<number> {
  try {
    let queryConstraints: any[] = [
      where('isDeleted', '==', false)
    ];

    if (filters.reportId && filters.reportId.length > 0) {
      const term = filters.reportId.trim().toUpperCase();
      const searchPrefix = term.startsWith('BBSC-') ? term : `BBSC-${term}`;
      const q = query(
        collection(db, COL), 
        where('isDeleted', '==', false),
        where('reportId', '>=', searchPrefix),
        where('reportId', '<=', searchPrefix + '\uf8ff')
      );
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }

    if (filters.globalItemSearch) {
      const term = filters.globalItemSearch.trim();
      queryConstraints.push(
        or(
          where('itemNames', 'array-contains', term),
          where('lotNumbers', 'array-contains', term)
        )
      );
    } else if (filters.itemCode) {
      queryConstraints.push(where('itemCodes', 'array-contains', filters.itemCode));
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        queryConstraints.push(where('header.status', 'in', filters.status));
      } else {
        queryConstraints.push(where('header.status', '==', filters.status));
      }
    }

    if (filters.dept) queryConstraints.push(where('header.dept', '==', filters.dept));
    if (filters.supplier) queryConstraints.push(where('header.supplier', '==', filters.supplier));
    if (filters.class) queryConstraints.push(where('header.classification', '==', filters.class));
    if (filters.type) queryConstraints.push(where('header.incidentType', '==', filters.type));
    if (filters.tag) queryConstraints.push(where('header.tags', '==', filters.tag));

    const q = query(collection(db, COL), ...queryConstraints);
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.error('getReportsCount Error:', err);
    return 0;
  }
}

// Legacy, keeping it safe for compatibility if needed elsewhere briefly
export async function getReportsLegacy(): Promise<BBSCReport[]> {
  const q = query(
    collection(db, COL),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BBSCReport));
}

// ---- INTERNAL: Prepare Search Indices ----
function prepareSearchIndices(report: Partial<BBSCReport>) {
  if (!report.items) return {};
  return {
    itemCodes: Array.from(new Set(report.items.map(i => i.itemCode).filter(Boolean))),
    lotNumbers: Array.from(new Set(report.items.map(i => i.batchNo).filter(Boolean))),
    itemNames: Array.from(new Set(report.items.map(i => i.itemName).filter(Boolean)))
  };
}

// ---- READ: Single report ----
export async function getReport(id: string): Promise<BBSCReport | null> {
  const docSnap = await getDoc(doc(db, COL, id));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as BBSCReport;
}

// ---- CREATE ----
export async function createReport(
  data: Omit<BBSCReport, 'id' | 'reportId' | 'createdAt' | 'updatedAt' | 'isDeleted'>,
  uid: string,
  userName: string
): Promise<string> {
  const reportId = await generateReportNo(data.header.createdDate);
  const now = Timestamp.now();
  const searchIndices = prepareSearchIndices(data);

  const payload: Omit<BBSCReport, 'id'> = {
    ...data,
    ...searchIndices,
    reportId,
    isDeleted: false,
    createdBy: uid,
    createdByName: userName,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(db, COL), payload);

  await writeAuditLog({
    reportId: docRef.id,
    reportNo: reportId,
    action: 'CREATED',
    performedBy: uid,
    performedByName: userName,
    changes: { new: payload },
  });

  return docRef.id;
}

// ---- UPDATE (transaction for optimistic safety) ----
export async function updateReport(
  id: string,
  data: Partial<BBSCReport>,
  uid: string,
  userName: string,
  reason?: string
): Promise<void> {
  const docRef = doc(db, COL, id);

  // Read current state first (outside transaction for audit log)
  const currentSnap = await getDoc(docRef);
  if (!currentSnap.exists()) throw new Error('Báo cáo không tồn tại.');
  const old = currentSnap.data() as BBSCReport;

  const now = Timestamp.now();
  let updatedReportId = old.reportId;

  // Check if createdDate changed, and if so, re-verify ID
  if (data.header?.createdDate && data.header.createdDate !== old.header.createdDate) {
    const oldYear = format(new Date(old.header.createdDate), 'yyyy');
    const newYear = format(new Date(data.header.createdDate), 'yyyy');
    const mm      = format(new Date(data.header.createdDate), 'MM');
    const yy      = format(new Date(data.header.createdDate), 'yy');

    if (oldYear !== newYear) {
      updatedReportId = await generateReportNo(data.header.createdDate);
    } else {
      const { seq } = parseYearAndSeq(old.reportId);
      const xxxx = String(seq).padStart(4, '0');
      updatedReportId = `BBSC-${xxxx}-${mm}${yy}`;
    }
  }

  const searchIndices = data.items ? prepareSearchIndices(data) : {};

  // Update the document (simple updateDoc, no transaction needed)
  await updateDoc(docRef, {
    ...data,
    ...searchIndices,
    reportId: updatedReportId,
    updatedAt: now,
    updatedBy: uid,
    updatedByName: userName,
    reasonForChange: reason || '',
  });

  // Write audit log AFTER the update (non-blocking, won't affect the update)
  await writeAuditLog({
    reportId: id,
    reportNo: old.reportId,
    action: old.header?.status !== data.header?.status ? 'STATUS_CHANGED' : 'UPDATED',
    performedBy: uid,
    performedByName: userName,
    changes: { old, new: data, reason },
  });
}

// ---- SOFT DELETE ----
export async function softDeleteReport(
  id: string,
  uid: string,
  userName: string,
  reason: string
): Promise<void> {
  const docRef = doc(db, COL, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Báo cáo không tồn tại.');

  const old = snap.data() as BBSCReport;

  await updateDoc(docRef, {
    isDeleted: true,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
    updatedByName: userName,
    reasonForChange: reason,
  });

  await writeAuditLog({
    reportId: id,
    reportNo: old.reportId,
    action: 'DELETED',
    performedBy: uid,
    performedByName: userName,
    changes: { reason },
  });
}

// ---- STATUS CHANGE (approve/reject shorthand) ----
export async function changeReportStatus(
  id: string,
  newStatus: ReportStatus,
  uid: string,
  userName: string,
  reason?: string
): Promise<void> {
  const docRef = doc(db, COL, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Báo cáo không tồn tại.');

  const old = snap.data() as BBSCReport;
  const now = Timestamp.now();

  await updateDoc(docRef, {
    'header.status': newStatus,
    updatedAt: now,
    updatedBy: uid,
    updatedByName: userName,
    reasonForChange: reason || '',
  });

  await writeAuditLog({
    reportId: id,
    reportNo: old.reportId,
    action: 'STATUS_CHANGED',
    performedBy: uid,
    performedByName: userName,
    changes: {
      old: { header: old.header },
      new: { header: { ...old.header, status: newStatus } },
      reason,
    },
  });
}
