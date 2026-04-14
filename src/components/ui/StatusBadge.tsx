import { ReportStatus } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  'Khởi tạo':      { label: 'Khởi tạo',     cls: 'badge-blue'   },
  'Chờ hết INV':   { label: 'Chờ hết INV',  cls: 'badge-orange' },
  'Hoàn tất':      { label: 'Hoàn tất',     cls: 'badge-green'  },
  'Đóng':          { label: 'Đóng',         cls: 'badge-gray'   },
};

export const ALL_STATUSES = Object.keys(STATUS_CONFIG) as ReportStatus[];

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ReportStatus];
  return (
    <span className={`badge ${cfg?.cls ?? 'badge-gray'}`}>
      {cfg?.label ?? status}
    </span>
  );
}
