'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { BBSCReport } from '@/types';
import { subscribeToActiveReports, getArchiveReports, softDeleteReport } from '@/lib/services/reports';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge, ALL_STATUSES } from '@/components/ui/StatusBadge';
import { useAppStore } from '@/stores/appStore';
import { Pencil, Trash2, RefreshCw, Filter, Download, PlusCircle, Search, History, AlertTriangle } from 'lucide-react';
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

  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Manual Search States
  const [appliedFilters, setAppliedFilters] = useState(reportFilters);
  const [isDirty, setIsDirty] = useState(false);

  // Archive specific states
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveLastVisible, setArchiveLastVisible] = useState<any>(null);
  const [hasMoreArchive, setHasMoreArchive] = useState(true);

  // Unpack filters from store (These are our "Draft" filters)
  const {
    search, filterStatus, showAdvanced, filterSupplier, filterClass,
    filterType, filterDept, filterPic, filterTag, filterTerm,
    detailClassification, detailIncident, pageSize, page
  } = reportFilters;

  // Track if any filter change happens to trigger the "Pulsing" button
  useEffect(() => {
    // Basic deep comparison of relevant query filters
    const hasChanged = JSON.stringify(reportFilters) !== JSON.stringify(appliedFilters);
    setIsDirty(hasChanged);
  }, [reportFilters, appliedFilters]);

  const setF = (updates: any) => setReportFilters(updates);

  // Function to actually "Apply" filters
  const handleSearch = useCallback(async (isLoadMore = false) => {
    setAppliedFilters(reportFilters);
    setIsDirty(false);
    
    if (activeTab === 'archive') {
      await loadArchive(isLoadMore);
    }
    // For 'active' tab, the useMemo for filteredReports will auto-update because it depends on appliedFilters
  }, [reportFilters, activeTab]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const depts = masterData['dept'] || [];
  const suppliers = masterData['supplier'] || [];
  const classes = masterData['classification'] || [];
  const types = masterData['incident_type'] || [];
  const pics = masterData['pic'] || [];
  const tags = masterData['tag'] || [];
  
  // Filter status opts based on tab
  const allStatusOpts = (masterData['status'] || []).filter(i => i.isActive);
  const statusOpts = activeTab === 'active' 
    ? allStatusOpts.filter(s => !['Hoàn tất', 'Hủy'].includes(s.value))
    : allStatusOpts.filter(s => ['Hoàn tất', 'Hủy'].includes(s.value));

  const loadActive = useCallback(() => {
    setLoading(true);
    setArchiveError(null);
    return subscribeToActiveReports((data) => {
      setReports(data);
      setLoading(false);
    });
  }, []);

  const loadArchive = useCallback(async (isLoadMore = false) => {
    if (!isLoadMore) {
      setLoading(true);
      setReports([]);
    }
    setArchiveError(null);
    try {
      const { data, lastVisible, indexError } = await getArchiveReports(
        { dept: filterDept, supplier: filterSupplier },
        isLoadMore ? archiveLastVisible : null,
        pageSize
      );
      if (indexError) {
        setArchiveError(indexError);
        setHasMoreArchive(false);
      } else {
        setReports(prev => isLoadMore ? [...prev, ...data] : data);
        setArchiveLastVisible(lastVisible);
        setHasMoreArchive(data.length === pageSize);
      }
    } catch (e: any) {
      toast(e.message || 'Lỗi tải dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterDept, filterSupplier, pageSize, archiveLastVisible]);

  useEffect(() => {
    if (activeTab === 'active') {
      const unsub = loadActive();
      return () => unsub();
    } else {
      // Initial load or tab switch
      handleSearch(false);
    }
  }, [activeTab]); // Only fetch on tab switch or initialization

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
    if (!detailIncident) return filteredReports.map(r => ({ type: 'report', data: r } as const));

    const rows: { type: 'item', report: BBSCReport, item: any, itemIndex: number }[] = [];
    filteredReports.forEach(r => {
      r.items.forEach((item, idx) => {
        rows.push({ type: 'item', report: r, item, itemIndex: idx });
      });
    });
    return rows;
  }, [filteredReports, detailIncident]);

  const totalPages = activeTab === 'active' ? Math.ceil(displayRows.length / pageSize) : 1;
  const paginatedRows = activeTab === 'active' 
    ? displayRows.slice((page - 1) * pageSize, page * pageSize) 
    : displayRows;

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
      if (activeTab === 'archive') {
         loadArchive(false); // Refetch if we are in archive mode to get new items
      }
    } catch (e: any) {
      // Revert on failure
      setReports(originalReports);
      toast(e.message || 'Lỗi thao tác, đã hoàn tác', 'error');
    }
  }

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

  return (
    <div className="flex flex-col gap-2">
      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-md w-fit mb-1 shadow-sm">
        <button 
          className={`px-4 py-1.5 text-[13px] font-medium rounded-sm transition-all ${activeTab === 'active' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('active')}
        >
          {activeTab === 'active' ? `Đang xử lý (${reports.length})` : 'Đang xử lý'}
        </button>
        <button 
          className={`px-4 py-1.5 text-[13px] font-medium rounded-sm transition-all ${activeTab === 'archive' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('archive')}
        >
          Lưu trữ
        </button>
      </div>

      {archiveError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md flex items-start gap-2 text-sm animate-in fade-in">
          <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={18} />
          <div>
            Hệ thống đang cần tạo Index mục lục để tìm kiếm lưu trữ. Bạn là Admin có thể kích hoạt bằng cách 
            <a href={archiveError} target="_blank" rel="noreferrer" className="font-bold underline text-blue-600 hover:text-blue-800 ml-1">
               bấm vào link này
            </a>
          </div>
        </div>
      )}

      {/* Filters Section (Clean Style) */}
      <div className="card !p-1.5 flex flex-col gap-1.5">
        <div className="flex flex-nowrap items-center gap-2">
          {/* Search Box */}
          <div className={`flex items-center bg-white rounded-md border border-slate-300 h-9 px-3 transition-all flex-1 min-w-0 ${activeTab === 'archive' && search === '' ? 'border-amber-200' : 'focus-within:border-blue-500'}`}>
            <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              className="outline-none text-sm w-full py-1 font-medium bg-transparent"
              placeholder={activeTab === 'archive' ? "Gõ BBSC, Số lô... rồi nhấn ENTER" : "Gõ tìm kiếm rồi nhấn ENTER..."}
              value={search}
              onChange={e => setF({ search: e.target.value, page: 1 })}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Search Button (Magnifying Glass) */}
          <button 
            className={`btn btn-primary !h-9 !w-12 p-0 flex items-center justify-center flex-shrink-0 transition-all ${isDirty ? 'animate-pulse ring-4 ring-blue-500/30 shadow-lg' : 'opacity-70'}`}
            onClick={() => handleSearch()}
            title="Thực hiện tìm kiếm (Enter)"
          >
            <Search size={20} strokeWidth={3} />
          </button>

          {/* Status Dropdown */}
          <div className="flex-shrink-0">
            <select
              className="form-select !w-36 !h-9 !py-0 text-[13px] border-slate-300 !bg-white cursor-pointer"
              value={filterStatus}
              onChange={e => setF({ filterStatus: e.target.value, page: 1 })}
            >
              <option value="">-- Trạng thái --</option>
              {statusOpts.map(s => <option key={s.key} value={s.value}>{s.value}</option>)}
              {statusOpts.length === 0 && ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Advanced Filter Button */}
          <button 
            className={`btn btn-ghost !h-9 px-3 flex items-center justify-center border-slate-300 !bg-white hover:bg-slate-50 transition-colors flex-shrink-0 ${showAdvanced ? 'ring-2 ring-blue-100 border-blue-400' : ''}`}
            onClick={() => setF({ showAdvanced: !showAdvanced })}
            title="Bộ lọc nâng cao"
          >
            <Filter size={18} className={showAdvanced ? 'text-blue-600 fill-blue-50' : 'text-slate-600'} />
          </button>

          {/* Checkboxes for detail */}
          <div className="flex items-center gap-3 px-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                type="checkbox" 
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                checked={detailClassification}
                onChange={e => setF({ detailClassification: e.target.checked })}
              />
              <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">Chi tiết phân loại</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                type="checkbox" 
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                checked={detailIncident}
                onChange={e => setF({ detailIncident: e.target.checked })}
              />
              <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">Chi tiết sự cố</span>
            </label>
          </div>

          {/* Create New */}
          <div className="flex-shrink-0">
            <Link href="/create" className="btn btn-primary !h-9 px-4 text-[13px] shadow-sm flex items-center gap-2">
              <PlusCircle size={16} /> Tạo mới
            </Link>
          </div>
        </div>

        {/* Row 2: Advanced Filter Grid (Conditional) */}
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-1.5 p-2 bg-slate-50 rounded-md border border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200 mt-1">
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Nhà cung cấp</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterSupplier} onChange={e => setF({ filterSupplier: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {suppliers.map(s => <option key={s.key} value={s.key}>{s.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Phân loại hàng</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterClass} onChange={e => setF({ filterClass: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {classes.map(c => <option key={c.key} value={c.key}>{c.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Loại sự cố</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterType} onChange={e => setF({ filterType: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {types.map(t => <option key={t.key} value={t.key}>{t.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Bộ phận</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterDept} onChange={e => setF({ filterDept: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {depts.map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">PIC / sub-PIC</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterPic} onChange={e => setF({ filterPic: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {pics.map(p => <option key={p.key} value={p.key}>{p.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Nhãn dán (Tag)</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterTag} onChange={e => setF({ filterTag: e.target.value, page: 1 })}>
                <option value="">-- Tất cả --</option>
                {tags.map(t => <option key={t.key} value={t.key}>{t.value}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Tìm nâng cao trong Ghi chú...</label>
              <div className="flex gap-1">
                <input 
                  className="form-input !h-7 !text-[11px] !bg-white" 
                  placeholder="Từ khóa..." 
                  value={filterTerm}
                  onChange={e => setF({ filterTerm: e.target.value, page: 1 })}
                />
                <button className="btn btn-ghost !h-7 px-2 text-[10px]" onClick={resetFilters}>Xóa lọc</button>
              </div>
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

        {/* Pagination & Footer */}
        {activeTab === 'archive' ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
             <div className="text-sm text-slate-500">Đang hiện {displayRows.length} dòng.</div>
             {hasMoreArchive && (
               <button 
                 className="btn btn-outline py-1 px-4 text-[13px]" 
                 onClick={() => loadArchive(true)} 
                 disabled={loading}
               >
                 {loading ? 'Đang tải...' : 'Tải thêm...'}
               </button>
             )}
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
              Hiển thị
              <select
                className="form-select w-16 py-1 px-2 border-slate-200"
                value={pageSize}
                onChange={e => setF({ pageSize: Number(e.target.value), page: 1 })}
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              dòng/trang. Tổng: <strong>{displayRows.length}</strong> dòng
            </div>
          <div className="pagination">
            <button className="pagination-btn" title="Đầu trang" disabled={page === 1} onClick={() => setF({ page: 1 })}>«</button>
            <button className="pagination-btn" disabled={page === 1} onClick={() => setF({ page: page - 1 })}>‹</button>
            {(() => {
              let start = Math.max(1, page - 2);
              let end = Math.min(totalPages, start + 4);
              if (end === totalPages) start = Math.max(1, totalPages - 4);
              
              const pages = [];
              for (let i = start; i <= end; i++) pages.push(i);
              
              return pages.map(p => (
                <button
                  key={p}
                  className={`pagination-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setF({ page: p })}
                >
                  {p}
                </button>
              ));
            })()}
            <button className="pagination-btn" disabled={page === totalPages} onClick={() => setF({ page: page + 1 })}>›</button>
            <button className="pagination-btn" title="Cuối trang" disabled={page === totalPages} onClick={() => setF({ page: totalPages })}>»</button>
          </div>
        </div>
      )}
    </div>
  </div>
);
}
