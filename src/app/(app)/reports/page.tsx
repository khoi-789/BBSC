'use client';
import { useEffect, useState, useMemo } from 'react';
import { getReports } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Treemap
} from 'recharts';
import { Filter, Calendar, BarChart3, PieChart as PieIcon, Activity, TrendingUp, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isWithinInterval, parseISO } from 'date-fns';

const COLORS = ['#1a56a0', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export default function ReportsPage() {
  const { masterData, loadMasterData, isMasterDataLoaded } = useAppStore();
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 6), 'yyyy-MM-01'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    if (!isMasterDataLoaded) loadMasterData();
    getReports().then(data => {
      setReports(data);
      setLoading(false);
    });
  }, [isMasterDataLoaded, loadMasterData]);

  const filteredData = useMemo(() => {
    return reports.filter(r => {
      const date = parseISO(r.header.createdDate);
      const start = parseISO(dateFrom);
      const end = parseISO(dateTo);
      const inDate = isWithinInterval(date, { start, end });
      const inDept = filterDept ? r.header.dept === filterDept : true;
      const inType = filterType ? r.header.incidentType === filterType : true;
      return inDate && inDept && inType;
    });
  }, [reports, dateFrom, dateTo, filterDept, filterType]);

  // --- Data Processors ---
  
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      counts[r.header.status] = (counts[r.header.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const monthlyTrend = useMemo(() => {
    const start = startOfMonth(parseISO(dateFrom));
    const end = endOfMonth(parseISO(dateTo));
    const months = eachMonthOfInterval({ start, end });
    
    return months.map(m => {
      const monthStr = format(m, 'MM/yyyy');
      const count = filteredData.filter(r => format(parseISO(r.header.createdDate), 'MM/yyyy') === monthStr).length;
      return { name: monthStr, count };
    });
  }, [filteredData, dateFrom, dateTo]);

  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      counts[r.header.dept] = (counts[r.header.dept] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      counts[r.header.incidentType] = (counts[r.header.incidentType] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const classificationData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const cls = r.header.classification || 'Khác';
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const topSuppliers = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const s = r.header.supplier || 'N/A';
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredData]);

  if (loading) return <div className='text-center py-20 text-slate-400'>Đang tổng hợp dữ liệu báo cáo...</div>;

  return (
    <div className='flex flex-col gap-6 max-w-[1600px] mx-auto pb-10'>
      {/* Header section with Dynamic Title */}
      <div className='card-header relative overflow-hidden'>
        <div className='card-header-icon'><img src='/img/reports-bg.png' alt='' /></div>
        <div className='relative z-10'>
          <h1>BÁO CÁO & PHÂN TÍCH CHẤT LƯỢNG</h1>
          <p>Dữ liệu tổng hợp từ {filteredData.length} phiếu BBSC trong giai đoạn đã chọn.</p>
        </div>
      </div>

      {/* Modern Filter Bar */}
      <div className='card !p-3 flex flex-wrap items-end gap-4 shadow-sm border border-white/50 bg-white/80 backdrop-blur'>
        <div className='flex-1 min-w-[200px]'>
          <label className='form-label flex items-center gap-1.5'><Calendar size={14} className='text-blue-500' /> Từ ngày</label>
          <input type="date" className='form-input' value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className='flex-1 min-w-[200px]'>
          <label className='form-label flex items-center gap-1.5'><Calendar size={14} className='text-blue-500' /> Đến ngày</label>
          <input type="date" className='form-input' value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className='flex-1 min-w-[200px]'>
          <label className='form-label flex items-center gap-1.5'><Building2 size={14} className='text-blue-500' /> Bộ phận</label>
          <select className='form-select' value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['dept']?.map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
          </select>
        </div>
        <div className='flex-1 min-w-[200px]'>
          <label className='form-label flex items-center gap-1.5'><Filter size={14} className='text-blue-500' /> Loại sự cố</label>
          <select className='form-select' value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['incident_type']?.map(i => <option key={i.key} value={i.key}>{i.value}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {[
          { label: 'Tổng số phiếu', value: filteredData.length, icon: Activity, color: 'blue' },
          { label: 'Đang xử lý', value: filteredData.filter(r => r.header.status === 'Đang xử lý').length, icon: TrendingUp, color: 'orange' },
          { label: 'Đã hoàn tất', value: filteredData.filter(r => r.header.status === 'Hoàn tất').length, icon: CheckSquare, color: 'green' },
          { label: 'Bộ phận tham gia', value: new Set(filteredData.map(r => r.header.dept)).size, icon: Users, color: 'purple' },
        ].map((item, i) => (
          <div key={i} className='card flex items-center gap-4 !p-5 hover:translate-y-[-2px] transition-transform cursor-default'>
            <div className={`w-12 h-12 rounded-2xl bg-${item.color}-50 flex items-center justify-center text-${item.color}-600`}>
              <item.icon size={24} />
            </div>
            <div>
              <div className='text-xs font-bold text-slate-400 uppercase tracking-wider'>{item.label}</div>
              <div className='text-2xl font-black text-slate-800'>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs System */}
      <div className='card !p-0 overflow-hidden shadow-md'>
        <div className='flex border-b border-slate-100 bg-slate-50/50'>
          {[
            { id: 'overview', label: 'TỔNG QUAN XU HƯỚNG', icon: BarChart3 },
            { id: 'incident', label: 'PHÂN TÍCH LỖI', icon: PieIcon },
            { id: 'perf', label: 'HIỆU SUẤT & ĐỐI TÁC', icon: Activity },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-xs font-bold tracking-widest transition-all border-b-2 ${
                activeTab === tab.id 
                ? 'border-blue-600 text-blue-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className='p-6'>
          {activeTab === 'overview' && (
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-8'>
              <div className='flex flex-col gap-3'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'>< TrendingUp size={16} className='text-blue-500'/> Xu hướng số lượng BBSC theo tháng</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrend}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className='flex flex-col gap-3'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'><PieIcon size={16} className='text-blue-500'/> Cơ cấu trạng thái phiếu</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className='xl:col-span-2 flex flex-col gap-3 pt-6 border-t border-slate-100'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'><Users size={16} className='text-blue-500'/> Phân bổ số lượng theo Bộ phận thực hiện</h3>
                <div className='h-[350px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" fontSize={11} hide />
                      <YAxis dataKey="name" type="category" fontSize={11} width={100} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="value" fill="#1a56a0" radius={[0, 4, 4, 0]} barSize={25}>
                        {deptData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'incident' && (
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-8'>
              <div className='flex flex-col gap-3'>
                <h3 className='text-sm font-bold text-slate-700 uppercase tracking-tighter'>Thống kê theo Loại sự cố</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" fontSize={10} angle={-15} textAnchor="end" height={60} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className='flex flex-col gap-3'>
                <h3 className='text-sm font-bold text-slate-700 uppercase tracking-tighter'>Cơ cấu Phân loại hàng lỗi</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={classificationData}
                        cx="50%" cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, value }) => `${name} (${value})`}
                      >
                        {classificationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className='xl:col-span-2 card bg-slate-50 !border-none !p-6'>
                <h3 className='text-sm font-bold text-slate-700 mb-4'>Insight: Tỉ lệ lỗi tập trung ở đâu?</h3>
                <p className='text-xs text-slate-500 leading-relaxed'>
                  Dựa trên dữ liệu đã lọc, hệ thống ghi nhận <strong>{filteredData[0]?.header.incidentType || '...'}</strong> là loại sự cố phổ biến nhất. 
                  Bộ phận <strong>{deptData[0]?.name || '...'}</strong> hiện đang xử lý khối lượng BBSC lớn nhất với {deptData[0]?.value} phiếu. 
                  Đề xuất tập trung nguồn lực kiểm soát cho nhóm hàng <strong>{classificationData[0]?.name || '...'}</strong> để giảm thiểu rủi ro.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'perf' && (
            <div className='flex flex-col gap-8'>
               <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
                  <div className='flex flex-col gap-4'>
                    <h3 className='text-sm font-bold text-slate-700 uppercase'>Top 5 Nhà cung cấp phát sinh nhiều BBSC nhất</h3>
                    <div className='overflow-hidden border border-slate-100 rounded-xl'>
                      <table className='w-full text-xs'>
                        <thead className='bg-slate-50 text-slate-500 font-bold'>
                          <tr>
                            <th className='px-4 py-3 text-left w-10'>#</th>
                            <th className='px-4 py-3 text-left'>Nhà cung cấp</th>
                            <th className='px-4 py-3 text-right'>Số phiếu</th>
                            <th className='px-4 py-3 text-right'>Tỉ lệ (%)</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-slate-100'>
                          {topSuppliers.map((s, idx) => (
                            <tr key={idx} className='hover:bg-blue-50/30 transition-colors'>
                              <td className='px-4 py-3 font-bold text-slate-400'>{idx + 1}</td>
                              <td className='px-4 py-3 font-semibold text-slate-700'>{s.name}</td>
                              <td className='px-4 py-3 text-right font-bold text-blue-600'>{s.count}</td>
                              <td className='px-4 py-3 text-right font-medium text-slate-500'>{((s.count / filteredData.length) * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className='flex flex-col gap-4'>
                    <h3 className='text-sm font-bold text-slate-700 uppercase'>Phân bổ Tags (Nhãn dán)</h3>
                    <div className='h-[250px] w-full'>
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                            <Pie
                              data={masterData['tag']?.map(t => ({ name: t.value, value: filteredData.filter(r => r.header.tags === t.value).length })) || []}
                              cx="50%" cy="50%"
                              innerRadius={60} outerRadius={80}
                              dataKey="value"
                            >
                              {masterData['tag']?.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                         </PieChart>
                       </ResponsiveContainer>
                    </div>
                  </div>
               </div>

               <div className='p-8 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl'>
                  <div className='flex flex-col gap-1'>
                    <div className='text-lg font-bold'>Xuất báo cáo chi tiết?</div>
                    <div className='text-white/70 text-sm'>Tải xuống bản PDF hoặc Excel tổng hợp từ các biểu đồ trên.</div>
                  </div>
                  <button className='bg-white text-blue-600 px-8 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-50 transition-colors flex items-center gap-2'>
                    <TrendingUp size={18} /> TẢI XUỐNG BÁO CÁO (.PDF)
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}