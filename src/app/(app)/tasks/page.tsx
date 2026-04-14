'use client';
import { useEffect, useState } from 'react';
import { getReports } from '@/lib/services/reports';
import { updateReport } from '@/lib/services/reports';
import { BBSCReport } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/ToastProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AlertTriangle, Pencil } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function TasksPage() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [reports, setReports] = useState<BBSCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, string>>({});

  useEffect(() => {
    getReports().then(data => {
      const active = data.filter(r =>
        !['Hoàn tất', 'Hủy'].includes(r.header.status)
      );
      setReports(active);
      const pm: Record<string, string> = {};
      active.forEach(r => {
        const lastTask = r.tasks?.[r.tasks.length - 1];
        pm[r.id] = lastTask?.content || '';
      });
      setProgressMap(pm);
      setLoading(false);
    });
  }, []);

  const isStale = (r: BBSCReport) => {
    if (!r.updatedAt?.toDate) return false;
    const ms = Date.now() - r.updatedAt.toDate().getTime();
    return ms > 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  async function handleUpdateProgress(r: BBSCReport) {
    if (!profile) return;
    const content = progressMap[r.id];
    if (!content?.trim()) return;
    try {
      const newTask = {
        id: Date.now().toString(),
        content,
        progress: content,
        note: '',
        updatedAt: new Date().toISOString(),
        updatedBy: profile.displayName,
      };
      await updateReport(r.id, { tasks: [...(r.tasks || []), newTask] }, profile.uid, profile.displayName, 'Cập nhật tiến độ');
      toast('Đã cập nhật tiến độ', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Đang tải...</div>;

  return (
    <div className="flex flex-col gap-1">
      <div className="card-header flex items-center justify-between">
        <div className="card-header-icon">
          <img src="/img/tasks-bg.png" alt="" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1>TIẾN ĐỘ & NHẮC NHỞ</h1>
          <p>Theo dõi và thúc đẩy xử lý các sự cố tiến động.</p>
        </div>
        <div className="flex gap-4 text-sm text-white/80">
          <span><strong className="text-2xl text-white">{reports.filter(r => isStale(r)).length}</strong><br/>Cần xử lý cấp</span>
          <span><strong className="text-2xl text-white">{reports.length}</strong><br/>Tổng việc tồn đọng</span>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">Không có sự cố tồn đọng nào.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {reports.map(r => {
            const stale = isStale(r);
            const lastTask = r.tasks?.[r.tasks.length - 1];
            return (
              <div key={r.id} className={`card flex flex-col gap-2 ${stale ? 'border-l-4 border-red-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <Link href={`/reports/${r.id}`} className="text-blue-600 font-semibold text-sm hover:underline">
                    {r.reportId}
                  </Link>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={r.header.status} />
                    <Link href={`/reports/${r.id}/edit`} className="btn btn-icon btn-ghost btn-sm">
                      <Pencil size={12} />
                    </Link>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-0.5">
                  <div><span className="font-medium">Loại lỗi:</span> {r.header.incidentType || '—'}</div>
                  <div><span className="font-medium">SP:</span> {r.items[0]?.itemName || r.items[0]?.itemCode || '—'}</div>
                  <div><span className="font-medium">NCC:</span> {r.header.supplier || '—'}</div>
                  <div><span className="font-medium">PIC:</span> {r.header.pic || '—'}</div>
                </div>

                {stale && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
                    <AlertTriangle size={11} />
                    Đã hơn 1 tháng chưa cập nhật!
                  </div>
                )}

                {lastTask && (
                  <div className="text-xs text-slate-400 italic border-t pt-1">
                    {lastTask.content}
                  </div>
                )}

                <div className="flex gap-1 mt-auto">
                  <input
                    type="text"
                    className="form-input text-xs py-1"
                    placeholder="Cập nhật tiến độ..."
                    value={progressMap[r.id] || ''}
                    onChange={e => setProgressMap(p => ({ ...p, [r.id]: e.target.value }))}
                  />
                  <button
                    className="btn btn-primary btn-sm px-2"
                    onClick={() => handleUpdateProgress(r)}
                  >›</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
