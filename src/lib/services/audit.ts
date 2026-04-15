import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AuditLog, AuditAction } from '@/types';

const COL = 'audit_logs';

export async function writeAuditLog(params: {
  reportId: string;
  reportNo: string;
  action: AuditAction;
  performedBy: string;
  performedByName: string;
  changes?: object;
}): Promise<void> {
  try {
    await addDoc(collection(db, COL), {
      ...params,
      timestamp: Timestamp.now(),
    });
  } catch (e) {
    // Non-blocking: log error but don't throw
    console.error('[AuditLog] Failed to write:', e);
  }
}

export async function getAuditLogs(reportId: string): Promise<AuditLog[]> {
  const q = query(
    collection(db, COL),
    where('reportId', '==', reportId)
    // No orderBy here — avoids composite index requirement.
    // Sorting is done client-side after fetch.
  );
  const snap = await getDocs(q);
  const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
  // Sort ascending by timestamp client-side
  return logs.sort((a, b) => {
    const ta = (a.timestamp as { seconds?: number })?.seconds ?? 0;
    const tb = (b.timestamp as { seconds?: number })?.seconds ?? 0;
    return ta - tb;
  });
}
