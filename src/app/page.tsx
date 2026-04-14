'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function RootPage() {
  const { profile, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;
    if (profile) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [profile, isInitialized]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner" style={{ borderTopColor: '#1a56a0', borderColor: '#dbeafe' }} />
        <span className="text-sm text-slate-500">Đang khởi động BBSC System...</span>
      </div>
    </div>
  );
}
