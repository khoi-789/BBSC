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

  const [picUsers, setPicUsers] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    // Load PIC users list for the filter
    const { getPicUsers } = require('@/lib/services/users');
    getPicUsers().then(setPicUsers);
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

  const urgentTypes = useMemo(() => new Set(
    (masterData['incident_type'] || [])
      .filter(t => t.isUrgent)
      .map(t => t.value)
  ), [masterData]);

  // Determine effective filter options for PIC based on role
  const picOptions = useMemo(() => {
    if (profile?.role === 'Admin') {
      return picUsers;
    }
    // Non-admins only see themselves if they are PICs
    return picUsers.filter(u => u.linkedPic === profile?.linkedPic || u.displayName === profile?.displayName);
  }, [picUsers, profile]);

  // For non-admin, force filter to their own identity if they haven't selected anything else
  // Note: the `filtered` logic already handles matching both pic and subPic
  const effectiveFilterUser = useMemo(() => {
    if (profile?.role === 'Admin') return filterUser;
    
    // For non-admin, if they haven't picked a specific user, default to their own identifier
    // Alternatively, just matching their exact identifier always if they try to see others
    // We'll enforce that they can only filter by themselves anyway since picOptions limits it.
    if (filterUser) return filterUser;
    
    return profile?.linkedPic || profile?.displayName || '';
  }, [filterUser, profile]);


  const filtered = useMemo(() => {
    return reports.filter(r => {
      // Use effective filter user which enforces non-admin to only see their own
      const matchUser = !effectiveFilterUser || r.header.pic === effectiveFilterUser || r.header.subPic === effectiveFilterUser;
      const matchType = !filterType || r.header.incidentType === filterType;
      const matchClass = !filterClass || r.header.classification === filterClass;
      const matchStatus = !filterStatus || r.header.status === filterStatus;
      const matchSearch = !searchProduct || 
        r.items.some(i => i.itemName?.toLowerCase().includes(searchProduct.toLowerCase()) || i.itemCode?.toLowerCase().includes(searchProduct.toLowerCase())) ||
        r.reportId.toLowerCase().includes(searchProduct.toLowerCase());
      
      const isUrgentTag = r.header.tags === 'Gấp' || r.header.tags?.toLowerCase().includes('hold');
      const matchUrgent = !onlyUrgent || isUrgentTag || urgentTypes.has(r.header.incidentType);

      return matchUser && matchType && matchClass && matchStatus && matchSearch && matchUrgent;
    }).sort((a, b) => {
      // Priority 1: Configuration Urgency OR Tag Urgency
      const aUrgent = urgentTypes.has(a.header.incidentType) || a.header.tags === 'Gấp' || a.header.tags?.toLowerCase().includes('hold');
      const bUrgent = urgentTypes.has(b.header.incidentType) || b.header.tags === 'Gấp' || b.header.tags?.toLowerCase().includes('hold');

      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;

      // Priority 2: Stale time (oldest update first)
      const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
      const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
      return aTime - bTime;
    });
  }, [reports, effectiveFilterUser, filterType, filterClass, filterStatus, searchProduct, onlyUrgent, urgentTypes]);

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
          <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">PIC/sub-PIC</label>
          {profile?.role === 'Admin' ? (
            <select className="form-select !h-9 !py-1 !text-xs !w-40" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
              <option value="">-- Tất cả --</option>
              {picOptions.map(p => <option key={p.uid} value={p.linkedPic || p.displayName}>{p.displayName}</option>)}
            </select>
          ) : (
            <div className="form-select !h-9 !py-1 !text-xs !w-40 bg-slate-50 text-slate-500 flex items-center line-clamp-1 truncate select-none border border-slate-200 rounded-lg">
              {profile?.displayName}
            </div>
          )}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(r => {
            const staleLevel = getStaleLevel(r);
            const lastTask = r.tasks?.[r.tasks.length - 1];
            const isUrgentConfig = urgentTypes.has(r.header.incidentType);
            const isUrgentTag = r.header.tags === 'Gấp' || r.header.tags?.toLowerCase().includes('hold');
            const isGap = isUrgentConfig || isUrgentTag;

            return (
              <div key={r.id} className={`group relative bg-white rounded-2xl border-2 transition-all duration-300 p-2.5 flex flex-col gap-1.5 shadow-sm hover:shadow-xl ${isGap ? 'border-l-4 border-l-red-600 border-red-100' : staleLevel > 0 ? 'border-red-100' : 'border-slate-100 hover:border-blue-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/${r.id}`} className="text-blue-700 font-black text-[11px] hover:underline tracking-tight">
                      {r.reportId}
                    </Link>
                    {isGap && <span className="px-1 py-0.5 bg-red-600 text-white font-black text-[7px] rounded uppercase shadow-sm">GẤP</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={r.header.status} />
                    <Link href={`/dashboard/${r.id}/edit`} className="p-1 text-slate-300 hover:text-blue-600 transition-colors">
                      <Pencil size={11} />
                    </Link>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-lg p-2 flex flex-col gap-0.5 border border-slate-100/50">
                  <div className="text-[10px] leading-tight flex gap-1.5"><span className="text-slate-400 font-bold uppercase text-[8px] w-12 shrink-0">Loại lỗi:</span> <span className="font-bold text-slate-700 truncate">{r.header.incidentType || '—'}</span></div>
                  <div className="text-[10px] leading-tight flex gap-1.5"><span className="text-slate-400 font-bold uppercase text-[8px] w-12 shrink-0">Sản phẩm:</span> <span className="font-bold text-slate-700 truncate" title={r.items[0]?.itemName}>{r.items[0]?.itemName || '—'}</span></div>
                  <div className="text-[10px] leading-tight flex gap-1.5"><span className="text-slate-400 font-bold uppercase text-[8px] w-12 shrink-0">NCC:</span> <span className="font-bold text-slate-700 truncate">{r.header.supplier || '—'}</span></div>
                  <div className="text-[10px] leading-tight flex gap-1.5"><span className="text-slate-400 font-bold uppercase text-[8px] w-12 shrink-0">PIC:</span> <span className="font-bold text-blue-600">{r.header.pic || '—'}</span></div>
                </div>

                {staleLevel > 0 && (
                  <div className="flex items-center gap-1.5 p-1 bg-red-50 rounded-lg border border-red-100 animate-pulse">
                    <AlertTriangle size={10} className="text-red-600 shrink-0" />
                    <span className="text-[8px] font-black text-red-700 uppercase leading-none">
                      {staleLevel === 2 ? 'Quá 1 tháng!' : 'Quá 2 tuần!'}
                    </span>
                  </div>
                )}

                <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg italic line-clamp-2 min-h-[30px] leading-snug">
                  {lastTask ? lastTask.content : 'Chưa có ghi chú nào...'}
                </div>

                <div className="flex gap-1.5 mt-0.5">
                  <input
                    type="text"
                    className="form-input !h-6 !text-[10px] bg-white border-slate-200 focus:border-blue-400 !py-0 !px-2 rounded-md"
                    placeholder="Tiến độ..."
                    value={progressMap[r.id] || ''}
                    onChange={e => setProgressMap(p => ({ ...p, [r.id]: e.target.value }))}
                  />
                  <button
                    className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all shadow-sm shrink-0"
                    onClick={() => handleUpdateProgress(r)}
                  >
                    <TrendingUp size={11} />
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
