'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import {
  collection, doc, writeBatch, Timestamp, getDocs,
  query, where, setDoc, getDoc, addDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Trash2,
  Database, ArrowRight, RotateCcw, Info, UserPlus, Tag
} from 'lucide-react';

// ========================
// TYPE DEFINITIONS
// ========================
interface GasRow {
  UUID: string;
  INCIDENT_NO: string;
  DATE: string;
  STATUS: string;
  IS_DELETED: string;
  LAST_UPDATED: string;
  DATA_PAYLOAD: string;
}

interface ParsedReport {
  docId: string;
  reportId: string;
  createdDate: string;
  status: string;
  supplier: string;
  incidentType: string;
  pic: string;
  itemCount: number;
  historyCount: number;
}

// ========================
// HELPERS
// ========================
const STATUS_MAP: Record<string, string> = {
  'KHỞI TẠO': 'Khởi tạo',
  'ĐANG XỬ LÝ': 'Đang xử lý',
  'HOÀN TẤT': 'Hoàn tất',
  'HỦY': 'Hủy',
  'CHỜ HẾT INV': 'Chờ hết INV',
  'CHỜ XÁC NHẬN': 'Chờ xác nhận',
};

function normalizeStatus(s: string): string {
  const upper = (s || '').trim().toUpperCase();
  return STATUS_MAP[upper] || (s || '').trim();
}

function msToTimestamp(ms: number | string): Timestamp {
  const n = typeof ms === 'string' ? parseInt(ms, 10) : ms;
  return Timestamp.fromMillis(isNaN(n) ? Date.now() : n);
}

function transformRow(row: GasRow): object | null {
  try {
    const payload = JSON.parse(row.DATA_PAYLOAD);
    const h = payload.header || {};
    const sys = payload.system || {};
    const items = (payload.items || []).map((item: Record<string, unknown>, idx: number) => ({
      id: `item_${idx}`,
      itemCode: String(item.item_code || '').replace(/\t/g, '').trim(),
      itemName: String(item.product_name || '').trim(),
      batchNo: String(item.batch_no || '').trim(),
      expiryDate: String(item.expired_date || '').trim(),
      quantity: Number(item.quantity) || 0,
      unit: String(item.uom || '').trim(),
      issueType: String(item.problem_detail || '').trim(),
      note: String(item.item_action || '').trim(),
      lpn: String(item.lpn || '').trim(),
      asn: String(item.asn || '').trim(),
    }));

    const createdDate = (h.created_date || row.DATE || '').trim();
    const createdAtMs = sys.created_at || new Date(row.DATE || Date.now()).getTime();
    const updatedAtMs = sys.updated_at || new Date(row.LAST_UPDATED || Date.now()).getTime();

    return {
      reportId: row.INCIDENT_NO.trim(),
      header: {
        supplier: String(h.supplier || '').trim(),
        invoiceNo: String(h.invoice_no || '').trim(),
        incidentType: String(h.incident_type || '').trim(),
        dept: String(h.dept || '').trim(),
        pic: String(h.pic || '').trim(),
        subPic: String(h.sub_pic || '').trim(),
        tags: String(h.tags || '').trim(),
        note: String(h.note || '').trim(),
        classification: String(h.classification || '').trim(),
        createdDate,
        status: normalizeStatus(row.STATUS || h.status || 'Khởi tạo'),
        completedDate: String(h.completed_date || '').trim(),
        investigation: String(h.investigation || '').trim(),
        immediateAction: String(h.immediate_action || '').trim(),
      },
      items,
      tasks: [],
      attachments: [],
      isDeleted: false,
      createdBy: 'migration_tool',
      createdByName: String(sys.created_by || 'GAS Migration').trim(),
      createdAt: msToTimestamp(createdAtMs),
      updatedAt: msToTimestamp(updatedAtMs),
      updatedBy: 'migration_tool',
      updatedByName: String(sys.updated_by || 'GAS Migration').trim(),
      reasonForChange: 'Imported from GAS database',
    };
  } catch {
    return null;
  }
}

function buildAuditEntry(row: GasRow, versionNo: number, action: string): object | null {
  try {
    const payload = JSON.parse(row.DATA_PAYLOAD);
    const sys = payload.system || {};
    const updatedAtMs = sys.updated_at || new Date(row.LAST_UPDATED || Date.now()).getTime();
    const name = String(sys.updated_by || sys.created_by || 'GAS Migration').trim();

    return {
      reportId: row.UUID.trim(),
      reportNo: row.INCIDENT_NO.trim(),
      action: action,
      performedBy: 'migration_tool',
      performedByName: name,
      versionNo,
      changes: {
        snapshot: payload,
        reason: 'Imported from GAS history',
        isDeleted: row.IS_DELETED || '',
      },
      timestamp: msToTimestamp(updatedAtMs),
      source: 'gas_migration',
    };
  } catch {
    return null;
  }
}

// ========================
// MAIN COMPONENT
// ========================
type Step = 'upload' | 'preview' | 'confirm' | 'running' | 'done';

interface MigrationData {
  liveDoc: object;
  auditEntries: object[];
  preview: ParsedReport;
  uuid: string;
}

export default function MigrationPage() {
  const { profile } = useAuthStore();
  const router = useRouter();

  const [step, setStep] = useState<Step>('upload');
  const [migrationData, setMigrationData] = useState<MigrationData[]>([]);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [totalHistory, setTotalHistory] = useState(0);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Track new PICs & Tags that will be auto-created
  const [newPics, setNewPics] = useState<string[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);

  if (profile?.role !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={48} className="text-red-500" />
        <h2 className="text-2xl font-black text-red-600">Truy cập bị từ chối</h2>
        <p className="text-slate-500">Chỉ Admin mới có thể truy cập trang này.</p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary">Về trang chủ</button>
      </div>
    );
  }

  // ---- FILE DROP ----
  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setNewPics([]);
    setNewTags([]);

    Papa.parse<GasRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as GasRow[];

        // Group all rows by UUID
        const grouped = new Map<string, GasRow[]>();
        for (const row of rows) {
          if (!row.UUID?.trim()) continue;
          const uuid = row.UUID.trim();
          if (!grouped.has(uuid)) grouped.set(uuid, []);
          grouped.get(uuid)!.push(row);
        }

        let skip = 0;
        let totalHist = 0;
        const data: MigrationData[] = [];

        // Collect unique PICs and Tags from CSV
        const csvPics = new Set<string>();
        const csvTags = new Set<string>();

        grouped.forEach((rowGroup, uuid) => {
          // Sort by LAST_UPDATED ascending (oldest first)
          rowGroup.sort((a, b) => {
            const ta = new Date(a.LAST_UPDATED || 0).getTime();
            const tb = new Date(b.LAST_UPDATED || 0).getTime();
            return ta - tb;
          });

          // Find the live record (IS_DELETED = "")
          const liveRow = rowGroup.find(r => !r.IS_DELETED || r.IS_DELETED.trim() === '');
          if (!liveRow) { skip++; return; }

          const liveDoc = transformRow(liveRow);
          if (!liveDoc) { skip++; return; }

          // Collect PICs and Tags
          try {
            const payload = JSON.parse(liveRow.DATA_PAYLOAD);
            const h = payload.header || {};
            if (h.pic?.trim()) csvPics.add(h.pic.trim());
            if (h.sub_pic?.trim()) csvPics.add(h.sub_pic.trim());
            if (h.tags?.trim()) {
              h.tags.split(',').forEach((t: string) => { if (t.trim()) csvTags.add(t.trim()); });
            }
          } catch { /* skip */ }

          // Build audit entries for ALL rows (including live = last version)
          const auditEntries: object[] = [];
          rowGroup.forEach((row, idx) => {
            const isFirst = idx === 0;
            const action = isFirst ? 'CREATED' : 'UPDATED';
            const entry = buildAuditEntry(row, idx + 1, action);
            if (entry) {
              auditEntries.push(entry);
              if (!isFirst) totalHist++;
            }
          });

          const h = (liveDoc as Record<string, unknown>).header as Record<string, unknown>;
          const items = (liveDoc as Record<string, unknown>).items as unknown[];

          data.push({
            uuid,
            liveDoc,
            auditEntries,
            preview: {
              docId: uuid,
              reportId: liveRow.INCIDENT_NO.trim(),
              createdDate: liveRow.DATE,
              status: liveRow.STATUS,
              supplier: String(h?.supplier || ''),
              incidentType: String(h?.incidentType || ''),
              pic: String(h?.pic || ''),
              itemCount: items?.length || 0,
              historyCount: auditEntries.length,
            },
          });
        });

        // --- Compare with existing PICs in Firestore ---
        try {
          const usersSnap = await getDocs(query(collection(db, 'users'), where('isPic', '==', true)));
          const existingPics = new Set(usersSnap.docs.map(d => d.data().linkedPic as string).filter(Boolean));
          setNewPics(Array.from(csvPics).filter(p => !existingPics.has(p)));
        } catch { setNewPics([]); }

        // --- Compare with existing Tags in Firestore ---
        try {
          const tagsSnap = await getDocs(query(collection(db, 'master_data'), where('group', '==', 'tag')));
          const existingTags = new Set(tagsSnap.docs.map(d => d.data().key as string).filter(Boolean));
          setNewTags(Array.from(csvTags).filter(t => !existingTags.has(t)));
        } catch { setNewTags([]); }

        setTotalSkipped(skip);
        setTotalHistory(totalHist);
        setMigrationData(data);
        setStep('preview');
      },
      error: (err: Error) => setError(`Lỗi đọc CSV: ${err.message}`),
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  // ---- RUN MIGRATION ----
  const runMigration = async () => {
    setStep('running');
    setProgress(0);
    const logs: string[] = [];
    setLog([]);

    try {
      // Step 0: Auto-seed missing PICs and Tags
      if (newPics.length > 0) {
        logs.push(`👤 Đang tạo ${newPics.length} PIC mới chưa có trong hệ thống...`);
        setLog([...logs]);
        for (const picName of newPics) {
          await addDoc(collection(db, 'users'), {
            displayName: picName,
            linkedPic: picName,
            role: 'Staff',
            isPic: true,
            isActive: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          logs.push(`  ✅ Thêm PIC: ${picName}`);
        }
        setLog([...logs]);
      }

      if (newTags.length > 0) {
        logs.push(`🏷️ Đang tạo ${newTags.length} Tag mới chưa có trong hệ thống...`);
        setLog([...logs]);
        for (const tagName of newTags) {
          await addDoc(collection(db, 'master_data'), {
            group: 'tag',
            key: tagName,
            value: tagName,
            order: 99,
            isActive: true,
            createdAt: Timestamp.now(),
          });
          logs.push(`  ✅ Thêm Tag: ${tagName}`);
        }
        setLog([...logs]);
      }

      // Step 1: Clear existing demo reports
      logs.push('🔍 Đang xóa dữ liệu demo cũ...');
      setLog([...logs]);

      const existingSnap = await getDocs(
        query(collection(db, 'bbsc_reports'), where('isDeleted', '==', false))
      );
      const deleteBatch = writeBatch(db);
      existingSnap.docs.forEach(d => deleteBatch.delete(d.ref));
      if (!existingSnap.empty) {
        await deleteBatch.commit();
        logs.push(`🗑️ Đã xóa ${existingSnap.size} bản ghi cũ.`);
      } else {
        logs.push('ℹ️ Không có dữ liệu cũ.');
      }
      setLog([...logs]);

      // Step 2: Clear existing audit logs (from demo)
      logs.push('🔍 Đang xóa audit logs cũ...');
      setLog([...logs]);
      const auditSnap = await getDocs(collection(db, 'audit_logs'));
      if (!auditSnap.empty) {
        const BATCH_DEL = 400;
        for (let i = 0; i < auditSnap.docs.length; i += BATCH_DEL) {
          const b = writeBatch(db);
          auditSnap.docs.slice(i, i + BATCH_DEL).forEach(d => b.delete(d.ref));
          await b.commit();
        }
        logs.push(`🗑️ Đã xóa ${auditSnap.size} audit log cũ.`);
      }
      setLog([...logs]);

      // Step 3: Write main reports in batches
      const BATCH_SIZE = 300;
      let written = 0;
      for (let i = 0; i < migrationData.length; i += BATCH_SIZE) {
        const chunk = migrationData.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(({ uuid, liveDoc }) => {
          const ref = doc(collection(db, 'bbsc_reports'), uuid);
          batch.set(ref, liveDoc);
        });
        await batch.commit();
        written += chunk.length;
        setProgress(Math.round((written / migrationData.length) * 50));
        logs.push(`✅ Phiếu: ${written}/${migrationData.length}...`);
        setLog([...logs]);
      }

      // Step 4: Write audit logs
      logs.push('📋 Đang ghi lịch sử thay đổi...');
      setLog([...logs]);

      const allAuditEntries: { uuid: string; entry: object }[] = [];
      migrationData.forEach(({ uuid, auditEntries }) => {
        auditEntries.forEach(entry => allAuditEntries.push({ uuid, entry }));
      });

      let auditWritten = 0;
      for (let i = 0; i < allAuditEntries.length; i += BATCH_SIZE) {
        const chunk = allAuditEntries.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(({ entry }) => {
          const ref = doc(collection(db, 'audit_logs'));
          batch.set(ref, entry);
        });
        await batch.commit();
        auditWritten += chunk.length;
        setProgress(50 + Math.round((auditWritten / allAuditEntries.length) * 45));
        logs.push(`📋 Lịch sử: ${auditWritten}/${allAuditEntries.length}...`);
        setLog([...logs]);
      }

      // Step 5: Update counters
      logs.push('🔄 Cập nhật bộ đếm...');
      setLog([...logs]);

      const counterMap: Record<string, number> = {};
      migrationData.forEach(({ preview }) => {
        const parts = preview.reportId.split('-');
        if (parts.length >= 3) {
          const mmyy = parts[2];
          const yy = parseInt(mmyy.slice(-2), 10);
          const year = yy >= 24 ? `20${yy}` : `20${yy}`;
          const seq = parseInt(parts[1], 10);
          if (!counterMap[year] || seq > counterMap[year]) counterMap[year] = seq;
        }
      });

      for (const [year, maxSeq] of Object.entries(counterMap)) {
        const ref = doc(db, 'app_settings', `counter_year_${year}`);
        const existing = await getDoc(ref);
        const existingSeq = existing.exists() ? (existing.data().lastSeq || 0) : 0;
        if (maxSeq > existingSeq) {
          await setDoc(ref, { lastSeq: maxSeq }, { merge: true });
          logs.push(`📊 Counter ${year}: ${existingSeq} → ${maxSeq}`);
        }
      }

      setProgress(100);
      logs.push(`\n🎉 HOÀN TẤT!`);
      logs.push(`   ✅ ${migrationData.length} phiếu chính`);
      logs.push(`   📋 ${allAuditEntries.length} lịch sử thay đổi`);
      setLog([...logs]);
      setStep('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Lỗi: ${msg}`);
      setStep('confirm');
    }
  };

  const previews = migrationData.map(d => d.preview);

  // ========================
  // RENDER
  // ========================
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-red-600 to-rose-700 p-8 text-white shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
            <Database size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Công cụ Migration Dữ liệu</h1>
            <p className="text-orange-100 mt-1">Import database từ GAS (CSV) + toàn bộ lịch sử thay đổi vào Firebase BBSC</p>
          </div>
        </div>

        <div className="relative mt-6 flex items-center gap-2 flex-wrap">
          {(['upload', 'preview', 'confirm', 'running', 'done'] as Step[]).map((s, i) => {
            const labels = ['Upload CSV', 'Kiểm tra', 'Xác nhận', 'Đang chạy', 'Hoàn tất'];
            const done = (['upload', 'preview', 'confirm', 'running', 'done'] as Step[]).indexOf(step) > i;
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${active ? 'bg-white text-orange-700' : done ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'}`}>
                  {done ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>}
                  {labels[i]}
                </div>
                {i < 4 && <ArrowRight size={12} className="text-white/40" />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
          <AlertTriangle size={20} className="shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* STEP: UPLOAD */}
      {step === 'upload' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <p className="text-slate-400 text-sm mb-2">
            File cần có các cột: <code className="bg-slate-100 px-1 rounded text-xs">UUID, INCIDENT_NO, DATE, STATUS, IS_DELETED, LAST_UPDATED, DATA_PAYLOAD</code>
          </p>
          <div className="flex items-center gap-2 mb-6 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg w-fit border border-amber-100">
            <AlertTriangle size={14} />
            <span className="text-xs font-bold">Lưu ý: Chỉ sử dụng định dạng CSV UTF-8 để không bị lỗi font tiếng Việt.</span>
          </div>

          <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${isDragActive ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-orange-50'}`}>
            <input {...getInputProps()} />
            <Upload size={48} className={`mx-auto mb-4 ${isDragActive ? 'text-orange-500' : 'text-slate-300'}`} />
            <p className="text-lg font-bold text-slate-600">Kéo thả hoặc click để chọn file CSV</p>
            <p className="text-slate-400 text-sm mt-2">Chỉ chấp nhận file .csv</p>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-bold mb-1">Tool sẽ thực hiện:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Xóa toàn bộ dữ liệu demo</strong> (reports + audit logs) hiện tại</li>
                  <li>Import bản mới nhất của mỗi UUID → <code>bbsc_reports</code></li>
                  <li><strong>Import toàn bộ lịch sử GAS</strong> → <code>audit_logs</code> (Lịch sử thay đổi)</li>
                  <li>Giữ nguyên LPN, ASN, Status (tự normalize hoa/thường)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP: PREVIEW */}
      {step === 'preview' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-700">Bước 2: Kiểm tra dữ liệu</h2>
              <p className="text-slate-400 text-sm mt-1">
                <span className="font-bold text-green-600">{previews.length} phiếu</span> ·{' '}
                <span className="font-bold text-blue-600">{totalHistory + previews.length} audit entries</span>
                {totalSkipped > 0 && <> · <span className="font-bold text-amber-600">{totalSkipped} UUID bỏ qua</span></>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn-outline flex items-center gap-1.5"><RotateCcw size={13} /> Chọn lại</button>
              <button onClick={() => setStep('confirm')} className="btn-primary flex items-center gap-1.5">Tiếp tục <ArrowRight size={13} /></button>
            </div>
          </div>

          {/* Auto-seed warnings */}
          {(newPics.length > 0 || newTags.length > 0) && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
              <p className="text-sm font-bold text-blue-700 flex items-center gap-2">
                <Info size={15} /> Hệ thống sẽ tự động tạo thêm dữ liệu sau khi import:
              </p>
              {newPics.length > 0 && (
                <div className="flex items-start gap-2">
                  <UserPlus size={14} className="text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-blue-600">{newPics.length} PIC/sub-PIC mới (chưa có trong Quản lý Nhân sự):</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {newPics.map(p => (
                        <span key={p} className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 rounded-full text-xs font-bold">{p}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {newTags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag size={14} className="text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-purple-600">{newTags.length} Nhãn (Tag) mới (chưa có trong Cấu hình):</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {newTags.map(t => (
                        <span key={t} className="px-2 py-0.5 bg-white border border-purple-200 text-purple-700 rounded-full text-xs font-bold">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Tổng phiếu', value: previews.length, color: 'blue' },
              { label: 'Tổng audit', value: totalHistory + previews.length, color: 'purple' },
              { label: 'Hoàn tất', value: previews.filter(r => r.status.toLowerCase().includes('hoàn')).length, color: 'green' },
              { label: 'Bỏ qua', value: totalSkipped, color: 'slate' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-2xl font-black text-${s.color}-600`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Mã sự cố', 'Ngày lập', 'NCC', 'PIC', 'SL item', 'Lịch sử', 'Trạng thái'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previews.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{r.reportId}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.createdDate}</td>
                    <td className="px-3 py-1.5 font-medium truncate max-w-[120px]">{r.supplier}</td>
                    <td className="px-3 py-1.5">{r.pic}</td>
                    <td className="px-3 py-1.5 text-center font-bold">{r.itemCount}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold">{r.historyCount} ver</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${normalizeStatus(r.status).toLowerCase().includes('hoàn') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previews.length > 100 && (
              <div className="text-center py-2 text-xs text-slate-400 bg-slate-50">
                ... và {previews.length - 100} phiếu nữa
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP: CONFIRM */}
      {step === 'confirm' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={36} className="text-red-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-700 mb-2">Xác nhận Import</h2>
          <p className="text-slate-500 mb-1 max-w-lg mx-auto">
            Sẽ xóa toàn bộ dữ liệu demo và thay bằng:
          </p>
          <div className="flex justify-center gap-6 my-4">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-600">{previews.length}</div>
              <div className="text-xs text-slate-400 mt-1">phiếu BBSC</div>
            </div>
            <div className="w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-3xl font-black text-purple-600">{totalHistory + previews.length}</div>
              <div className="text-xs text-slate-400 mt-1">lịch sử thay đổi</div>
            </div>
          </div>
          <p className="text-red-500 text-sm font-bold mb-6">⚠️ Không thể hoàn tác!</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setStep('preview')} className="btn-outline">← Quay lại</button>
            <button onClick={runMigration}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl transition-all shadow-lg shadow-red-200 flex items-center gap-2">
              <Database size={18} /> Xác nhận Import ngay
            </button>
          </div>
        </div>
      )}

      {/* STEP: RUNNING */}
      {step === 'running' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-black text-slate-700 mb-4">Đang thực hiện migration...</h2>
          <div className="w-full bg-slate-100 rounded-full h-4 mb-2">
            <div className="bg-gradient-to-r from-orange-500 to-red-600 h-4 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-center text-slate-500 text-sm mb-6">{progress}%</p>
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 max-h-72 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <div className="animate-pulse">▊</div>
          </div>
        </div>
      )}

      {/* STEP: DONE */}
      {step === 'done' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-green-700 mb-2">Migration Thành Công! 🎉</h2>
          <div className="flex justify-center gap-6 my-4">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-600">{previews.length}</div>
              <div className="text-xs text-slate-400 mt-1">phiếu đã import</div>
            </div>
            <div className="w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-3xl font-black text-purple-600">{totalHistory + previews.length}</div>
              <div className="text-xs text-slate-400 mt-1">lịch sử đã lưu</div>
            </div>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 max-h-48 overflow-y-auto text-left mb-6">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStep('upload'); setMigrationData([]); setLog([]); setProgress(0); }} className="btn-outline flex items-center gap-2">
              <FileText size={14} /> Import file khác
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn-primary flex items-center gap-2">
              <CheckCircle2 size={14} /> Về Danh sách
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
