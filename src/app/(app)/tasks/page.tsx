'use client';
import { useEffect, useState } from 'react';
import { getReports } from '@/lib/services/reports';
import { updateReport } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AlertTriangle, Pencil, Search, CheckSquare, RefreshCw, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function TasksPage() {
  const { profile } = useAuthStore();
  const { masterData } = useAppStore();
  const { toast } = useToast();
  
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, string>>({});
  
  // Local filter states
  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [onlyUrgent, setOnlyUrgent] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const data = await getReports();
    const active = data.filter(r => !r.isDeleted && !['Hoàn tất', 'Hủy'].includes(r.header.status));
    setReports(active);
    
    const pm: Record<string, string> = {};
    active.forEach(r => {
      pm[r.id] = '';
    });
    setProgressMap(pm);
    setLoading(false);
  }

  const getStaleLevel = (r: BBSCReport) => {
    if (!r.updatedAt || !r.updatedAt.toDate) return 0;
    const ms = Date.now() - r.updatedAt.toDate().getTime();
    if (ms > 30 * 24 * 60 * 60 * 1000) return 2; // 1 month
    if (ms > 14 * 24 * 60 * 60 * 1000) return 1; // 2 weeks
    return 0;
  };

  const filtered = useMemo(() => {
    return reports.filter(r => {
      const matchUser = !filterUser || r.header.pic === filterUser || r.header.subPic === filterUser;
      const matchType = !filterType || r.header.incidentType === filterType;
      const matchClass = !filterClass || r.header.classification === filterClass;
      const matchStatus = !filterStatus || r.header.status === filterStatus;
      const matchSearch = !searchProduct || 
        r.items.some(i => i.itemName?.toLowerCase().includes(searchProduct.toLowerCase()) || i.itemCode?.toLowerCase().includes(searchProduct.toLowerCase())) ||
        r.reportId.toLowerCase().includes(searchProduct.toLowerCase());
      
      const isUrgent = r.header.tags === 'Gấp' || r.header.tags?.toLowerCase().includes('hold');
      const matchUrgent = !onlyUrgent || isUrgent;

      return matchUser && matchType && matchClass && matchStatus && matchSearch && matchUrgent;
    });
  }, [reports, filterUser, filterType, filterClass, filterStatus, searchProduct, onlyUrgent]);

  const urgentCount = reports.filter(r => r.header.tags === 'Gấp' || r.header.tags?.toLowerCase().includes('hold')).length;

  async function handleUpdateProgress(r: BBSCReport) {
    if (!profile) return;
    const content = progressMap[r.id];
    if (!content?.trim()) return;
    try {
      const newTask = {
        id: Date.now().toString(),
        content,
        progress: content,
        note: '',
        updatedAt: new Date().toISOString(),
        updatedBy: profile.displayName,
      };
      await updateReport(r.id, { tasks: [...(r.tasks || []), newTask] }, profile.uid, profile.displayName, 'Cập nhật tiến độ');
      toast('Đã cập nhật tiến độ', 'success');
      loadData();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 to-indigo-800 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <CheckSquare size={32} className="text-blue-300" />
              TIẾN ĐỘ & NHẮC NHỞ
            </h1>
            <p className="text-blue-100/80 font-medium">Theo dõi và thúc đẩy xử lý các sự cố tồn đọng theo thời gian thực.</p>
          </div>
          
          <div className="flex gap-4">
             <div className="bg-red-500/10 backdrop-blur border border-red-500/30 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[140px] shadow-lg">
                <span className="text-[10px] font-black text-red-200 uppercase tracking-widest">Cần xử lý gấp</span>
                <span className="text-3xl font-black text-white">{urgentCount}</span>
             </div>
             <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[140px] shadow-lg">
                <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest">Việc tồn đọng</span>
                <span className="text-3xl font-black text-white">{reports.length}</span>
             </div>
          </div>
        </div>
      </div>

      {/* Filter Bar (Horizontal) */}
      <div className="card !p-3 flex flex-wrap items-center gap-4 shadow-sm border border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-30">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nhân viên PIC</label>
          <select className="form-select !h-9 !py-1 !text-xs !w-40" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['pic']?.map(p => <option key={p.key} value={p.key}>{p.value}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Loại sự cố</label>
          <select className="form-select !h-9 !py-1 !text-xs !w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['incident_type']?.map(i => <option key={i.key} value={i.key}>{i.value}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Phân loại hàng</label>
          <select className="form-select !h-9 !py-1 !text-xs !w-40" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['classification']?.map(c => <option key={c.key} value={c.key}>{c.value}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tên sản phẩm / Mã BBSC</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              className="form-input !h-9 !pl-8 !text-xs" 
              placeholder="Nhập tên SP..." 
              value={searchProduct}
              onChange={e => setSearchProduct(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-4 pt-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="rounded text-blue-600" checked={onlyUrgent} onChange={e => setOnlyUrgent(e.target.checked)} />
            <span className="text-xs font-bold text-slate-600">Chỉ hiện phiếu GẤP</span>
          </label>
          <button className="btn btn-ghost !h-9 !text-xs gap-2" onClick={() => { setFilterUser(''); setFilterType(''); setFilterClass(''); setFilterStatus(''); setSearchProduct(''); setOnlyUrgent(false); }}>
            <RefreshCw size={14} /> Tải lại
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Đang tải dữ liệu tiến độ...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(r => {
            const staleLevel = getStaleLevel(r);
            const lastTask = r.tasks?.[r.tasks.length - 1];
            const isGap = r.header.tags === 'Gấp' || r.header.tags?.toLowerCase().includes('hold');

            return (
              <div key={r.id} className={`group bg-white rounded-2xl border-2 transition-all duration-300 p-4 flex flex-col gap-3 shadow-sm hover:shadow-xl ${staleLevel > 0 ? 'border-red-100' : 'border-slate-100 hover:border-blue-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/${r.id}`} className="text-blue-700 font-black text-xs hover:underline tracking-tight">
                      {r.reportId}
                    </Link>
                    {isGap && <span className="px-1.5 py-0.5 bg-red-600 text-white font-black text-[8px] rounded uppercase shadow-sm animate-pulse">GẤP</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={r.header.status} />
                    <Link href={`/dashboard/${r.id}/edit`} className="p-1.5 text-slate-300 hover:text-blue-600 transition-colors">
                      <Pencil size={14} />
                    </Link>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 flex flex-col gap-1.5 border border-slate-100/50">
                  <div className="text-[11px] leading-tight"><span className="text-slate-400 font-bold uppercase text-[9px]">Loại lỗi:</span> <span className="font-bold text-slate-700">{r.header.incidentType || '—'}</span></div>
                  <div className="text-[11px] leading-tight"><span className="text-slate-400 font-bold uppercase text-[9px]">Sản phẩm:</span> <span className="font-bold text-slate-700 line-clamp-1">{r.items[0]?.itemName || '—'}</span></div>
                  <div className="text-[11px] leading-tight grow"><span className="text-slate-400 font-bold uppercase text-[9px]">NCC:</span> <span className="font-bold text-slate-700">{r.header.supplier || '—'}</span></div>
                  <div className="text-[11px] leading-tight"><span className="text-slate-400 font-bold uppercase text-[9px]">Người xử lý:</span> <span className="font-bold text-blue-600">{r.header.pic || '—'}</span></div>
                </div>

                {staleLevel > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 rounded-xl border border-red-100 animate-pulse">
                    <AlertTriangle size={14} className="text-red-600 shrink-0" />
                    <span className="text-[10px] font-black text-red-700 uppercase leading-none">
                      {staleLevel === 2 ? 'Đã hơn 1 tháng chưa cập nhật!' : 'Đã hơn 2 tuần chưa cập nhật!'}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                   <div className="text-[10px] text-slate-400 font-bold uppercase ml-1 italic">(Ghi chú mới nhất)</div>
                    <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-xl italic line-clamp-2 min-h-[40px]">
                      {lastTask ? lastTask.content : 'Chưa có ghi chú nào...'}
                    </div>
                </div>

                <div className="flex gap-2 mt-auto">
                  <input
                    type="text"
                    className="form-input !h-8 !text-[11px] bg-white border-slate-200 focus:border-blue-400"
                    placeholder="Nhập tiến độ mới..."
                    value={progressMap[r.id] || ''}
                    onChange={e => setProgressMap(p => ({ ...p, [r.id]: e.target.value }))}
                  />
                  <button
                    className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-md shadow-blue-200 shrink-0"
                    onClick={() => handleUpdateProgress(r)}
                  >
                    <TrendingUp size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
