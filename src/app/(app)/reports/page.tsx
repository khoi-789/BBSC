'use client';
import { useEffect, useState, useMemo } from 'react';
import { getReports } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Filter, Calendar, BarChart3, PieChart as PieIcon, Activity, TrendingUp, Users, Building2, CheckSquare } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isWithinInterval, parseISO, isValid, isBefore } from 'date-fns';

const COLORS = ['#1a56a0', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export default function ReportsPage() {
  // Use selectors to prevent unnecessary re-renders
  const masterData = useAppStore(state => state.masterData);
  const isMasterDataLoaded = useAppStore(state => state.isMasterDataLoaded);
  const loadMasterData = useAppStore(state => state.loadMasterData);

  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Filters with stable default values
  const [dateFrom, setDateFrom] = useState(() => format(subMonths(new Date(), 6), 'yyyy-MM-01'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    if (!isMasterDataLoaded) loadMasterData();
    let isMounted = true;
    getReports().then(data => {
      if (isMounted) {
        setReports(data || []);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [isMasterDataLoaded, loadMasterData]);

  // Efficient data filtering
  const filteredData = useMemo(() => {
    const start = parseISO(dateFrom);
    const end = parseISO(dateTo);
    const hasValidRange = isValid(start) && isValid(end) && (isBefore(start, end) || start.getTime() === end.getTime());

    return reports.filter(r => {
      if (!r.header?.createdDate) return false;
      const date = parseISO(r.header.createdDate);
      if (!isValid(date)) return false;

      const inDate = hasValidRange ? isWithinInterval(date, { start, end }) : true;
      const inDept = filterDept ? r.header.dept === filterDept : true;
      const inType = filterType ? r.header.incidentType === filterType : true;
      return inDate && inDept && inType;
    });
  }, [reports, dateFrom, dateTo, filterDept, filterType]);

  // --- O(N) Data Processors ---
  
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const s = r.header?.status || 'N/A';
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const monthlyTrend = useMemo(() => {
    const start = startOfMonth(parseISO(dateFrom));
    const end = endOfMonth(parseISO(dateTo));
    
    if (!isValid(start) || !isValid(end) || isBefore(end, start)) {
      return [];
    }
    
    // Limit interval to 3 years to prevent hang
    const safeEnd = isBefore(end, subMonths(start, -36)) ? end : subMonths(start, -36);
    const months = eachMonthOfInterval({ start, end: safeEnd });
    
    // One-pass grouping O(N)
    const monthMap: Record<string, number> = {};
    filteredData.forEach(r => {
      const mStr = format(parseISO(r.header.createdDate), 'MM/yyyy');
      monthMap[mStr] = (monthMap[mStr] || 0) + 1;
    });

    return months.map(m => {
      const name = format(m, 'MM/yyyy');
      return { name, count: monthMap[name] || 0 };
    });
  }, [filteredData, dateFrom, dateTo]);

  const deptData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const d = r.header?.dept || 'Chưa rõ';
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = r.header?.incidentType || 'Khác';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const classificationData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const cls = r.header?.classification || 'Khác';
      counts[cls] = (counts[cls] || 0) + 1;
    });
    
    const rawData = Object.entries(counts).map(([name, value]) => ({ name, value }));
    const total = rawData.reduce((sum, item) => sum + item.value, 0);
    
    if (total === 0) return [];

    // Group items < 3% into "Khác"
    const threshold = total * 0.03;
    const mainItems = rawData.filter(item => item.value >= threshold);
    const otherValue = rawData.filter(item => item.value < threshold).reduce((sum, item) => sum + item.value, 0);
    
    if (otherValue > 0) {
      mainItems.push({ name: 'Khác', value: otherValue });
    }
    
    return mainItems.sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const topSuppliers = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(r => {
      const s = r.header?.supplier || 'N/A';
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredData]);

  if (loading) return <div className='text-center py-20 text-slate-400 animate-pulse'>Đang tổng hợp dữ liệu báo cáo...</div>;

  return (
    <div className='flex flex-col gap-6 max-w-[1600px] mx-auto pb-10 animate-fade-in'>
      <div className='card-header relative overflow-hidden'>
        <div className='card-header-icon'><img src='/img/reports-bg.png' alt='' /></div>
        <div className='relative z-10'>
          <h1>BÁO CÁO & PHÂN TÍCH CHẤT LƯỢNG</h1>
          <p>Dữ liệu tổng hợp từ {filteredData.length} phiếu BBSC trong giai đoạn đã chọn.</p>
        </div>
      </div>

      <div className='card !p-3 flex flex-wrap items-end gap-4 shadow-sm border border-white/50 bg-white/80 backdrop-blur'>
        <div className='flex-1 min-w-[180px]'>
          <label className='form-label flex items-center gap-1.5'><Calendar size={14} className='text-blue-500' /> Từ ngày</label>
          <input type="date" className='form-input !h-9' value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className='flex-1 min-w-[180px]'>
          <label className='form-label flex items-center gap-1.5'><Calendar size={14} className='text-blue-500' /> Đến ngày</label>
          <input type="date" className='form-input !h-9' value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className='flex-1 min-w-[180px]'>
          <label className='form-label flex items-center gap-1.5'><Building2 size={14} className='text-blue-500' /> Bộ phận</label>
          <select className='form-select !h-9' value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['dept']?.map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
          </select>
        </div>
        <div className='flex-1 min-w-[180px]'>
          <label className='form-label flex items-center gap-1.5'><Filter size={14} className='text-blue-500' /> Loại sự cố</label>
          <select className='form-select !h-9' value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">-- Tất cả --</option>
            {masterData['incident_type']?.map(i => <option key={i.key} value={i.key}>{i.value}</option>)}
          </select>
        </div>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        {[
          { label: 'Tổng số phiếu', value: filteredData.length, icon: Activity, color: 'blue' },
          { label: 'Đang xử lý', value: filteredData.filter(r => r.header?.status === 'Đang xử lý').length, icon: TrendingUp, color: 'orange' },
          { label: 'Đã hoàn tất', value: filteredData.filter(r => r.header?.status === 'Hoàn tất').length, icon: CheckSquare, color: 'green' },
          { label: 'Bộ phận tham gia', value: new Set(filteredData.map(r => r.header?.dept)).size, icon: Users, color: 'purple' },
        ].map((item, i) => (
          <div key={i} className='card flex items-center gap-4 !p-5 hover:shadow-lg transition-all'>
            <div className={`w-12 h-12 rounded-2xl bg-${item.color}-50 flex items-center justify-center text-${item.color}-600`}>
              <item.icon size={24} />
            </div>
            <div>
              <div className='text-[10px] font-bold text-slate-400 uppercase tracking-widest'>{item.label}</div>
              <div className='text-2xl font-black text-slate-800'>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className='card !p-0 overflow-hidden shadow-md border-none'>
        <div className='flex border-b border-slate-100 bg-slate-50/30 overflow-x-auto'>
          {[
            { id: 'overview', label: 'TỔNG QUAN XU HƯỚNG', icon: BarChart3 },
            { id: 'incident', label: 'PHÂN TÍCH LỖI', icon: PieIcon },
            { id: 'perf', label: 'HIỆU SUẤT & ĐỐI TÁC', icon: Activity },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-[11px] font-bold tracking-widest transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id 
                ? 'border-blue-600 text-blue-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className='p-6'>
          {activeTab === 'overview' && (
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-10'>
              <div className='flex flex-col gap-4'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'><TrendingUp size={16} className='text-blue-500'/> Xu hướng số lượng BBSC theo tháng</h3>
                <div className='h-[300px] w-full bg-slate-50/30 rounded-xl p-2'>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} tick={{fill: '#94a3b8'}} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} tick={{fill: '#94a3b8'}} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className='flex flex-col gap-4'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'><PieIcon size={16} className='text-blue-500'/> Cơ cấu trạng thái phiếu</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={60} outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                        stroke="none"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className='xl:col-span-2 flex flex-col gap-4 pt-6 border-t border-slate-100'>
                <h3 className='text-sm font-bold text-slate-700 flex items-center gap-2'><Users size={16} className='text-blue-500'/> Phân bổ số lượng theo Bộ phận</h3>
                <div className='h-[350px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" fontSize={10} hide />
                      <YAxis dataKey="name" type="category" fontSize={10} width={100} tickLine={false} axisLine={false} tick={{fill: '#64748b'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
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
            <div className='grid grid-cols-1 xl:grid-cols-2 gap-10'>
              <div className='flex flex-col gap-4'>
                <h3 className='text-sm font-bold text-slate-700 uppercase'>Theo Loại sự cố</h3>
                <div className='h-[300px] w-full bg-slate-50/30 rounded-xl p-4'>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={9} angle={-25} textAnchor="end" height={60} tick={{fill: '#94a3b8'}} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className='flex flex-col gap-4'>
                <h3 className='text-sm font-bold text-slate-700 uppercase'>Cơ cấu Phân loại hàng</h3>
                <div className='h-[300px] w-full'>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={classificationData}
                        cx="50%" cy="50%"
                        outerRadius={90}
                        dataKey="value"
                        label={({ percent }) => (percent > 0.1 ? '' : '')} // Hide redundant labels
                        stroke="none"
                      >
                        {classificationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className='xl:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6'>
                <h3 className='text-sm font-bold text-blue-800 mb-3 flex items-center gap-2'><Activity size={18}/> Insight & Đề xuất</h3>
                <p className='text-[13px] text-slate-600 leading-relaxed font-semibold'>
                  Dựa trên dữ liệu {filteredData.length} phiếu: 
                  Nhóm sự cố <span className='text-blue-700'>"{filteredData[0]?.header?.incidentType || '...'}"</span> đang chiếm tỉ trọng cao nhất. 
                  Bộ phận <span className='text-blue-700'>"{deptData[0]?.name || '...'}"</span> phát hiện nhiều lỗi nhất ({deptData[0]?.value || 0} phiếu). 
                  Nhóm hàng <span className='text-blue-700'>"{classificationData[0]?.name || '...'}"</span> cần được kiểm soát chặt chẽ hơn trong quy trình nhập kho.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'perf' && (
            <div className='flex flex-col gap-8'>
               <div className='grid grid-cols-1 lg:grid-cols-2 gap-10'>
                  <div className='flex flex-col gap-4'>
                    <h3 className='text-sm font-bold text-slate-700 uppercase'>Top 5 Nhà cung cấp phát sinh nhiều BBSC</h3>
                    <div className='overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm'>
                      <table className='w-full text-[12px]'>
                        <thead className='bg-slate-50 text-slate-500 font-bold'>
                          <tr>
                            <th className='px-4 py-3 text-left w-10'>STT</th>
                            <th className='px-4 py-3 text-left'>Nhà cung cấp</th>
                            <th className='px-4 py-3 text-right'>Số phiếu</th>
                            <th className='px-4 py-3 text-right'>Tỉ lệ</th>
                          </tr>
                        </thead>
                        <tbody className='divide-y divide-slate-100'>
                          {topSuppliers.map((s, idx) => (
                            <tr key={idx} className='hover:bg-slate-50 transition-colors'>
                              <td className='px-4 py-3 font-bold text-slate-400'>{idx + 1}</td>
                              <td className='px-4 py-3 font-semibold text-slate-700'>{s.name}</td>
                              <td className='px-4 py-3 text-right font-bold text-blue-600'>{s.count}</td>
                              <td className='px-4 py-3 text-right font-medium text-slate-500'>{((s.count / (filteredData.length || 1)) * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                          {topSuppliers.length === 0 && <tr><td colSpan={4} className='p-10 text-center text-slate-400'>Không có dữ liệu</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className='flex flex-col gap-4'>
                    <h3 className='text-sm font-bold text-slate-700 uppercase'>Thống kê Nhãn dán (Tags)</h3>
                    <div className='h-[250px] w-full bg-slate-50/50 rounded-xl'>
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                            <Pie
                              data={masterData['tag']?.map(t => ({ name: t.value, value: filteredData.filter(r => r.header?.tags === t.value).length })) || []}
                              cx="50%" cy="50%"
                              innerRadius={60} outerRadius={85}
                              dataKey="value"
                              stroke="none"
                            >
                              {masterData['tag']?.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend iconType="rect" wrapperStyle={{ fontSize: '10px' }} />
                         </PieChart>
                       </ResponsiveContainer>
                    </div>
                  </div>
               </div>

               <div className='p-8 rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden group'>
                  <div className='absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700'></div>
                  <div className='relative z-10 flex flex-col gap-1'>
                    <div className='text-xl font-black tracking-tight'>TRÍCH XUẤT DỮ LIỆU BÁO CÁO</div>
                    <div className='text-blue-100 text-sm opacity-80'>Tạo bản báo cáo chi tiết dựa trên các tham số đã thiết lập ở trên.</div>
                  </div>
                  <button className='relative z-10 bg-white text-blue-800 px-8 py-4 rounded-2xl font-black text-xs shadow-xl hover:bg-white hover:scale-105 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest'>
                    <TrendingUp size={18} /> XUẤT FILE PDF / EXCEL
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}