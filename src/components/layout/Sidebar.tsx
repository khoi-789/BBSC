import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import {
  ClipboardList, CheckSquare, PlusCircle, Settings,
  BookOpen, BarChart2, Building2, ShieldCheck, User, LogOut, ChevronDown
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { MASTER_GROUPS } from '@/lib/services/masterData';
import ChangePasswordModal from '../auth/ChangePasswordModal';

const MASTER_TABS = [
  { key: MASTER_GROUPS.SUPPLIER,      label: 'Nhà cung cấp' },
  { key: MASTER_GROUPS.DEPT,          label: 'Bộ phận' },
  { key: MASTER_GROUPS.INCIDENT_TYPE, label: 'Loại sự cố' },
  { key: MASTER_GROUPS.CLASSIFICATION,label: 'Phân loại hàng' },
  { key: MASTER_GROUPS.TAG,           label: 'Nhãn (Tags)' },
  { key: MASTER_GROUPS.STATUS,        label: 'Trạng thái' },
  { key: MASTER_GROUPS.UNIT,          label: 'Đơn vị tính' },
];

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Danh sách sự cố', icon: ClipboardList },
  { href: '/tasks',     label: 'Tiến độ (Task)',   icon: CheckSquare },
  { href: '/reports',   label: 'Báo cáo & Biểu đồ', icon: BarChart2 },
];

const TOOL_ITEMS = [
  { href: '/knowledge', label: 'Tham khảo',    icon: BookOpen },
];

const ADMIN_ITEMS = [
  { href: '/config',    label: 'Cấu hình hệ thống', icon: Settings },
  { href: '/config/rbac', label: 'Phân quyền (RBAC)', icon: ShieldCheck },
  { href: '/config/users', label: 'Quản lý người dùng', icon: Building2 },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(pathname.startsWith('/config') && !pathname.includes('/rbac') && !pathname.includes('/users'));

  const isAdmin = profile?.role?.toLowerCase() === 'admin';
  const isManager = profile?.role?.toLowerCase() === 'manager' || isAdmin;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <nav className={`sidebar ${open ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <span className="text-blue-400 mr-2">■</span>BBSC SYSTEM
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Main navigation */}
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${pathname.startsWith(item.href) ? 'active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}

          <Link
            href="/create"
            className={`sidebar-nav-item ${pathname === '/create' ? 'active' : ''}`}
          >
            <PlusCircle size={16} />
            Tạo mới
          </Link>

          {/* Tools section */}
          <div className="sidebar-section-label">Công cụ</div>
          {TOOL_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${pathname.startsWith(item.href) ? 'active' : ''}`}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="sidebar-section-label">Quản trị</div>
              
              {/* Cấu hình hệ thống (Toggle) */}
              <button
                onClick={() => setConfigOpen(!configOpen)}
                className={`sidebar-nav-item w-full text-left justify-between ${pathname === '/config' ? 'active' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} />
                  <span>Cấu hình hệ thống</span>
                </div>
                <ChevronDown size={14} className={`text-white/30 transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Collapsible Master Data Tabs */}
              {configOpen && (
                <div className="bg-black/20 py-1 flex flex-col animate-in fade-in slide-in-from-top-1 duration-200">
                  {MASTER_TABS.map(tab => (
                    <Link
                      key={tab.key}
                      href={`/config?tab=${tab.key}`}
                      className="sidebar-nav-item !pl-12 !py-2 !text-[11px] opacity-80 hover:opacity-100"
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              )}

              {/* RBAC */}
              <Link
                href="/config/rbac"
                className={`sidebar-nav-item ${pathname.startsWith('/config/rbac') ? 'active' : ''}`}
              >
                <ShieldCheck size={16} />
                Phân quyền (RBAC)
              </Link>

              {/* Users (Admin Only) */}
              {isAdmin && (
                <Link
                  href="/config/users"
                  className={`sidebar-nav-item ${pathname.startsWith('/config/users') ? 'active' : ''}`}
                >
                  <Building2 size={16} />
                  Quản lý người dùng
                </Link>
              )}
            </>
          )}
        </div>

        {/* User Info with Dropdown (at bottom) */}
        <div className="mt-auto border-t border-white/10 relative">
          {profile && (
            <div className="p-4">
              {/* Dropdown Menu (Appears above the profile) */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 rounded-xl shadow-2xl border border-white/10 overflow-hidden animate-in slide-in-from-bottom-2 duration-200 z-[60]">
                  <button 
                    className="flex items-center gap-3 w-full px-4 py-3 text-xs font-bold text-blue-100 hover:bg-white/5 transition-colors border-b border-white/5"
                    onClick={() => { setIsPasswordModalOpen(true); setUserMenuOpen(false); }}
                  >
                    <Settings size={14} className="text-blue-400" />
                    ĐỔI MẬT KHẨU
                  </button>
                  <button 
                    className="flex items-center gap-3 w-full px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors"
                    onClick={async () => {
                      await signOut(auth);
                      window.location.href = '/login';
                    }}
                  >
                    <LogOut size={14} />
                    ĐĂNG XUẤT
                  </button>
                </div>
              )}

              <button 
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={`flex items-center gap-3 w-full text-left p-2 rounded-xl transition-all ${userMenuOpen ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
                  <User size={20} className="text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{profile.displayName}</div>
                  <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider">{profile.department}</div>
                </div>
                <ChevronDown size={14} className={`text-white/30 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <div className="mt-2 px-2">
                <div className="px-2 py-0.5 bg-blue-500/20 rounded text-[9px] text-blue-200 border border-blue-500/30 w-fit uppercase font-bold">
                  {profile.role}
                </div>
              </div>
            </div>
          )}
          <div className="px-4 py-2 text-[10px] text-slate-500 bg-black/20">
            Version 3.0 | © 2025 IT Team
          </div>
        </div>
      </nav>

      <ChangePasswordModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)} 
      />
    </>
  );
}
