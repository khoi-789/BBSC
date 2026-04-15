'use client';
// Force all (app) routes to be dynamic — Firebase cannot run during static SSG
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { ToastProvider } from '@/components/ui/ToastProvider';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Danh sách sự cố',
  '/tasks': 'Tiến độ & Nhắc nhở',
  '/create': 'Tạo mới sự cố',
  '/reports': 'Báo cáo & Biểu đồ',
  '/config': 'Cấu hình hệ thống',
  '/config/users': 'Quản lý người dùng',
  '/knowledge': 'Tham khảo',
  '/migration': 'Migration Dữ liệu (Admin)',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isInitialized, isLoading } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pathname, setPathname] = useState('/dashboard');

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (isInitialized && !profile) {
      router.replace('/login');
    }
  }, [isInitialized, profile]);

  if (isLoading || !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" style={{ borderTopColor: '#1a56a0', borderColor: '#dbeafe' }} />
          <span className="text-sm text-slate-500">Đang tải dữ liệu...</span>
        </div>
      </div>
    );
  }

  const title = Object.entries(PAGE_TITLES).find(([key]) => pathname.startsWith(key))?.[1] || 'BBSC System';

  return (
    <ToastProvider>
      <div className="flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className={`page-container w-full ${!sidebarOpen ? 'no-sidebar' : ''}`}>
          <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <main className="page-content">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
