'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { BBSCReport } from '@/types';
import { getReports, softDeleteReport } from '@/lib/services/reports';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge, ALL_STATUSES } from '@/components/ui/StatusBadge';
import { useAppStore } from '@/stores/appStore';
import { Pencil, Trash2, RefreshCw, Filter, Download, PlusCircle, Search, History, AlertTriangle, X } from 'lucide-react';
import { format } from 'date-fns';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr || dateStr === '—' || !dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

export default function ReportTable() {
  const { profile } = useAuthStore();
  const { masterData, reportFilters, setReportFilters, resetReportFilters } = useAppStore();
  const { toast } = useToast();

  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search Metadata
  const [appliedFilters, setAppliedFilters] = useState(reportFilters);
  const [isDirty, setIsDirty] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  const {
    search, filterStatus, showAdvanced, filterSupplier, filterClass,
    filterType, filterDept, filterPic, filterTag, filterTerm,
    filterItemCode, filterLotNumber, filterItemName,
    detailClassification, detailIncident, pageSize, page
  } = reportFilters;

  useEffect(() => {
    const hasChanged = JSON.stringify(reportFilters) !== JSON.stringify(appliedFilters);
    setIsDirty(hasChanged);
  }, [reportFilters, appliedFilters]);

  const setF = (updates: any) => setReportFilters(updates);

  // ---- FETCH LOGIC (Unified) ----
  const fetchData = useCallback(async (isLoadMore = false) => {
    if (!isLoadMore) {
      setLoading(true);
      setReports([]);
      setLastVisible(null);
    }
    setIndexError(null);
    setAppliedFilters(reportFilters);
    setIsDirty(false);

    try {
      const result = await getReports(
        { 
          dept: filterDept, 
          supplier: filterSupplier,
          status: filterStatus || undefined,
          class: filterClass,
          type: filterType,
          tag: filterTag,
          reportId: search,
          itemCode: filterItemCode,
          lotNumber: filterLotNumber,
          itemName: filterItemName
        },
        isLoadMore ? lastVisible : null,
        pageSize
      );

      if (result.indexError) {
        setIndexError(result.indexError);
        setHasMore(false);
      } else {
        setReports(prev => isLoadMore ? [...prev, ...result.data] : result.data);
        setLastVisible(result.lastVisible);
        setHasMore(result.data.length === pageSize);
      }
    } catch (e: any) {
      toast(e.message || 'Lỗi tải dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, [reportFilters, lastVisible]);

  useEffect(() => {
    fetchData(false);
  }, []); // Initial load

  const handleSearch = () => fetchData(false);

  const handleReindex = async () => {
    if (!profile || profile.role !== 'Admin') return;
    if (!confirm('Hệ thống sẽ cập nhật lại Mục lục (Mã hàng/Số lô) cho 1400 dòng cũ. Việc này tốn khoảng 1400 lượt Read/Write. Bạn chắc chứ?')) return;
    
    setLoading(true);
    try {
      // 1. Get all reports (Legacy fetcher)
      const { getReportsLegacy, updateReport } = await import('@/lib/services/reports');
      const all = await getReportsLegacy();
      
      toast(`Bắt đầu xử lý ${all.length} dòng...`, 'info');
      
      // 2. Update each with its own items
      let count = 0;
      for (const r of all) {
        // Calling updateReport will automatically invoke prepareSearchIndices
        await updateReport(r.id, { items: r.items }, profile.uid, profile.displayName);
        count++;
        if (count % 100 === 0) toast(`Đã xử lý ${count}/${all.length}...`, 'info');
      }
      
      toast(`Thành công! Đã cập nhật ${count} dòng.`, 'success');
      handleSearch();
    } catch (e: any) {
      toast(e.message || 'Lỗi bảo trì', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const tags = masterData['tag'] || [];
  
  const canDelete = (r: BBSCReport) => {
    if (!profile) return false;
    if (profile.role === 'Admin') return true;
    return r.createdBy === profile.uid && r.header.status === 'Khởi tạo';
  };

  const canEdit = (r: BBSCReport) => {
    if (!profile) return false;
    if (profile.role === 'Admin' || profile.role === 'Manager') return true;
    if (profile.department === 'QA') return true;
    return r.header.dept === profile.department;
  };

  const filteredReports = useMemo(() => {
    let d = [...reports];
    
    // Sort logic remains independent...
    d.sort((a, b) => {
      const parseId = (id: string) => {
        const parts = id.split('-');
        const seq = parseInt(parts[1] || '0', 10);
        const mmyy = parts[2] || '0000';
        const mm = parseInt(mmyy.substring(0, 2), 10);
        const yy = parseInt(mmyy.substring(2, 4), 10);
        return { yy, mm, seq };
      };
      const pa = parseId(a.reportId);
      const pb = parseId(b.reportId);
      if (pa.yy !== pb.yy) return pb.yy - pa.yy;
      if (pa.mm !== pb.mm) return pb.mm - pa.mm;
      return pb.seq - pa.seq;
    });

    // Use appliedFilters instead of drect reportFilters for the Actual List
    const { 
      filterStatus: fStat, filterSupplier: fSup, filterDept: fDept, 
      filterPic: fPic, filterType: fTyp, filterTag: fTag, 
      filterClass: fCls, search: fSrc, filterTerm: fTrm 
    } = appliedFilters;

    if (fStat) d = d.filter(r => r.header.status === fStat);
    if (fSup) d = d.filter(r => r.header.supplier === fSup);
    if (fDept) d = d.filter(r => r.header.dept === fDept);
    if (fPic) d = d.filter(r => r.header.pic === fPic || r.header.subPic === fPic);
    if (fTyp) d = d.filter(r => r.header.incidentType === fTyp);
    if (fTag) d = d.filter(r => r.header.tags === fTag);
    
    if (fSrc || fTrm) {
      const s = (fSrc || fTrm).toLowerCase();
      d = d.filter(r =>
        r.reportId.toLowerCase().includes(s) ||
        r.header.supplier?.toLowerCase().includes(s) ||
        r.header.invoiceNo?.toLowerCase().includes(s) ||
        r.header.note?.toLowerCase().includes(s) ||
        r.items.some(i => 
          i.itemCode?.toLowerCase().includes(s) || 
          i.itemName?.toLowerCase().includes(s) || 
          i.batchNo?.toLowerCase().includes(s) ||
          i.note?.toLowerCase().includes(s)
        )
      );
    }
    
    if (fCls) {
      d = d.filter(r => r.items.some(i => i.issueType === fCls));
    }

    return d;
  }, [reports, appliedFilters]);

  // Transform into display rows based on mode
  const displayRows = useMemo(() => {
    if (!detailIncident) return reports.map(r => ({ type: 'report', data: r } as const));

    const rows: { type: 'item', report: BBSCReport, item: any, itemIndex: number }[] = [];
    reports.forEach(r => {
      if (!r.items) return;
      r.items.forEach((item, idx) => {
        rows.push({ type: 'item', report: r, item, itemIndex: idx });
      });
    });
    return rows;
  }, [reports, detailIncident]);

  const paginatedRows = displayRows;


  function resetFilters() {
    resetReportFilters();
  }

  async function handleDelete(r: BBSCReport) {
    if (!profile) return;
    const reason = prompt(`Lý do xóa phiếu ${r.reportId}:`);
    if (reason === null) return;
    
    // Phase 3: Optimistic UI Delete
    const originalReports = [...reports];
    setReports(prev => prev.filter(report => report.id !== r.id));
    
    try {
      await softDeleteReport(r.id, profile.uid, profile.displayName, reason);
      toast('Đã xóa phiếu thành công', 'success');
      handleSearch(); 
    } catch (e: any) {
      setReports(originalReports);
      toast(e.message || 'Lỗi thao tác, đã hoàn tác', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {indexError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md flex items-start gap-2 text-sm animate-in fade-in">
          <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={18} />
          <div>
            Hệ thống đang cần tạo Index mục lục để lọc thông tin này. Bạn là Admin có thể kích hoạt bằng cách 
            <a href={indexError} target="_blank" rel="noreferrer" className="font-bold underline text-blue-600 hover:text-blue-800 ml-1">
               bấm vào link này
            </a>
          </div>
        </div>
      )}

      {/* Hero Search & Actions */}
      <div className="card !p-2 flex flex-col gap-2 shadow-sm border-blue-100">
        <div className="flex flex-nowrap items-center gap-2">
          {/* Main Smart Search */}
          <div className={`flex items-center bg-white rounded-md border border-slate-300 h-10 px-3 transition-all flex-1 min-w-0 ${search ? 'ring-2 ring-blue-500/20 border-blue-500' : 'focus-within:border-blue-500'}`}>
            <Search size={18} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              className="outline-none text-[13px] w-full py-1 font-semibold bg-transparent"
              placeholder="Gõ mã BBSC đầy đủ (ví dụ BBSC-0001-0426) rồi nhấn ENTER..."
              value={search}
              onChange={e => setF({ search: e.target.value.toUpperCase() })}
              onKeyDown={handleKeyDown}
            />
            {search && <X size={14} className="text-slate-400 cursor-pointer hover:text-slate-600" onClick={() => setF({ search: '' })} />}
          </div>

          <button 
            className={`btn btn-primary !h-10 !w-14 p-0 flex items-center justify-center flex-shrink-0 transition-all ${isDirty ? 'animate-pulse ring-4 ring-blue-500/30' : 'opacity-90'}`}
            onClick={handleSearch}
            title="Lọc toàn bộ dữ liệu (Enter)"
          >
            <Search size={22} strokeWidth={3} />
          </button>

          <button onClick={handleSearch} className="btn btn-ghost border border-slate-200 !h-10 !w-10 p-0 flex items-center justify-center bg-white shadow-sm" title="Làm mới">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          <Link href="/create" className="btn btn-primary !h-10 px-4 text-[13px] shadow-sm flex items-center gap-2">
            <PlusCircle size={18} /> Tạo mới
          </Link>
        </div>

        {/* Row 2: Basic Filters */}
        <div className="flex flex-wrap items-center gap-2">
           <select
              className="form-select !w-36 !h-8 !py-0 text-[12px] border-slate-300 !bg-white font-medium"
              value={filterStatus}
              onChange={e => setF({ filterStatus: e.target.value })}
            >
              <option value="">-- Tất cả trạng thái --</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select className="form-select !w-36 !h-8 !py-0 text-[12px] border-slate-300 !bg-white font-medium" value={filterDept} onChange={e => setF({ filterDept: e.target.value })}>
              <option value="">-- Tất cả bộ phận --</option>
              {(masterData['dept'] || []).map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
            </select>

            <div className="flex-1"></div>

            <div className="flex items-center gap-3 px-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" checked={detailClassification} onChange={e => setF({ detailClassification: e.target.checked })} />
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Phân loại</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" checked={detailIncident} onChange={e => setF({ detailIncident: e.target.checked })} />
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Chi tiết hàng</span>
            </label>
            <button className={`btn btn-ghost !h-8 !w-8 p-0 border border-slate-200 ${showAdvanced ? 'bg-blue-50 border-blue-300' : 'bg-white'}`} onClick={() => setF({ showAdvanced: !showAdvanced })}>
              <Filter size={16} className={showAdvanced ? 'text-blue-600' : 'text-slate-500'} />
            </button>
            {profile?.role === 'Admin' && (
              <button className="btn btn-ghost !h-8 !w-8 p-0 border border-slate-200 bg-white" title="Bảo trì mục lục (Re-index)" onClick={handleReindex}>
                <RefreshCw size={14} className="text-amber-600" />
              </button>
            )}
          </div>
        </div>

        {/* Advanced Smart Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2 bg-slate-50 rounded-md border border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Tên sản phẩm (Gõ chọn)</label>
              <input 
                 list="names-list"
                 className="form-input !h-8 !text-[12px] font-medium" 
                 placeholder="Chọn tên sản phẩm..."
                 value={filterItemName}
                 onChange={e => setF({ filterItemName: e.target.value })}
              />
              <datalist id="names-list">
                 {Array.from(new Set((masterData['item'] || []).map(i => i.value))).map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Mã hàng (Gõ chọn)</label>
              <input 
                 list="codes-list"
                 className="form-input !h-8 !text-[12px] font-medium" 
                 placeholder="Chọn mã hàng..."
                 value={filterItemCode}
                 onChange={e => setF({ filterItemCode: e.target.value })}
              />
              <datalist id="codes-list">
                 {Array.from(new Set((masterData['item'] || []).map(i => i.key))).map(k => <option key={k} value={k} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Số lô</label>
              <input 
                 className="form-input !h-8 !text-[12px] font-medium" 
                 placeholder="Gõ chính xác số lô..."
                 value={filterLotNumber}
                 onChange={e => setF({ filterLotNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Nhà cung cấp</label>
              <select className="form-select !h-8 !py-0 !text-[12px]" value={filterSupplier} onChange={e => setF({ filterSupplier: e.target.value })}>
                <option value="">-- Tất cả --</option>
                {(masterData['supplier'] || []).map(s => <option key={s.key} value={s.key}>{s.value}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>


      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="whitespace-nowrap sticky-left">Mã sự cố</th>
                <th className="whitespace-nowrap">Ngày lập</th>
                <th className="whitespace-nowrap">Nhà cung cấp</th>
                
                {detailClassification && (
                  <>
                    <th className="whitespace-nowrap">Số HĐ</th>
                    <th className="whitespace-nowrap">Phân loại</th>
                    <th className="whitespace-nowrap">Loại SC</th>
                  </>
                )}

                {detailIncident ? (
                  <>
                    <th className="whitespace-nowrap">Mã hàng</th>
                    <th className="whitespace-nowrap">Tên SP</th>
                    <th className="whitespace-nowrap">Số lô</th>
                    <th className="whitespace-nowrap">HSD</th>
                    <th className="whitespace-nowrap text-right">SL</th>
                    <th className="whitespace-nowrap">ĐVT</th>
                    <th className="whitespace-nowrap">LPN</th>
                    <th className="whitespace-nowrap">ASN</th>
                    <th className="whitespace-nowrap">Mô tả lỗi chi tiết</th>
                    <th className="whitespace-nowrap">Ghi chú</th>
                  </>
                ) : (
                  <>
                    <th className="whitespace-nowrap">Sản phẩm (đại diện)</th>
                  </>
                )}

                <th className="whitespace-nowrap">Tag</th>
                <th className="whitespace-nowrap">Bộ phận</th>
                <th className="whitespace-nowrap sticky-right-1">Trạng thái</th>
                <th className="whitespace-nowrap sticky-right-0">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && reports.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="bg-white border-b border-slate-100">
                    {Array.from({ length: detailIncident ? 14 : 7 }).map((_, j) => (
                       <td key={j} className="p-3">
                         <div className="bg-slate-200 animate-pulse h-4 rounded w-3/4"></div>
                       </td>
                    ))}
                  </tr>
                ))
              ) : paginatedRows.length === 0 && !loading ? (
                <tr><td colSpan={15} className="text-center py-10 text-slate-400">Không có dữ liệu</td></tr>
              ) : paginatedRows.map((row, rowIdx) => {
                if (row.type === 'item') {
                  const r = row.report;
                  const item = row.item;
                  const idx = row.itemIndex;
                  const date = r.header.createdDate || '—';

                  return (
                    <tr key={`${r.id}-${item.id || idx}`} className={`${idx > 0 ? 'bg-slate-50/70 translate-z-0' : 'bg-white font-semibold border-t-2 border-slate-100'} h-[45px]`}>
                      <td className="whitespace-nowrap sticky-left">
                        {idx === 0 ? (
                          <Link href={`/dashboard/${r.id}`} className="text-blue-600 hover:underline">
                            {r.reportId}
                          </Link>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-[11px] text-slate-500">{idx === 0 ? formatDateDisplay(date) : ''}</td>
                      <td className="text-[11px] whitespace-nowrap max-w-[120px] truncate">{idx === 0 ? (r.header.supplier || '—') : ''}</td>
                      
                      {detailClassification && (
                        <>
                          <td className="text-[11px] whitespace-nowrap max-w-[100px] truncate">{idx === 0 ? (r.header.invoiceNo || '—') : ''}</td>
                          <td className="text-[11px] whitespace-nowrap max-w-[120px] truncate">{idx === 0 ? ((r.header as any).classification || '—') : ''}</td>
                          <td className="text-[11px] whitespace-nowrap max-w-[120px] truncate">{idx === 0 ? (r.header.incidentType || '—') : ''}</td>
                        </>
                      )}

                      <td className="text-[11px] font-medium whitespace-nowrap">{item.itemCode}</td>
                      <td className="text-[11px] max-w-[150px] truncate" title={item.itemName}>{item.itemName}</td>
                      <td className="text-[11px] whitespace-nowrap">{item.batchNo}</td>
                      <td className="text-[11px] whitespace-nowrap">{formatDateDisplay(item.expiryDate)}</td>
                      <td className="text-[11px] text-right font-bold whitespace-nowrap">{item.quantity}</td>
                      <td className="text-[11px] whitespace-nowrap">{item.unit}</td>
                      <td className="text-[11px] max-w-[120px] truncate" title={item.lpn}>{item.lpn || '—'}</td>
                      <td className="text-[11px] max-w-[120px] truncate" title={item.asn}>{item.asn || '—'}</td>
                      <td className="text-[11px] whitespace-nowrap max-w-[150px] truncate" title={item.detailedDescription}>{item.detailedDescription || '—'}</td>
                      <td className="text-[11px] italic text-slate-500 truncate max-w-[100px]" title={item.note}>{item.note}</td>

                      <td className="whitespace-nowrap">
                        {idx === 0 && r.header.tags ? (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: tags.find(t => t.value === r.header.tags)?.color || '#f59e0b' }}
                          >
                            {r.header.tags}
                          </span>
                        ) : idx === 0 ? '—' : ''}
                      </td>

                      <td className="text-[11px] text-slate-600 whitespace-nowrap">{idx === 0 ? r.header.dept : ''}</td>
                      <td className="whitespace-nowrap sticky-right-1">{idx === 0 ? <StatusBadge status={r.header.status} /> : null}</td>
                      <td className="whitespace-nowrap sticky-right-0">
                        {idx === 0 ? (
                          <div className="flex items-center gap-1">
                            <Link href={`/dashboard/${r.id}/audit`} className="btn btn-icon btn-ghost btn-sm text-blue-600 hover:bg-blue-50" title="Lịch sử">
                              <History size={13} />
                            </Link>
                            {canEdit(r) && (
                              <Link href={`/dashboard/${r.id}/edit`} className="btn btn-icon btn-ghost btn-sm" title="Sửa">
                                <Pencil size={13} />
                              </Link>
                            )}
                            {canDelete(r) && (
                              <button onClick={() => handleDelete(r)} className="btn btn-icon btn-danger !w-7 !h-7" title="Xóa">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                } else {
                  // Summary mode
                  const r = row.data;
                  const date = r.header.createdDate || '—';
                  const firstItem = r.items?.[0];
                  const itemLabel = firstItem
                    ? `${firstItem.itemName || firstItem.itemCode}${r.items.length > 1 ? ` (+${r.items.length - 1})` : ''}`
                    : '—';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 border-t border-slate-100 h-[45px]">
                      <td className="whitespace-nowrap font-medium sticky-left">
                        <Link href={`/dashboard/${r.id}`} className="text-blue-600 hover:underline">
                          {r.reportId}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-sm text-slate-600">{formatDateDisplay(date)}</td>
                      <td className="text-sm whitespace-nowrap max-w-[150px] truncate" title={r.header.supplier}>{r.header.supplier || '—'}</td>

                      {detailClassification && (
                        <>
                          <td className="text-sm whitespace-nowrap max-w-[120px] truncate" title={r.header.invoiceNo}>{r.header.invoiceNo || '—'}</td>
                          <td className="text-sm whitespace-nowrap max-w-[150px] truncate" title={(r.header as any).classification}>{(r.header as any).classification || '—'}</td>
                          <td className="text-sm whitespace-nowrap max-w-[150px] truncate" title={r.header.incidentType}>{r.header.incidentType || '—'}</td>
                        </>
                      )}

                      <td className="max-w-xs truncate text-sm whitespace-nowrap" title={itemLabel}>{itemLabel}</td>
                      <td className="whitespace-nowrap">
                        {r.header.tags ? (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: tags.find(t => t.value === r.header.tags)?.color || '#f59e0b' }}
                          >
                            {r.header.tags}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="text-sm text-slate-600 whitespace-nowrap">{r.header.dept}</td>
                      <td className="whitespace-nowrap sticky-right-1"><StatusBadge status={r.header.status} /></td>
                      <td className="whitespace-nowrap sticky-right-0">
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard/${r.id}/audit`} className="btn btn-icon btn-ghost btn-sm text-blue-600 hover:bg-blue-50" title="Lịch sử">
                            <History size={13} />
                          </Link>
                          {canEdit(r) && (
                            <Link href={`/dashboard/${r.id}/edit`} className="btn btn-icon btn-ghost btn-sm" title="Sửa">
                              <Pencil size={13} />
                            </Link>
                          )}
                          {canDelete(r) && (
                            <button onClick={() => handleDelete(r)} className="btn btn-icon btn-danger !w-7 !h-7" title="Xóa">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>

        {/* Unified Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
           <div className="flex items-center gap-4">
             <div className="text-[13px] text-slate-500 font-medium">
                Đang hiện <strong>{reports.length}</strong> dòng {search ? `cho kết quả "${search}"` : ''}
             </div>
             <div className="flex items-center gap-2 text-[12px] text-slate-500">
                Hiển thị:
                <select
                  className="form-select w-16 !h-7 !py-0 border-slate-300"
                  value={pageSize}
                  onChange={e => setF({ pageSize: Number(e.target.value) })}
                >
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
             </div>
           </div>
           
           {hasMore && (
             <button 
               className={`btn btn-outline !h-8 px-6 text-[12px] font-bold shadow-sm flex items-center gap-2 ${loading ? 'opacity-50' : ''}`} 
               onClick={() => fetchData(true)} 
               disabled={loading}
             >
               {loading ? <RefreshCw size={14} className="animate-spin" /> : null}
               {loading ? 'Đang tải...' : 'Tải thêm dữ liệu ẩn...'}
             </button>
           )}
           
           {!hasMore && reports.length > 0 && (
             <div className="text-[11px] text-slate-400 font-italic">Đã tải hết kết quả phù hợp.</div>
           )}
        </div>
      </div>
    </div>
  );
}
