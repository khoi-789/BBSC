'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { BBSCReport } from '@/types';
import { getReports, softDeleteReport } from '@/lib/services/reports';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge, ALL_STATUSES } from '@/components/ui/StatusBadge';
import { useAppStore } from '@/stores/appStore';
import { Pencil, Trash2, RefreshCw, Filter, Download, PlusCircle, Search } from 'lucide-react';
import { format } from 'date-fns';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr || dateStr === '—' || !dateStr.includes('-')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  // Handle yyyy-MM-dd -> dd/MM/yyyy
  if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

export default function ReportTable() {
  const { profile } = useAuthStore();
  const { masterData } = useAppStore();
  const { toast } = useToast();

  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterPic, setFilterPic] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterTerm, setFilterTerm] = useState(''); 

  const [detailClassification, setDetailClassification] = useState(true);
  const [detailIncident, setDetailIncident] = useState(false);

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const depts = masterData['dept'] || [];
  const suppliers = masterData['supplier'] || [];
  const classes = masterData['classification'] || [];
  const types = masterData['incident_type'] || [];
  const pics = masterData['pic'] || [];
  const tags = masterData['tag'] || [];
  const statusOpts = (masterData['status'] || []).filter(i => i.isActive);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReports();
      setReports(data);
      setPage(1);
    } catch (e: any) {
      toast(e.message || 'Lỗi tải dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredReports = useMemo(() => {
    let d = [...reports];
    
    // Custom Sort: Year (yy) DESC, Sequence (xxxx) DESC
    d.sort((a, b) => {
      // BBSC-xxxx-mmyy
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

    if (filterStatus) d = d.filter(r => r.header.status === filterStatus);
    if (filterSupplier) d = d.filter(r => r.header.supplier === filterSupplier);
    if (filterDept) d = d.filter(r => r.header.dept === filterDept);
    if (filterPic) d = d.filter(r => r.header.pic === filterPic || r.header.subPic === filterPic);
    if (filterType) d = d.filter(r => r.header.incidentType === filterType);
    if (filterTag) d = d.filter(r => r.header.tags === filterTag);
    
    if (search || filterTerm) {
      const s = (search || filterTerm).toLowerCase();
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
    
    if (filterClass) {
      d = d.filter(r => r.items.some(i => i.issueType === filterClass));
    }

    return d;
  }, [reports, filterStatus, filterSupplier, filterDept, filterPic, filterType, filterTag, filterClass, search, filterTerm]);

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

  const totalPages = Math.ceil(displayRows.length / pageSize);
  const paginatedRows = displayRows.slice((page - 1) * pageSize, page * pageSize);

  function resetFilters() {
    setSearch('');
    setFilterStatus('');
    setFilterSupplier('');
    setFilterClass('');
    setFilterType('');
    setFilterDept('');
    setFilterPic('');
    setFilterTag('');
    setFilterTerm('');
    setPage(1);
  }

  async function handleDelete(r: BBSCReport) {
    if (!profile) return;
    const reason = prompt(`Lý do xóa phiếu ${r.reportId}:`);
    if (reason === null) return;
    try {
      await softDeleteReport(r.id, profile.uid, profile.displayName, reason);
      toast('Đã xóa phiếu thành công', 'success');
      load();
    } catch (e: any) {
      toast(e.message, 'error');
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
      {/* Filters Section (Clean Style) */}
      <div className="card !p-1.5 flex flex-col gap-1.5">
        <div className="flex flex-nowrap items-center gap-2">
          {/* Search Box - Flex-1 to take remaining space */}
          <div className="flex items-center bg-white rounded-md border border-slate-300 h-9 px-3 focus-within:border-blue-500 transition-all flex-1 min-w-0">
            <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              className="outline-none text-sm w-full py-1 font-medium bg-transparent"
              placeholder="Tìm theo BBSC, Số lô, Tên hàng..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Status Dropdown - Fixed width */}
          <div className="flex-shrink-0">
            <select
              className="form-select !w-36 !h-9 !py-0 text-[13px] border-slate-300 !bg-white cursor-pointer"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">-- Trạng thái --</option>
              {statusOpts.map(s => <option key={s.key} value={s.value}>{s.value}</option>)}
              {statusOpts.length === 0 && ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Advanced Filter Button */}
          <button 
            className={`btn btn-ghost !h-9 px-3 flex items-center justify-center border-slate-300 !bg-white hover:bg-slate-50 transition-colors flex-shrink-0 ${showAdvanced ? 'ring-2 ring-blue-100 border-blue-400' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
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
                onChange={e => setDetailClassification(e.target.checked)}
              />
              <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">Chi tiết phân loại</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                type="checkbox" 
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                checked={detailIncident}
                onChange={e => setDetailIncident(e.target.checked)}
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
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                <option value="">-- Tất cả --</option>
                {suppliers.map(s => <option key={s.key} value={s.key}>{s.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Phân loại hàng</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="">-- Tất cả --</option>
                {classes.map(c => <option key={c.key} value={c.key}>{c.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Loại sự cố</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">-- Tất cả --</option>
                {types.map(t => <option key={t.key} value={t.key}>{t.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Bộ phận</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                <option value="">-- Tất cả --</option>
                {depts.map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">PIC / sub-PIC</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterPic} onChange={e => setFilterPic(e.target.value)}>
                <option value="">-- Tất cả --</option>
                {pics.map(p => <option key={p.key} value={p.key}>{p.value}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 block">Nhãn dán (Tag)</label>
              <select className="form-select !h-7 !py-0 !text-[11px] !bg-white" value={filterTag} onChange={e => setFilterTag(e.target.value)}>
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
                  onChange={e => setFilterTerm(e.target.value)}
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
                <th className="whitespace-nowrap rounded-tl-lg">Mã sự cố</th>
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
                    <th className="whitespace-nowrap">Tag</th>
                  </>
                )}

                <th className="whitespace-nowrap">Bộ phận</th>
                <th className="whitespace-nowrap">Trạng thái</th>
                <th className="whitespace-nowrap rounded-tr-lg">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} className="text-center py-10 text-slate-400">Đang tải...</td></tr>
              ) : paginatedRows.length === 0 ? (
                <tr><td colSpan={15} className="text-center py-10 text-slate-400">Không có dữ liệu</td></tr>
              ) : paginatedRows.map((row, rowIdx) => {
                if (row.type === 'item') {
                  const r = row.report;
                  const item = row.item;
                  const idx = row.itemIndex;
                  const date = r.header.createdDate || '—';

                  return (
                    <tr key={`${r.id}-${item.id || idx}`} className={`${idx > 0 ? 'bg-slate-50/70 translate-z-0' : 'bg-white font-semibold border-t-2 border-slate-100'} h-[45px]`}>
                      <td className="whitespace-nowrap">
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

                      <td className="text-[11px] text-slate-600 whitespace-nowrap">{idx === 0 ? r.header.dept : ''}</td>
                      <td className="whitespace-nowrap">{idx === 0 ? <StatusBadge status={r.header.status} /> : null}</td>
                      <td className="whitespace-nowrap">
                        {idx === 0 ? (
                          <div className="flex items-center gap-1">
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
                      <td className="whitespace-nowrap font-medium">
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
                      <td className="whitespace-nowrap"><StatusBadge status={r.header.status} /></td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
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

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
            Hiển thị
            <select
              className="form-select w-16 py-1 px-2 border-slate-200"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            dòng/trang. Tổng: <strong>{displayRows.length}</strong> dòng
          </div>
          <div className="pagination">
            <button className="pagination-btn" title="Đầu trang" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
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
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ));
            })()}
            <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="pagination-btn" title="Cuối trang" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
}
