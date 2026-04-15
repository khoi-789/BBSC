'use client';

import { useEffect, useState, use } from 'react';
import { getAuditLogs } from '@/lib/services/audit';
import { getReport } from '@/lib/services/reports';
import { AuditLog, ReportItem } from '@/types';
import Link from 'next/link';
import {
  ArrowLeft, RotateCcw, Clock, User, FilePen, PlusCircle,
  RefreshCcw, Trash2, ChevronRight, X, ArrowRight, Package
} from 'lucide-react';

// ========================
// HELPERS
// ========================
const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  CREATED:        { label: 'TẠO MỚI',       color: 'green',  icon: PlusCircle },
  UPDATED:        { label: 'CẬP NHẬT',       color: 'blue',   icon: FilePen },
  STATUS_CHANGED: { label: 'ĐỔI TRẠNG THÁI', color: 'amber',  icon: RefreshCcw },
  DELETED:        { label: 'XÓA',            color: 'red',    icon: Trash2 },
};

// Field label mapping
const FIELD_LABELS: Record<string, string> = {
  'header.supplier':       'Nhà cung cấp (NCC)',
  'header.invoiceNo':      'Số hóa đơn (INV)',
  'header.incidentType':   'Loại sự cố',
  'header.dept':           'Bộ phận phát hiện',
  'header.pic':            'PIC',
  'header.subPic':         'Sub-PIC',
  'header.tags':           'Nhãn (Tags)',
  'header.note':           'Ghi chú chung',
  'header.classification': 'Phân loại hàng',
  'header.createdDate':    'Ngày lập phiếu',
  'header.status':         'Trạng thái',
  'header.completedDate':  'Ngày hoàn tất',
  'header.investigation':  'Điều tra cơ bộ (Mục I)',
  'header.immediateAction':'Hành động khắc phục (Mục II)',
  'items':                 'Danh sách hàng hóa',
};

function flattenObj(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  return Object.keys(obj).reduce((acc: Record<string, unknown>, key) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(acc, flattenObj(val as Record<string, unknown>, fullKey));
    } else {
      acc[fullKey] = val;
    }
    return acc;
  }, {});
}

function getDiffFields(oldSnap: Record<string, unknown>, newSnap: Record<string, unknown>): Array<{ key: string; label: string; oldVal: unknown; newVal: unknown }> {
  const diffs: Array<{ key: string; label: string; oldVal: unknown; newVal: unknown }> = [];

  const oldFlat = flattenObj(oldSnap);
  const newFlat = flattenObj(newSnap);

  const SKIP = ['system.', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'isDeleted', 'reasonForChange', 'tasks', 'attachments'];

  const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);
  allKeys.forEach(key => {
    if (SKIP.some(s => key.startsWith(s) || key === s)) return;
    if (key === 'items') return; // Handled separately

    const oldV = oldFlat[key];
    const newV = newFlat[key];
    const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
    if (changed) {
      diffs.push({
        key,
        label: FIELD_LABELS[key] || key,
        oldVal: oldV,
        newVal: newV,
      });
    }
  });

  return diffs;
}

function getItemsFromSnap(snap: Record<string, unknown>): ReportItem[] {
  const items = snap.items as ReportItem[] || [];
  return items;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(Trống)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatTs(ts: { seconds?: number; toDate?: () => Date } | null | undefined): string {
  if (!ts) return '—';
  let d: Date;
  if (ts.toDate) d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ========================
// ITEM COMPARE MODAL
// ========================
function ItemCompareModal({ oldItems, newItems, onClose }: { oldItems: ReportItem[]; newItems: ReportItem[]; onClose: () => void }) {
  const allItemCodes = Array.from(new Set([
    ...oldItems.map(i => i.itemCode || i.id),
    ...newItems.map(i => i.itemCode || i.id),
  ]));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Package size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">So sánh Danh sách Hàng hóa</h3>
              <p className="text-xs text-slate-400">Highlight: xanh = thêm mới · đỏ = bị xóa · vàng = thay đổi</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* OLD side */}
          <div className="flex-1 overflow-auto border-r border-slate-100">
            <div className="sticky top-0 bg-red-50 px-4 py-2 text-xs font-black text-red-700 uppercase tracking-wider border-b border-red-100">
              Dữ liệu cũ (Trước khi sửa)
            </div>
            <div className="p-3 space-y-2">
              {oldItems.length === 0 && <div className="text-slate-400 text-sm text-center py-6">Không có dữ liệu</div>}
              {oldItems.map((item, idx) => {
                const matchNew = newItems.find(ni => ni.itemCode === item.itemCode);
                const isRemoved = !matchNew;
                const isChanged = matchNew && JSON.stringify(item) !== JSON.stringify(matchNew);
                return (
                  <div key={idx} className={`rounded-xl p-3 text-xs border ${isRemoved ? 'bg-red-50 border-red-200' : isChanged ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isRemoved ? 'bg-red-200 text-red-700' : isChanged ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                        {isRemoved ? 'XÓA' : isChanged ? 'ĐỔI' : 'GIỮ'}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{item.itemCode}</span>
                    </div>
                    <div className="text-slate-600 font-medium truncate">{item.itemName}</div>
                    <div className="flex flex-wrap gap-2 mt-1 text-slate-500">
                      <span>SL: <b>{item.quantity}</b> {item.unit}</span>
                      <span>Lô: <b className={isChanged && matchNew?.batchNo !== item.batchNo ? 'text-amber-600' : ''}>{item.batchNo || '—'}</b></span>
                      {item.lpn && <span>LPN: <b>{item.lpn}</b></span>}
                      {item.asn && <span>ASN: <b>{item.asn}</b></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NEW side */}
          <div className="flex-1 overflow-auto">
            <div className="sticky top-0 bg-green-50 px-4 py-2 text-xs font-black text-green-700 uppercase tracking-wider border-b border-green-100">
              Dữ liệu mới (Sau khi sửa)
            </div>
            <div className="p-3 space-y-2">
              {newItems.length === 0 && <div className="text-slate-400 text-sm text-center py-6">Không có dữ liệu</div>}
              {newItems.map((item, idx) => {
                const matchOld = oldItems.find(oi => oi.itemCode === item.itemCode);
                const isAdded = !matchOld;
                const isChanged = matchOld && JSON.stringify(item) !== JSON.stringify(matchOld);
                return (
                  <div key={idx} className={`rounded-xl p-3 text-xs border ${isAdded ? 'bg-green-50 border-green-200' : isChanged ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isAdded ? 'bg-green-200 text-green-700' : isChanged ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                        {isAdded ? 'MỚI' : isChanged ? 'ĐỔI' : 'GIỮ'}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{item.itemCode}</span>
                    </div>
                    <div className="text-slate-600 font-medium truncate">{item.itemName}</div>
                    <div className="flex flex-wrap gap-2 mt-1 text-slate-500">
                      <span>SL: <b className={isChanged && matchOld?.quantity !== item.quantity ? 'text-amber-600' : ''}>{item.quantity}</b> {item.unit}</span>
                      <span>Lô: <b className={isChanged && matchOld?.batchNo !== item.batchNo ? 'text-amber-600' : ''}>{item.batchNo || '—'}</b></span>
                      {item.lpn && <span>LPN: <b className={isChanged && matchOld?.lpn !== item.lpn ? 'text-green-600' : ''}>{item.lpn}</b></span>}
                      {item.asn && <span>ASN: <b>{item.asn}</b></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-6 text-xs text-slate-500">
          <span className="font-bold text-slate-600">Chú thích:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 rounded inline-block" /> Bị xóa</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded inline-block" /> Mới thêm</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 rounded inline-block" /> Thay đổi nội dung</span>
        </div>
      </div>
    </div>
  );
}

// ========================
// MAIN PAGE
// ========================
export default function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [reportNo, setReportNo] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Promise.all([getAuditLogs(id), getReport(id)]).then(([auditLogs, report]) => {
      // Sort ascending (oldest first = version 1)
      const sorted = [...auditLogs].sort((a, b) => {
        const ta = a.timestamp?.seconds || 0;
        const tb = b.timestamp?.seconds || 0;
        return ta - tb;
      });
      setLogs(sorted);
      setSelectedIdx(sorted.length - 1); // Default: show latest
      setReportNo(report?.reportId || id);
      setLoading(false);
    });
  }, [id]);

  const reload = () => {
    setLoading(true);
    getAuditLogs(id).then(auditLogs => {
      const sorted = [...auditLogs].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setLogs(sorted);
      setSelectedIdx(sorted.length - 1);
      setLoading(false);
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner" style={{ borderTopColor: '#1a56a0', borderColor: '#dbeafe' }} />
        <span className="text-sm text-slate-400">Đang tải lịch sử...</span>
      </div>
    </div>
  );

  const selectedLog = logs[selectedIdx];
  const prevLog = selectedIdx > 0 ? logs[selectedIdx - 1] : null;

  // Extract snapshots for diffing
  const getSnapshot = (log: AuditLog | null): Record<string, unknown> => {
    if (!log) return {};
    const snap = log.changes?.snapshot as Record<string, unknown>;
    if (snap) return snap;
    // App-generated log: compare old vs new within changes
    return (log.changes?.new as Record<string, unknown>) || {};
  };

  const currentSnap = getSnapshot(selectedLog);
  const previousSnap = prevLog ? getSnapshot(prevLog) : {};

  const diffs = selectedLog?.action !== 'CREATED'
    ? getDiffFields(previousSnap, currentSnap)
    : [];

  const currentItems = getItemsFromSnap(currentSnap);
  const prevItems = prevLog ? getItemsFromSnap(getSnapshot(prevLog)) : [];
  const itemsChanged = JSON.stringify(currentItems) !== JSON.stringify(prevItems);

  const cfg = ACTION_CONFIG[selectedLog?.action || 'UPDATED'] || ACTION_CONFIG.UPDATED;

  return (
    <>
      {showModal && itemsChanged && (
        <ItemCompareModal
          oldItems={prevItems}
          newItems={currentItems}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="card-header flex items-center justify-between relative overflow-hidden">
          <div className="card-header-icon">
            <img src="/img/dashboard-bg.png" alt="" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-blue-200 text-sm mb-1">
              <Link href={`/dashboard/${id}`} className="flex items-center gap-1 hover:text-white transition-colors">
                <ArrowLeft size={14} /> Quay lại
              </Link>
            </div>
            <h1 className="text-white drop-shadow-md flex items-center gap-2">
              <Clock size={22} /> Lịch sử thay đổi (Audit Trail)
            </h1>
            <p className="text-blue-100 opacity-90 font-mono">{reportNo}</p>
          </div>
          <button onClick={reload} className="relative z-10 btn btn-sm bg-white/20 text-white border-white/30 hover:bg-white/30 flex items-center gap-2">
            <RotateCcw size={13} /> Tải lại
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="bg-white rounded-3xl border p-16 text-center text-slate-400">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Chưa có lịch sử thay đổi nào.</p>
          </div>
        ) : (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
            {/* LEFT PANEL: Version list */}
            <div className="w-64 shrink-0 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-50">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  {logs.length} phiên bản
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {[...logs].reverse().map((log, reverseIdx) => {
                  const realIdx = logs.length - 1 - reverseIdx;
                  const versionNo = realIdx + 1;
                  const isSelected = selectedIdx === realIdx;
                  const c = ACTION_CONFIG[log.action] || ACTION_CONFIG.UPDATED;
                  const IconComp = c.icon;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedIdx(realIdx)}
                      className={`w-full text-left p-4 border-b border-slate-50 transition-all hover:bg-slate-50 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-black text-slate-700">Phiên bản {versionNo}</span>
                        {isSelected && <ChevronRight size={14} className="text-blue-500" />}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-2">
                        <Clock size={9} /> {formatTs(log.timestamp as Parameters<typeof formatTs>[0])}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 mb-2">
                        <User size={9} /> {log.performedByName}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-${c.color}-100 text-${c.color}-700`}>
                        <IconComp size={8} />
                        {c.label}
                      </span>
                      {log.source === 'gas_migration' && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-100 text-orange-600">GAS</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANEL: Detail diff */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
              {selectedLog && (
                <>
                  {/* Version header */}
                  <div className={`p-5 border-b border-slate-50 bg-${cfg.color}-50`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-${cfg.color}-100 text-${cfg.color}-700`}>
                            <cfg.icon size={11} /> {cfg.label}
                          </span>
                          <span className="text-sm font-black text-slate-700">
                            Chi tiết Phiên bản {selectedIdx + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock size={10} /> {formatTs(selectedLog.timestamp as Parameters<typeof formatTs>[0])}</span>
                          <span className="flex items-center gap-1"><User size={10} /> {selectedLog.performedByName}</span>
                        </div>
                        {selectedLog.changes?.reason && (
                          <div className="mt-2 text-xs text-slate-500 italic">Lý do: {selectedLog.changes.reason}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5">
                    {selectedLog.action === 'CREATED' ? (
                      <div className="p-6 text-center text-slate-400">
                        <PlusCircle size={32} className="mx-auto mb-2 text-green-300" />
                        <p className="font-medium text-green-600">Phiếu được tạo mới</p>
                        <p className="text-xs mt-1 text-slate-400">bởi <b>{selectedLog.performedByName}</b> lúc {formatTs(selectedLog.timestamp as Parameters<typeof formatTs>[0])}</p>
                      </div>
                    ) : diffs.length === 0 && !itemsChanged ? (
                      <div className="p-6 text-center text-slate-400">
                        <p className="text-sm">Không phát hiện thay đổi chi tiết nào.</p>
                        <p className="text-xs mt-1 text-slate-300">(Snapshot đầy đủ có thể không khả dụng với dữ liệu cũ)</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Field diffs */}
                        {diffs.map((diff, i) => (
                          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                            <div className="px-4 py-2 bg-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wide">
                              {diff.label}
                            </div>
                            <div className="flex items-center gap-2 px-4 py-3">
                              <div className="flex-1 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                                {formatVal(diff.oldVal)}
                              </div>
                              <ArrowRight size={14} className="text-slate-400 shrink-0" />
                              <div className="flex-1 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-xs text-green-700 font-medium">
                                {formatVal(diff.newVal)}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Items changed */}
                        {itemsChanged && prevLog && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                            <div className="px-4 py-2 bg-amber-100 text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center justify-between">
                              <span>Danh sách hàng hóa</span>
                              <span className="font-normal text-amber-600">
                                Thay đổi từ {prevItems.length} dòng thành {currentItems.length} dòng.
                              </span>
                            </div>
                            <div className="px-4 py-3">
                              <button
                                onClick={() => setShowModal(true)}
                                className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-100 transition-colors flex items-center gap-2"
                              >
                                <Package size={13} /> ● Xem chi tiết so sánh
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
