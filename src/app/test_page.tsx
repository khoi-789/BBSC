'use client';
import { useEffect, useState } from 'react';
import { getReports } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format, startOfMonth } from 'date-fns';
import { vi } from 'date-fns/locale';

const STATUS_COLORS: Record<string, string> = {
  'Khởi tạo':   '#3b82f6',
  'Đang xử lý': '#f59e0b',
  'Hoàn tất':   '#10b981',
  'Hủy':        '#94a3b8',
  'Chờ hết INV': '#f97316',
  'Chờ xác nhận': '#8b5cf6',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReports().then(data => { setReports(data); setLoading(false); });
  }, []);

  if (loading) return <div className="text-center py-20 text-slate-400">Đang tải dữ liệu...</div>;

  // --- Trend data (by month) ---
  const trendMap: Record<string, number> = {};
  reports.forEach(r => {
    const date = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.header.createdDate);
    const key = format(startOfMonth(date), 'MM/yyyy');
    trendMap[key] = (trendMap[key] || 0) + 1;
  });
  const trendData = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([month, count]) => ({ month, 'Số lượng sự cố': count }));

  // --- Status Pie data ---
  const statusMap: Record<string, number> = {};
  reports.forEach(r => {
    statusMap[r.header.status] = (statusMap[r.header.status] || 0) + 1;
  });
  const pieData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  // --- Source Bar data ---
  const supplierMap: Record<string, number> = {};
  reports.forEach(r => {
    const k = r.header.supplier || 'Không xác định';
    supplierMap[k] = (supplierMap[k] || 0) + 1;
  });
  const barData = Object.entries(supplierMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, 'Số lượng': value }));

  return (
    <div className="flex flex-col gap-5">
      <div className="card-header relative overflow-hidden">
        <div className="card-header-icon">
          <img src="/img/reports-bg.png" alt="Reports" />
        </div>
        <h1>BÁO CÁO & BIỂU ĐỒ</h1>
        <p>Phân tích xu hướng lỗi, triệu suất vận hành và chất lượng nhà cung cấp.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tổng sự cố', value: reports.length, color: '#1a56a0' },
          { label: 'Đang xử lý', value: reports.filter(r => r.header.status === 'Đang xử lý').length, color: '#f59e0b' },
          { label: 'Hoàn tất', value: reports.filter(r => r.header.status === 'Hoàn tất').length, color: '#10b981' },
          { label: 'Chờ hết INV', value: reports.filter(r => r.header.status === 'Chờ hết INV').length, color: '#f97316' },
        ].map(stat => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.color + '22' }}>
              <span className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</span>
            </div>
            <span className="text-sm text-slate-600 font-medium">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="card">
        <h3 className="font-bold text-slate-700 mb-1">📈 Xu hướng sự cố theo thời gian</h3>
        <p className="text-xs text-slate-400 mb-4">Thống kê số lượng BBSC phát sinh theo từng tháng</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="Số lượng sự cố" stroke="#1a56a0" fill="#dbeafe" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-bold text-slate-700 mb-1">🔵 Tỷ lệ trạng thái hồ sơ</h3>
          <p className="text-xs text-slate-400 mb-4">Tình trạng xử lý các phiếu trong giai đoạn lọc</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-bold text-slate-700 mb-1">🏭 Cơ cấu nguồn hàng lỗi</h3>
          <p className="text-xs text-slate-400 mb-4">Top 10 nhà cung cấp có nhiều sự cố nhất</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="Số lượng" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
