'use client';
import { useEffect, useState, use } from 'react';
import ReportForm from '@/components/reports/ReportForm';
import { getReport } from '@/lib/services/reports';
import { BBSCReport } from '@/types';

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<BBSCReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReport(id).then(data => {
      setReport(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="text-center py-20 text-slate-400">Đang tải dữ liệu...</div>;
  if (!report) return <div className="text-center py-20 text-slate-400">Không tìm thấy phiếu sự cố.</div>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="card-header relative overflow-hidden">
        <div className="card-header-icon">
          <img src="/img/dashboard-bg.png" alt="" />
        </div>
        <h1>CHỈNH SỬA PHIẾU BBSC</h1>
        <p>Cập nhật thông tin chi tiết cho phiếu {report.reportId}</p>
      </div>
      <ReportForm existing={report} />
    </div>
  );
}