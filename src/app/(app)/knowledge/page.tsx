'use client';
import { useState, useEffect, useMemo } from 'react';
import { getReports } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { Search, BookOpen, Calendar, ArrowRight, Eye, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function KnowledgeBase() {
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [searchDetail, setSearchDetail] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getReports();
        // Only show valid reports that are not deleted
        setReports(data.filter(r => !r.isDeleted));
      } catch (error) {
        console.error('Error loading knowledge base:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Flatten reports to items for individual "Case Study" cards
  const cases = useMemo(() => {
    const flatCases: { 
      reportId: string, 
      id: string,
      docId: string,
      incidentType: string, 
      itemName: string,
      phenomenon: string,
      solution: string,
      date: string
    }[] = [];

    reports.forEach(r => {
      r.items.forEach((item, idx) => {
        flatCases.push({
          reportId: r.reportId,
          id: `${r.id}-${idx}`,
          docId: r.id,
          incidentType: r.header.incidentType,
          itemName: item.itemName || '—',
          phenomenon: item.note || r.header.note || 'Không có mô tả chi tiết',
          solution: r.header.immediateAction || 'Chưa cập nhật giải pháp',
          date: r.header.createdDate
        });
      });
    });

    return flatCases.filter(c => {
      const matchText = !searchText || 
        c.itemName.toLowerCase().includes(searchText.toLowerCase()) || 
        c.reportId.toLowerCase().includes(searchText.toLowerCase());
      
      const matchDetail = !searchDetail || 
        c.phenomenon.toLowerCase().includes(searchDetail.toLowerCase()) ||
        c.solution.toLowerCase().includes(searchDetail.toLowerCase()) ||
        c.incidentType.toLowerCase().includes(searchDetail.toLowerCase());
        
      return matchText && matchDetail;
    }).sort((a,b) => b.date.localeCompare(a.date));
  }, [reports, searchText, searchDetail]);

  const formatDate = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 scale-150 rotate-12"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-10 -mb-10"></div>
        
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <BookOpen size={32} className="text-blue-200" />
              THAM KHẢO CÁCH XỬ LÝ
            </h1>
            <p className="text-blue-100/80 font-medium max-w-xl text-sm">
              Tra cứu nhanh các tình huống tương tự đã từng gặp trong quá khứ để đưa ra giải pháp xử lý tối ưu.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
             <div className="relative min-w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300" size={18} />
                <input 
                  type="text" 
                  placeholder="Tìm BBSC, Tên hàng..." 
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-10 pr-4 text-white placeholder:text-blue-200/50 outline-none focus:bg-white/20 transition-all text-sm font-semibold"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                />
             </div>
             <div className="relative min-w-[320px]">
                <Info className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300" size={18} />
                <input 
                  type="text" 
                  placeholder="Tìm trong Hiện tượng, Giải pháp..." 
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-10 pr-4 text-white placeholder:text-blue-200/50 outline-none focus:bg-white/20 transition-all text-sm font-semibold"
                  value={searchDetail}
                  onChange={e => setSearchDetail(e.target.value)}
                />
             </div>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold animate-pulse uppercase tracking-widest text-[10px]">Đang tải dữ liệu tri thức...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {cases.map((c) => (
            <div key={c.id} className="group relative bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col gap-4 overflow-hidden">
              {/* Header: Incident Type */}
              <div className="flex items-center justify-between">
                <div className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] uppercase font-black tracking-wider">
                  {c.incidentType}
                </div>
                <Link href={`/dashboard/${c.docId}`} className="text-slate-300 hover:text-blue-600 transition-all hover:scale-110">
                  <Eye size={18} />
                </Link>
              </div>

              {/* Title: Product Name */}
              <h3 className="text-[14px] font-black text-slate-800 leading-tight line-clamp-2 min-h-[36px] group-hover:text-blue-700 transition-colors">
                {c.itemName}
              </h3>

              {/* Phenomenon (HT) - Orange box style */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-orange-50 border border-orange-100">
                <div className="flex items-center gap-1.5 text-orange-700 font-black text-[9px] uppercase tracking-wider">
                  <AlertTriangle size={12} /> Hiện tượng (HT)
                </div>
                <div className="text-[12px] text-orange-900/80 font-semibold leading-snug line-clamp-3 italic">
                  {c.phenomenon}
                </div>
              </div>

              {/* Solution - Green box style */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-1.5 text-emerald-700 font-black text-[9px] uppercase tracking-wider">
                  <CheckCircle2 size={12} /> Giải pháp xử lý
                </div>
                <div className="text-[12px] text-emerald-900/80 font-semibold leading-snug line-clamp-3">
                  {c.solution}
                </div>
              </div>

              {/* Footer: ID & Date */}
              <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[10px] font-bold text-slate-400">
                  {c.reportId}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                  <Calendar size={12} />
                  {formatDate(c.date)}
                </div>
              </div>

              {/* Hover effect decoration */}
              <div className="absolute top-0 left-0 w-1 h-0 bg-blue-600 group-hover:h-full transition-all duration-300"></div>
            </div>
          ))}

          {cases.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <BookOpen size={48} className="text-slate-300" />
              <div className="text-slate-400 font-bold uppercase tracking-wider text-sm">Không tìm thấy tình huống phù hợp</div>
              <button 
                onClick={() => { setSearchText(''); setSearchDetail(''); }}
                className="text-blue-600 text-xs font-bold hover:underline"
              >
                Xóa tất cả bộ lọc
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
