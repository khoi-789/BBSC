import {
  collection, doc, query, where, orderBy, limit,
  getDocs, getDoc, addDoc, updateDoc, Timestamp, runTransaction,
  startAfter, QueryDocumentSnapshot
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

// ---- READ: Get reports list (Simplified to avoid Index errors) ----
export async function getReports(): Promise<BBSCReport[]> {
  const q = query(
    collection(db, COL),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BBSCReport));
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

  const payload: Omit<BBSCReport, 'id'> = {
    ...data,
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

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists()) throw new Error('Báo cáo không tồn tại.');

    const old = snap.data() as BBSCReport;
    const now = Timestamp.now();
    let updatedReportId = old.reportId;

    // Check if createdDate changed, and if so, re-verify ID
    if (data.header?.createdDate && data.header.createdDate !== old.header.createdDate) {
      const oldYear = format(new Date(old.header.createdDate), 'yyyy');
      const newYear = format(new Date(data.header.createdDate), 'yyyy');
      const mm      = format(new Date(data.header.createdDate), 'MM');
      const yy      = format(new Date(data.header.createdDate), 'yy');

      if (oldYear !== newYear) {
        // Different year -> Get a new seq in the new year
        updatedReportId = await generateReportNo(data.header.createdDate);
      } else {
        // Same year -> Just update mmyy, keep xxxx
        const { seq } = parseYearAndSeq(old.reportId);
        const xxxx = String(seq).padStart(4, '0');
        updatedReportId = `BBSC-${xxxx}-${mm}${yy}`;
      }
    }

    tx.update(docRef, {
      ...data,
      reportId: updatedReportId,
      updatedAt: now,
      updatedBy: uid,
      updatedByName: userName,
      reasonForChange: reason || '',
    });

    await writeAuditLog({
      reportId: id,
      reportNo: old.reportId,
      action: old.header?.status !== data.header?.status ? 'STATUS_CHANGED' : 'UPDATED',
      performedBy: uid,
      performedByName: userName,
      changes: { old, new: data, reason },
    });
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
