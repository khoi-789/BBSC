import ReportForm from '@/components/reports/ReportForm';

export default function CreateReportPage() {
  return (
    <div className="flex flex-col gap-1">
      <div className="card-header">
        <div className="card-header-icon">
          <img src="/img/create-bg.png" alt="" className="w-full h-full object-contain" />
        </div>
        <h1>TẠO MỚI SỰ CỐ</h1>
        <p>Điền đầy đủ thông tin để tạo biên bản sự cố hàng hóa mới.</p>
      </div>
      <ReportForm />
    </div>
  );
}
