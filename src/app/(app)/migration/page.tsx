'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import {
  collection, doc, writeBatch, Timestamp, getDocs,
  query, where, setDoc, getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Trash2,
  Database, ArrowRight, RotateCcw, Info
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
  raw: object;
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
  return STATUS_MAP[upper] || s.trim();
}

function msToTimestamp(ms: number | string): Timestamp {
  const n = typeof ms === 'string' ? parseInt(ms, 10) : ms;
  return Timestamp.fromMillis(isNaN(n) ? Date.now() : n);
}

function transformGasRow(row: GasRow): object | null {
  try {
    const payload = JSON.parse(row.DATA_PAYLOAD);
    const h = payload.header || {};
    const sys = payload.system || {};
    const items = (payload.items || []).map((item: Record<string, unknown>, idx: number) => ({
      id: `item_${idx}`,
      itemCode: (item.item_code as string || '').toString().trim().replace(/\t/g, ''),
      itemName: (item.product_name as string || '').toString().trim(),
      batchNo: (item.batch_no as string || '').toString().trim(),
      expiryDate: (item.expired_date as string || '').toString().trim(),
      quantity: Number(item.quantity) || 0,
      unit: (item.uom as string || '').toString().trim(),
      issueType: (item.problem_detail as string || '').toString().trim(),
      note: (item.item_action as string || '').toString().trim(),
      lpn: (item.lpn as string || '').toString().trim(),
      asn: (item.asn as string || '').toString().trim(),
    }));

    const createdDate = h.created_date || row.DATE || '';
    const createdAtMs = sys.created_at || new Date(row.DATE || Date.now()).getTime();
    const updatedAtMs = sys.updated_at || new Date(row.LAST_UPDATED || Date.now()).getTime();

    return {
      reportId: row.INCIDENT_NO.trim(),
      header: {
        supplier: (h.supplier || '').trim(),
        invoiceNo: (h.invoice_no || '').trim(),
        incidentType: (h.incident_type || '').trim(),
        dept: (h.dept || '').trim(),
        pic: (h.pic || '').trim(),
        subPic: (h.sub_pic || '').trim(),
        tags: (h.tags || '').trim(),
        note: (h.note || '').trim(),
        classification: (h.classification || '').trim(),
        createdDate: createdDate.trim(),
        status: normalizeStatus(row.STATUS || h.status || 'Khởi tạo'),
        completedDate: (h.completed_date || '').trim(),
        investigation: (h.investigation || '').trim(),
        immediateAction: (h.immediate_action || '').trim(),
      },
      items,
      tasks: [],
      attachments: [],
      isDeleted: false,
      createdBy: 'migration_tool',
      createdByName: (sys.created_by || 'GAS Migration').trim(),
      createdAt: msToTimestamp(createdAtMs),
      updatedAt: msToTimestamp(updatedAtMs),
      updatedBy: 'migration_tool',
      updatedByName: (sys.updated_by || 'GAS Migration').trim(),
      reasonForChange: 'Imported from GAS database',
    };
  } catch {
    return null;
  }
}

// ========================
// MAIN COMPONENT
// ========================
type Step = 'upload' | 'preview' | 'confirm' | 'running' | 'done';

export default function MigrationPage() {
  const { profile } = useAuthStore();
  const router = useRouter();

  const [step, setStep] = useState<Step>('upload');
  const [parsedReports, setParsedReports] = useState<ParsedReport[]>([]);
  const [rawTransformed, setRawTransformed] = useState<object[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Guard: Admin only
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

    Papa.parse<GasRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as GasRow[];

        // Filter: only live records (IS_DELETED is blank)
        const liveRows = rows.filter(r => !r.IS_DELETED || r.IS_DELETED.trim() === '');

        // Deduplicate by UUID (should already be unique but just in case)
        const seen = new Set<string>();
        const unique = liveRows.filter(r => {
          if (seen.has(r.UUID)) return false;
          seen.add(r.UUID);
          return true;
        });

        let skip = 0;
        const transformed: object[] = [];
        const preview: ParsedReport[] = [];

        for (const row of unique) {
          const doc = transformGasRow(row);
          if (!doc) { skip++; continue; }

          const d = doc as Record<string, unknown>;
          const h = d.header as Record<string, unknown>;
          transformed.push(doc);
          preview.push({
            docId: row.UUID,
            reportId: row.INCIDENT_NO,
            createdDate: row.DATE,
            status: row.STATUS,
            supplier: String(h?.supplier || ''),
            incidentType: String(h?.incidentType || ''),
            pic: String(h?.pic || ''),
            itemCount: Array.isArray(d?.items) ? d.items.length : 0,
            raw: doc,
          });
        }

        setSkipped(skip + (rows.length - liveRows.length));
        setRawTransformed(transformed);
        setParsedReports(preview);
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
      // Step 1: Delete all existing non-deleted reports (demo data)
      logs.push('🔍 Đang tìm và xóa dữ liệu demo cũ...');
      setLog([...logs]);

      const existingSnap = await getDocs(
        query(collection(db, 'bbsc_reports'), where('isDeleted', '==', false))
      );
      const deleteBatch = writeBatch(db);
      existingSnap.docs.forEach(d => {
        deleteBatch.delete(d.ref);
      });
      if (!existingSnap.empty) {
        await deleteBatch.commit();
        logs.push(`🗑️ Đã xóa ${existingSnap.size} bản ghi demo cũ.`);
      } else {
        logs.push('ℹ️ Không có dữ liệu demo cũ cần xóa.');
      }
      setLog([...logs]);

      // Step 2: Batch write new data (max 500 per batch)
      const BATCH_SIZE = 400;
      let written = 0;
      for (let i = 0; i < rawTransformed.length; i += BATCH_SIZE) {
        const chunk = rawTransformed.slice(i, i + BATCH_SIZE);
        const preview = parsedReports.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach((docData, idx) => {
          const uuid = preview[idx]?.docId;
          if (!uuid) return;
          const ref = doc(collection(db, 'bbsc_reports'), uuid);
          batch.set(ref, docData);
        });

        await batch.commit();
        written += chunk.length;
        setProgress(Math.round((written / rawTransformed.length) * 95));
        logs.push(`✅ Đã ghi ${written}/${rawTransformed.length} phiếu...`);
        setLog([...logs]);
      }

      // Step 3: Update year counters
      logs.push('🔄 Cập nhật bộ đếm số thứ tự...');
      setLog([...logs]);

      const counterMap: Record<string, number> = {};
      parsedReports.forEach(r => {
        const parts = r.reportId.split('-');
        if (parts.length >= 3) {
          const mmyy = parts[2];
          const yy = mmyy.slice(-2);
          const year = parseInt(yy, 10) >= 24 ? '20' + yy : '20' + yy;
          const seq = parseInt(parts[1], 10);
          if (!counterMap[year] || seq > counterMap[year]) {
            counterMap[year] = seq;
          }
        }
      });

      for (const [year, maxSeq] of Object.entries(counterMap)) {
        const counterRef = doc(db, 'app_settings', `counter_year_${year}`);
        const existing = await getDoc(counterRef);
        const existingSeq = existing.exists() ? (existing.data().lastSeq || 0) : 0;
        if (maxSeq > existingSeq) {
          await setDoc(counterRef, { lastSeq: maxSeq }, { merge: true });
          logs.push(`📊 Counter năm ${year}: ${existingSeq} → ${maxSeq}`);
        }
      }

      setProgress(100);
      logs.push(`\n🎉 HOÀN TẤT! Đã import ${written} phiếu thành công.`);
      setLog([...logs]);
      setStep('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Lỗi migration: ${msg}`);
      setStep('confirm');
    }
  };

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
            <p className="text-orange-100 mt-1">Import database từ GAS (CSV) vào Firebase BBSC</p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="relative mt-6 flex items-center gap-2">
          {(['upload', 'preview', 'confirm', 'running', 'done'] as Step[]).map((s, i) => {
            const labels = ['Upload CSV', 'Kiểm tra', 'Xác nhận', 'Đang chạy', 'Hoàn tất'];
            const active = step === s;
            const done = (['upload', 'preview', 'confirm', 'running', 'done'] as Step[]).indexOf(step) > i;
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

      {/* ---- STEP: UPLOAD ---- */}
      {step === 'upload' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-black text-slate-700 mb-2">Bước 1: Upload file CSV từ GAS</h2>
          <p className="text-slate-400 text-sm mb-6">
            File CSV cần có các cột: <code className="bg-slate-100 px-1 rounded text-xs">UUID, INCIDENT_NO, DATE, STATUS, IS_DELETED, LAST_UPDATED, DATA_PAYLOAD</code>
          </p>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${isDragActive ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-orange-50'}`}
          >
            <input {...getInputProps()} />
            <Upload size={48} className={`mx-auto mb-4 ${isDragActive ? 'text-orange-500' : 'text-slate-300'}`} />
            <p className="text-lg font-bold text-slate-600">Kéo thả hoặc click để chọn file CSV</p>
            <p className="text-slate-400 text-sm mt-2">Chỉ chấp nhận file .csv</p>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-bold mb-1">Lưu ý quan trọng trước khi import:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Tool sẽ <strong>xóa toàn bộ dữ liệu demo</strong> hiện tại trước khi import</li>
                  <li>Chỉ lấy dòng <strong>IS_DELETED = rỗng</strong> (bản ghi sống nhất)</li>
                  <li>Trường <strong>LPN</strong> và <strong>ASN</strong> sẽ được giữ nguyên</li>
                  <li>Status sẽ được normalize (không phân biệt hoa/thường)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- STEP: PREVIEW ---- */}
      {step === 'preview' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-700">Bước 2: Kiểm tra trước khi import</h2>
              <p className="text-slate-400 text-sm mt-1">
                Tìm thấy <span className="font-bold text-green-600">{parsedReports.length} phiếu hợp lệ</span>
                {skipped > 0 && <>, bỏ qua <span className="font-bold text-amber-600">{skipped} dòng</span> (lịch sử cũ hoặc lỗi)</>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn-outline flex items-center gap-2">
                <RotateCcw size={14} /> Chọn lại
              </button>
              <button onClick={() => setStep('confirm')} className="btn-primary flex items-center gap-2">
                Tiếp tục <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Tổng phiếu', value: parsedReports.length, color: 'blue' },
              { label: 'Hoàn tất', value: parsedReports.filter(r => r.status.toLowerCase().includes('hoàn tất') || r.status.toLowerCase().includes('hoan tat')).length, color: 'green' },
              { label: 'Đang xử lý', value: parsedReports.filter(r => !r.status.toLowerCase().includes('hoàn tất') && !r.status.toLowerCase().includes('hủy')).length, color: 'amber' },
              { label: 'Bỏ qua', value: skipped, color: 'slate' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-2xl font-black text-${s.color}-600`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['Mã sự cố', 'Ngày lập', 'NCC', 'Loại SC', 'PIC', 'SL item', 'Trạng thái'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {parsedReports.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{r.reportId}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.createdDate}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700 max-w-[120px] truncate">{r.supplier}</td>
                    <td className="px-3 py-1.5 text-slate-600 max-w-[100px] truncate">{r.incidentType}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.pic}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-slate-700">{r.itemCount}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${r.status.toLowerCase().includes('hoàn') ? 'bg-green-100 text-green-700' : r.status.toLowerCase().includes('hủy') ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedReports.length > 100 && (
              <div className="text-center py-2 text-xs text-slate-400 bg-slate-50">
                ... và {parsedReports.length - 100} phiếu nữa (chỉ hiển thị 100 dòng đầu)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- STEP: CONFIRM ---- */}
      {step === 'confirm' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={36} className="text-red-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-700 mb-2">Xác nhận Import</h2>
          <p className="text-slate-500 mb-6 max-w-lg mx-auto">
            Thao tác này sẽ <strong className="text-red-600">xóa toàn bộ dữ liệu demo</strong> hiện tại và thay bằng{' '}
            <strong className="text-blue-600">{parsedReports.length} phiếu</strong> từ GAS database. Không thể hoàn tác!
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setStep('preview')} className="btn-outline">
              ← Quay lại
            </button>
            <button
              onClick={runMigration}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl transition-all shadow-lg shadow-red-200 flex items-center gap-2"
            >
              <Database size={18} /> Xác nhận Import ngay
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP: RUNNING ---- */}
      {step === 'running' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <h2 className="text-xl font-black text-slate-700 mb-4">Đang thực hiện migration...</h2>
          <div className="w-full bg-slate-100 rounded-full h-4 mb-4">
            <div
              className="bg-gradient-to-r from-orange-500 to-red-600 h-4 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-slate-500 text-sm mb-6">{progress}% hoàn tất</p>
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <div className="animate-pulse">▊</div>
          </div>
        </div>
      )}

      {/* ---- STEP: DONE ---- */}
      {step === 'done' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-green-700 mb-2">Migration Thành Công! 🎉</h2>
          <p className="text-slate-500 mb-2">
            Đã import <strong className="text-green-600">{parsedReports.length} phiếu</strong> vào Firebase thành công.
          </p>
          <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 max-h-48 overflow-y-auto text-left mb-6">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStep('upload'); setParsedReports([]); setLog([]); setProgress(0); }} className="btn-outline flex items-center gap-2">
              <FileText size={14} /> Import thêm file khác
            </button>
            <button onClick={() => router.push('/dashboard')} className="btn-primary flex items-center gap-2">
              <CheckCircle2 size={14} /> Về Danh sách sự cố
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
