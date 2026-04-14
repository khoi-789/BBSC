'use client';
import { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@/types';
import { ShieldOff } from 'lucide-react';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
}

export default function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { profile } = useAuthStore();

  if (!profile) return null;
  if (!allowedRoles.includes(profile.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3 text-slate-400">
        <ShieldOff size={40} strokeWidth={1.5} />
        <p className="text-base font-medium">Bạn không có quyền truy cập trang này.</p>
        <p className="text-sm">Yêu cầu vai trò: {allowedRoles.join(', ')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
