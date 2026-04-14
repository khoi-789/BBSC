'use client';
import { useEffect, useState } from 'react';
import { getReports } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getReports().then(data => { setReports(data); setLoading(false); }); }, []);
  if (loading) return <div className='text-center py-20 text-slate-400'>Đang tải dữ liệu...</div>;
  return (
    <div className='flex flex-col gap-5'>
      <div className='card-header relative overflow-hidden'>
        <div className='card-header-icon'><img src='/img/reports-bg.png' alt='' /></div>
        <h1>BÁO CÁO & BIỂU ĐỒ</h1>
        <p>Phân tích xu hướng lỗi và hiệu suất.</p>
      </div>
      <div className='card' style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>[Biểu đồ đang được tối ưu lại...]</div>
    </div>
  );
}