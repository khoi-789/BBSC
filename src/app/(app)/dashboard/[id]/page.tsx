'use client';
import { useEffect, useState, use } from 'react';
import { getReport } from '@/lib/services/reports';
import Link from 'next/link';
import { Clock, Pencil } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuthStore();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === '—' || !dateStr.includes('-')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    return dateStr;
  };

  useEffect(() => {
    getReport(id).then(data => {
      setReport(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-center text-slate-400">Đang tải dữ liệu...</div>;
  if (!report) return <div className="p-10 text-center text-slate-400">Không tìm thấy phiếu.</div>;

  const canEdit = () => {
    if (!profile) return false;
    if (profile.role === 'Admin' || profile.role === 'Manager') return true;
    if (profile.department === 'QA') return true;
    return report.header.dept === profile.department;
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="card-header flex items-start justify-between relative overflow-hidden">
        <div className="card-header-icon">
          <img src="/img/dashboard-bg.png" alt="" />
        </div>
        <div className="relative z-10">
          <h1 className="text-white drop-shadow-md">{report.reportId}</h1>
          <p className="text-blue-100 opacity-90">{report.header.supplier} — {report.header.incidentType}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap relative z-10">
          <StatusBadge status={report.header.status} />
          <Link href={`/dashboard/${id}/audit`} className="btn btn-sm bg-white/20 text-white border-white/30 hover:bg-white/30 font-bold">
            <Clock size={13} /> Lịch sử
          </Link>
          {canEdit() && (
            <Link href={`/dashboard/${id}/edit`} className="btn btn-sm bg-white text-blue-700 border-white hover:bg-blue-50 font-bold shadow-sm">
              <Pencil size={13} /> Sửa
            </Link>
          )}
        </div>
      </div>

      {/* Basic Info Card */}
      <div className="card grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Thông tin chung</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Ngày lập:</span>
              <span className="font-semibold">{formatDate(report.header.createdDate)}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Nhà cung cấp:</span>
              <span className="font-semibold">{report.header.supplier}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Phân loại hàng:</span>
              <span className="font-semibold text-blue-600">{report.header.classification || '—'}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Số hóa đơn:</span>
              <span className="font-semibold">{report.header.invoiceNo || '—'}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Ngày hoàn tất:</span>
              <span className="font-semibold text-green-600">{formatDate(report.header.completedDate) || '—'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phân loại & Trách nhiệm</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Loại sự cố:</span>
              <span className="font-semibold">{report.header.incidentType}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">Bộ phận:</span>
              <span className="font-semibold">{report.header.dept}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">PIC:</span>
              <span className="font-semibold">{report.header.pic}</span>
            </div>
            <div className="flex justify-between text-sm border-b border-slate-50 pb-1">
              <span className="text-slate-500">sub-PIC:</span>
              <span className="font-semibold text-slate-600">{report.header.subPic || '—'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ghi chú & Tags</h3>
          <p className="text-sm text-slate-700 leading-relaxed italic">"{report.header.note || 'Không có ghi chú'}"</p>
          {report.header.tags && (
            <div className="flex flex-wrap gap-1">
              <span className="badge badge-yellow !text-[10px]">{report.header.tags}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-600">DANH SÁCH SẢN PHẨM LỖI ({report.items?.length || 0})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="!bg-[#1e40af]">
                <th style={{ width: 40 }} className="rounded-tl-lg">#</th>
                <th style={{ minWidth: 100 }}>Mã SP</th>
                <th style={{ minWidth: 200 }}>Tên sản phẩm</th>
                <th style={{ minWidth: 120 }}>Số lô</th>
                <th style={{ minWidth: 110 }}>HSD</th>
                <th style={{ width: 60 }} className="text-right">SL</th>
                <th style={{ width: 80 }}>ĐVT</th>
                <th style={{ width: 100 }}>LPN</th>
                <th style={{ width: 100 }}>ASN</th>
                <th style={{ minWidth: 200 }}>Mô tả chi tiết</th>
                <th style={{ minWidth: 120 }} className="rounded-tr-lg">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {report.items?.map((item: any, idx: number) => (
                <tr key={idx}>
                  <td className="text-center text-slate-400 text-xs">{idx + 1}</td>
                  <td className="font-medium text-[13px]">{item.itemCode}</td>
                  <td className="max-w-[250px] truncate text-[13px]" title={item.itemName}>{item.itemName}</td>
                  <td className="text-[12px]">{item.batchNo}</td>
                  <td className="text-[12px] whitespace-nowrap">{formatDate(item.expiryDate)}</td>
                  <td className="text-right font-bold text-blue-600">{item.quantity}</td>
                  <td className="text-[12px] px-1">{item.unit}</td>
                  <td className="text-[11px] font-mono text-slate-500">{item.lpn || '—'}</td>
                  <td className="text-[11px] font-mono text-slate-500">{item.asn || '—'}</td>
                  <td className="max-w-[250px] truncate text-[12px] text-slate-700" title={item.detailedDescription}>
                    {item.detailedDescription || '—'}
                  </td>
                  <td className="max-w-[150px] truncate text-[12px] italic text-slate-500" title={item.note}>
                    {item.note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-start">
        <Link href="/dashboard" className="btn btn-outline btn-sm px-6">Quay lại danh sách</Link>
      </div>
    </div>
  );
}