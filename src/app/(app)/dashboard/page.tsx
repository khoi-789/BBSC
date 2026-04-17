import ReportTable from '@/components/reports/ReportTable';

export default function DashboardPage() {
  return (
    <div className='flex flex-col gap-1 h-full'>
      <div className='card-header relative overflow-hidden flex-shrink-0 sticky top-0 z-40'>
        <div className='card-header-icon'>
          <img src='/img/dashboard-bg.png' alt='' />
        </div>
        <h1>DANH SÁCH SỰ CỐ</h1>
        <p>Quản lý, tra cứu và theo dõi trạng thái toàn bộ hồ sơ sự cố.</p>
      </div>
      
      <div className="flex-1 pr-1 custom-scrollbar min-h-0">
        <ReportTable />
      </div>
    </div>
  );
}