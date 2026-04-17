'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { BBSCReport } from '@/types';
import { syncReports, softDeleteReport } from '@/lib/services/reports';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge, ALL_STATUSES } from '@/components/ui/StatusBadge';
import { useAppStore } from '@/stores/appStore';
import { Pencil, Trash2, RefreshCw, Filter, Download, PlusCircle, Search, History, AlertTriangle, X, ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
  const { 
    masterData, reportFilters, setReportFilters, resetReportFilters,
    allReports, lastSync, setAllReports, upsertReports
  } = useAppStore();
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  
  // Search Metadata
  const [appliedFilters, setAppliedFilters] = useState(reportFilters);
  const [isDirty, setIsDirty] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);

  const {
    search, filterStatus, showAdvanced, filterSupplier, filterClass,
    filterType, filterDept, filterPic, filterTag, filterTerm,
    filterItemCode, filterLotNumber, filterItemName,
    detailClassification, detailIncident, pageSize
  } = reportFilters;

  useEffect(() => {
    const hasChanged = JSON.stringify(reportFilters) !== JSON.stringify(appliedFilters);
    setIsDirty(hasChanged);
  }, [reportFilters, appliedFilters]);

  const setF = (updates: any) => setReportFilters(updates);

  // ---- FETCH LOGIC (Unified + Next/Prev Cursors) ----
  const fetchData = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setIndexError(null);
    
    const state = useAppStore.getState();
    const currentFilters = state.reportFilters;

    setAppliedFilters(currentFilters);
    setIsDirty(false);

    try {
      // Dùng syncReports để lấy phần Diff (những gì thay đổi)
      const syncTime = isRefresh ? 0 : state.lastSync;
      const newDocs = await syncReports(syncTime);
      
      if (syncTime === 0) {
        setAllReports(newDocs);
      } else if (newDocs.length > 0) {
        upsertReports(newDocs);
      }
      
      setCurrentPage(0);
    } catch (e: any) {
      toast(e.message || 'Lỗi đồng bộ dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, [setAllReports, upsertReports, toast]);

  useEffect(() => {
    fetchData();
  }, []); // Initial load

  const handleSearch = () => {
    setCurrentPage(0);
    fetchData(); // Vừa lọc local vừa check update từ server
  };

  const handlePageSizeChange = (newSize: number) => {
    setF({ pageSize: newSize });
    setCurrentPage(0);
  };

  const handleReindex = async () => {
    if (!profile || profile.role !== 'Admin') return;
    if (!confirm('Hệ thống sẽ cập nhật lại Mục lục (Mã hàng/Số lô) cho 1400 dòng cũ. Việc này tốn khoảng 1400 lượt Read/Write. Bạn chắc chứ?')) return;
    
    setLoading(true);
    try {
      const { getReportsLegacy, updateReport } = await import('@/lib/services/reports');
      const all = await getReportsLegacy();
      
      toast(`Bắt đầu xử lý ${all.length} dòng...`, 'info');
      
      let count = 0;
      for (const r of all) {
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
    let d = allReports.filter(r => !r.isDeleted);
    
    const { 
      filterDept, filterSupplier, filterStatus, filterClass, filterType, filterTag,
      search, filterItemCode, filterTerm
    } = appliedFilters;

    // 1. Filter Logic (Replicating Server-side logic locally)
    if (filterDept) d = d.filter(r => r.header.dept === filterDept);
    if (filterSupplier) d = d.filter(r => r.header.supplier === filterSupplier);
    if (filterStatus) d = d.filter(r => r.header.status === filterStatus);
    if (filterClass) d = d.filter(r => r.header.classification === filterClass);
    if (filterType) d = d.filter(r => r.header.incidentType === filterType);
    if (filterTag) d = d.filter(r => r.header.tags === filterTag);

    if (search) {
      const s = search.toUpperCase();
      d = d.filter(r => r.reportId.toUpperCase().includes(s));
    }

    if (filterItemCode) {
      d = d.filter(r => r.itemCodes?.includes(filterItemCode));
    }

    if (filterTerm) {
      const term = filterTerm.toLowerCase();
      d = d.filter(r => 
        r.itemNames?.some((name: string) => name.toLowerCase().includes(term)) ||
        r.lotNumbers?.some((lot: string) => lot.toLowerCase().includes(term))
      );
    }

    // 2. Sort Logic
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

    return d;
  }, [allReports, appliedFilters]);

  // Pagination Logic
  const paginatedReports = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  const totalFilteredCount = filteredReports.length;
  const hasMore = (currentPage + 1) * pageSize < totalFilteredCount;

  const displayRows = useMemo(() => {
    if (!detailIncident) return paginatedReports.map(r => ({ type: 'report', data: r } as const));

    const rows: { type: 'item', report: BBSCReport, item: any, itemIndex: number }[] = [];
    paginatedReports.forEach(r => {
      if (!r.items) return;
      r.items.forEach((item: any, idx: number) => {
        rows.push({ type: 'item', report: r, item, itemIndex: idx });
      });
    });
    return rows;
  }, [paginatedReports, detailIncident]);

  async function handleDelete(r: BBSCReport) {
    if (!profile) return;
    const reason = prompt(`Lý do xóa phiếu ${r.reportId}:`);
    if (reason === null) return;
    
    setLoading(true);
    try {
      await softDeleteReport(r.id, profile.uid, profile.displayName, reason);
      toast('Đã xóa phiếu thành công', 'success');
      // Sync lại để cập nhật isDeleted: true
      await fetchData(); 
    } catch (e: any) {
      toast(e.message || 'Lỗi thao tác', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full gap-2 relative overflow-hidden">
      <div className="flex-shrink-0 bg-slate-100 pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-1">
        {indexError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md flex items-start gap-2 text-sm animate-in fade-in mb-2">
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
        <div className="card !p-2 flex flex-col gap-2 shadow-sm border-blue-100 ring-1 ring-black/5">
          <div className="flex flex-nowrap items-center gap-3 w-full">
            {/* Main Smart Search - general item search */}
            <div className={`flex items-center bg-white rounded-md border h-10 px-3 transition-all flex-1 min-w-0 ${filterTerm ? 'ring-2 ring-blue-500/20 border-blue-500' : 'border-slate-300 focus-within:border-blue-500'}`}>
              <Search size={18} className="text-slate-400 mr-2 flex-shrink-0" />
              <input
                className="outline-none text-[13px] w-full py-1 font-semibold bg-transparent"
                placeholder="Gõ Tên sản phẩm hoặc Số lô..."
                value={filterTerm || ''}
                onChange={e => setF({ filterTerm: e.target.value })}
                onKeyDown={handleKeyDown}
              />
              {filterTerm && <X size={14} className="text-slate-400 cursor-pointer hover:text-slate-600 shrink-0" onClick={() => setF({ filterTerm: '' })} />}
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer shrink-0 group">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer" checked={detailClassification} onChange={e => setF({ detailClassification: e.target.checked })} />
              <span className="text-[12px] font-bold text-slate-600 group-hover:text-blue-600 transition-colors whitespace-nowrap hidden lg:block">Phân loại</span>
            </label>
            
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0 group">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer" checked={detailIncident} onChange={e => setF({ detailIncident: e.target.checked })} />
              <span className="text-[12px] font-bold text-slate-600 group-hover:text-blue-600 transition-colors whitespace-nowrap hidden lg:block">Chi tiết hàng</span>
            </label>

            <button 
              className={`btn btn-primary !h-10 !w-12 p-0 flex items-center justify-center flex-shrink-0 transition-all ${isDirty ? 'animate-pulse ring-4 ring-blue-500/30 shadow-lg' : 'opacity-90 shadow-sm'}`}
              onClick={handleSearch}
              title="Lọc toàn bộ dữ liệu (Enter)"
            >
              <Search size={22} strokeWidth={3} />
            </button>

            <button 
              onClick={() => setF({ showAdvanced: !showAdvanced })}
              className={`btn border border-slate-200 !h-10 !w-12 p-0 flex items-center justify-center flex-shrink-0 transition-all ${showAdvanced ? 'bg-blue-50 border-blue-300 text-blue-600 shadow-inner' : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 shadow-sm'}`}
              title="Mở rộng bộ lọc"
            >
              <Filter size={24} strokeWidth={2.5} />
            </button>

            <button 
              onClick={() => { resetReportFilters(); setTimeout(handleSearch, 0); }} 
              className="btn btn-ghost border border-slate-200 !h-10 !w-12 p-0 flex items-center justify-center flex-shrink-0 transition-all bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 shadow-sm" 
              title="Làm mới"
            >
              <RefreshCw size={24} strokeWidth={2.5} className={loading ? 'animate-spin text-blue-500' : ''} />
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1 shrink-0 hidden sm:block"></div>

            <Link href="/create" className="btn btn-primary !h-10 px-4 text-[13px] shadow-sm flex items-center gap-2 shrink-0 hidden sm:flex">
              <PlusCircle size={18} /> Tạo mới
            </Link>
          </div>

          {/* Advanced Smart Filters */}
          {showAdvanced && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 p-3 bg-white rounded-md border border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200 shadow-inner">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Trạng thái</label>
                <select
                  className="form-select !h-9 !py-0 text-[12px] w-full font-medium bg-slate-50 border-slate-200"
                  value={filterStatus || ''}
                  onChange={e => setF({ filterStatus: e.target.value })}
                >
                  <option value="">-- Tất cả --</option>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Bộ phận</label>
                <select className="form-select !h-9 !py-0 text-[12px] w-full font-medium bg-slate-50 border-slate-200" value={filterDept || ''} onChange={e => setF({ filterDept: e.target.value })}>
                  <option value="">-- Tất cả --</option>
                  {(masterData['dept'] || []).map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
                </select>
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Nhà cung cấp</label>
                <input 
                   list="suppliers-list"
                   className="form-input !h-9 !text-[12px] w-full font-medium bg-slate-50 border-slate-200" 
                   placeholder="Chọn hoặc gõ tên..."
                   value={filterSupplier || ''}
                   onChange={e => setF({ filterSupplier: e.target.value })}
                />
                <datalist id="suppliers-list">
                   {(masterData['supplier'] || []).map(s => <option key={s.key} value={s.key}>{s.value}</option>)}
                </datalist>
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Mã sự cố</label>
                <input 
                   className="form-input !h-9 !text-[12px] w-full font-medium bg-slate-50 border-slate-200" 
                   placeholder="Ví dụ: BBSC-0001..."
                   value={search || ''}
                   onChange={e => setF({ search: e.target.value.toUpperCase() })}
                   onKeyDown={handleKeyDown}
                />
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Mã hàng</label>
                <input 
                   list="codes-list"
                   className="form-input !h-9 !text-[12px] w-full font-medium bg-slate-50 border-slate-200" 
                   placeholder="Gõ mã hàng..."
                   value={filterItemCode || ''}
                   onChange={e => setF({ filterItemCode: e.target.value })}
                />
                <datalist id="codes-list">
                   {Array.from(new Set((masterData['item'] || []).map(i => i.key))).map(k => <option key={k} value={k} />)}
                </datalist>
              </div>

              {profile?.role === 'Admin' && (
                <div className="col-span-full pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 italic max-w-lg">
                    <Info size={14} className="text-blue-500 shrink-0" />
                    <span>Dành cho Admin: Nếu dữ liệu cũ không tìm thấy bằng Tìm kiếm chung, hãy đồng bộ lại 1 lần.</span>
                  </div>
                  <button className="btn btn-ghost !h-8 px-3 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1.5 text-[11px] font-bold shrink-0 shadow-sm" onClick={handleReindex}>
                    <AlertTriangle size={13} />
                    Bảo trì mục lục
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div className="card p-0 overflow-hidden flex flex-col border shadow-md flex-1 min-h-0">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="data-table min-w-[1600px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-800">
                <th className="whitespace-nowrap sticky-left z-50" style={{ top: 0 }}>Mã sự cố</th>
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
              {loading && allReports.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="bg-white border-b border-slate-100">
                    {Array.from({ length: detailIncident ? 14 : 7 }).map((_, j) => (
                       <td key={j} className="p-3">
                         <div className="bg-slate-200 animate-pulse h-4 rounded w-3/4"></div>
                       </td>
                    ))}
                  </tr>
                ))
              ) : displayRows.length === 0 && !loading ? (
                <tr><td colSpan={15} className="text-center py-10 text-slate-400">Không có dữ liệu</td></tr>
              ) : displayRows.map((row, rowIdx) => {
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

        <div className="flex flex-wrap items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 gap-4">
           <div className="flex flex-wrap items-center gap-4">
             <div className="text-[13px] text-slate-500 font-medium">
                Đang xem trang <strong>{currentPage + 1}</strong> <span className="text-slate-400">({paginatedReports.length} dòng)</span>
                <span className="ml-1 text-slate-500">trong <strong>{totalFilteredCount.toLocaleString()}</strong> kết quả</span>
             </div>
             <div className="flex items-center gap-2 text-[12px] text-slate-500">
                Hiển thị:
                <select
                  className="form-select w-16 !h-7 !py-0 border-slate-300 bg-white"
                  value={pageSize}
                  onChange={e => handlePageSizeChange(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
             <button 
                className={`btn btn-outline !h-8 px-4 text-[12px] font-bold bg-white shadow-sm flex items-center gap-1 transition-all ${currentPage === 0 || loading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`} 
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} 
                disabled={currentPage === 0 || loading}
                title="Trang trước"
             >
               <ChevronLeft size={16} />
               <span className="hidden sm:inline">Trang trước</span>
             </button>

             <button 
                className={`btn btn-primary !h-8 px-4 text-[12px] font-bold shadow-sm flex items-center gap-1 transition-all ${!hasMore || loading ? 'opacity-40 cursor-not-allowed' : ''}`} 
                onClick={() => setCurrentPage(prev => prev + 1)} 
                disabled={!hasMore || loading}
                title="Trang sau"
             >
               <span className="hidden sm:inline">Trang sau</span>
               <ChevronRight size={16} />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
