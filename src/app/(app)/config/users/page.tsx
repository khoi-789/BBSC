'use client';
import { useEffect, useState } from 'react';
import { getUsers, updateUserProfile } from '@/lib/services/users';
import { UserProfile } from '@/types';
import { useToast } from '@/components/ui/ToastProvider';
import RoleGuard from '@/components/auth/RoleGuard';
import { UserCheck, UserX, UserPlus, X, Pencil, UserCircle, Trash2, Key, ArrowUpCircle } from 'lucide-react';
import { adminCreateUser, adminResetPassword, adminDeleteUser, adminUpgradeToUser } from './actions';
import { useAppStore } from '@/stores/appStore';
import { MASTER_GROUPS } from '@/lib/services/masterData';

export default function UsersPage() {
  return (
    <RoleGuard allowedRoles={['Admin']}>
      <UsersContent />
    </RoleGuard>
  );
}

function UsersContent() {
  const { toast } = useToast();
  const { masterData } = useAppStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [picOnlyMode, setPicOnlyMode] = useState(false);

  // Form states
  const [newUserData, setNewUserData] = useState({
    uid: '',
    username: '',
    displayName: '',
    department: '',
    role: 'Staff' as any,
    password: '',
    linkedPic: '',
    isPic: false,
  });

  const loadData = async () => {
    setLoading(true);
    const u = await getUsers();
    setUsers(u);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddOrUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    
    const finalData = {
      ...newUserData,
      username: picOnlyMode ? 'PIC_ONLY' : newUserData.username,
      isPic: picOnlyMode ? true : newUserData.isPic
    };

    if (!finalData.username && !isEditing) return toast('Vui lòng điền Username', 'error');
    if (!finalData.displayName || !finalData.department) {
      return toast('Vui lòng điền đầy đủ thông tin bắt buộc.', 'error');
    }

    setIsCreating(true);
    try {
      if (isEditing) {
        // Neu dang tu PIC_ONLY muon len USER
        const isCurrentlyPicOnly = users.find(u => u.uid === finalData.uid)?.email?.includes('pic_only_');
        if (isCurrentlyPicOnly && !picOnlyMode) {
          const res = await adminUpgradeToUser(finalData.uid, { 
            username: finalData.username, 
            password: finalData.password 
          });
          if (res.success) {
             toast('Đã nâng cấp lên tài khoản người dùng thành công!', 'success');
             setIsModalOpen(false);
             loadData();
             return;
          } else {
            throw new Error(res.error);
          }
        }

        await updateUserProfile(finalData.uid, {
          displayName: finalData.displayName,
          role: finalData.role,
          department: finalData.department,
          isPic: !!finalData.isPic,
          linkedPic: finalData.linkedPic || '',
        });
        toast('Đã cập nhật thành công!', 'success');
        setIsModalOpen(false);
        loadData();
      } else {
        const res = await adminCreateUser(finalData);
        if (res.success) {
          toast(picOnlyMode ? 'Đã tạo nhân sự PIC thành công!' : 'Đã tạo tài khoản thành công!', 'success');
          setIsModalOpen(false);
          loadData();
        } else {
          toast(`Lỗi: ${res.error}`, 'error');
        }
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(user: UserProfile) {
    setIsEditing(true);
    const isActuallyPicOnly = user.email?.includes('pic_only_');
    setPicOnlyMode(isActuallyPicOnly);
    setNewUserData({
      uid: user.uid,
      username: isActuallyPicOnly ? '' : (user.email?.split('@')[0] || ''),
      displayName: user.displayName || '',
      department: user.department || '',
      role: user.role || 'Staff',
      password: '',
      linkedPic: user.linkedPic || '',
      isPic: !!user.isPic,
    });
    setIsModalOpen(true);
  }

  function startAdd(isPicOnly = false) {
    setIsEditing(false);
    setPicOnlyMode(isPicOnly);
    setNewUserData({ 
      uid: '', 
      username: '', 
      displayName: '', 
      department: '', 
      role: 'Staff', 
      password: '', 
      linkedPic: '', 
      isPic: isPicOnly 
    });
    setIsModalOpen(true);
  }

  async function toggleActive(user: UserProfile) {
    try {
      await updateUserProfile(user.uid, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isActive: !u.isActive } : u));
      toast(`Đã ${user.isActive ? 'khoá' : 'kích hoạt'} ${user.displayName}`, 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function handleResetPass(user: UserProfile) {
    if (!confirm(`Tất cả mật khẩu của ${user.displayName} sẽ reset về BBSC123456?`)) return;
    try {
      const res = await adminResetPassword(user.uid);
      if (res.success) toast('Reset mật khẩu thành công!', 'success');
      else toast(res.error || 'Lỗi', 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function handleDelete(user: UserProfile) {
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN nhân sự ${user.displayName}? Hành động này không thể hoàn tác.`)) return;
    try {
      const res = await adminDeleteUser(user.uid);
      if (res.success) {
        toast('Đã xóa vĩnh viễn nhân sự.', 'success');
        loadData();
      } else toast(res.error || 'Lỗi', 'error');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  const ROLE_BADGE: Record<string, string> = {
    Admin: 'badge-yellow', Manager: 'badge-green', Staff: 'badge-blue',
  };

  const depts = masterData[MASTER_GROUPS.DEPT] || [];

  return (
    <div className="flex flex-col gap-1">
      <div className="card-header !bg-[#1e40af] !mb-1.5 relative overflow-hidden flex items-center justify-between px-8 py-6">
        <div className="card-header-icon">
          <img src="/img/users-bg.png" alt="" className="w-full h-full object-contain opacity-10" />
        </div>
        
        {/* Subtle Watermark */}
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-[0.05] pointer-events-none flex items-center justify-end pr-12 z-0">
          <UserPlus size={240} className="text-white" />
        </div>

        <div className="relative z-10 flex-1">
          <h1 className="!text-white uppercase tracking-tight m-0">Quản lý nhân sự</h1>
          <p className="!text-blue-100 font-medium m-0 mt-1 opacity-90">Danh sách tài khoản và nhân sự không tài khoản (PIC-Only)</p>
        </div>
        
        <div className="flex gap-3 relative z-20 flex-shrink-0">
          <button
            onClick={() => startAdd(true)}
            className="btn bg-[#f59e0b] hover:bg-[#d97706] text-white shadow-lg flex items-center gap-2 px-5 h-11 font-bold border-none transition-all hover:scale-[1.02] active:scale-95"
            style={{ backgroundColor: '#f59e0b' }}
          >
            <UserCircle size={18} /> Thêm PIC (Không User)
          </button>
          <button
            onClick={() => startAdd(false)}
            className="btn shadow-lg flex items-center gap-2 px-5 h-11 font-bold border-none transition-all hover:scale-[1.02] active:scale-95 text-white"
            style={{ backgroundColor: '#4d7c0f' }}
          >
            <UserPlus size={18} /> Thêm Tài khoản
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden bg-white shadow-md border-slate-200">
        <table className="data-table !text-[13px]">
          <thead>
            <tr className="!bg-[#1e40af] border-b border-blue-800">
              <th className="!text-white font-bold py-4 px-6 text-left rounded-tl-lg">Họ tên nhân sự</th>
              <th className="!text-white font-bold py-4 px-6 text-left">Định danh / Username</th>
              <th className="!text-white font-bold py-4 px-6 text-left">Bộ phận</th>
              <th className="!text-white font-bold py-4 px-6 text-left">Vai trò / Loại</th>
              <th className="!text-white font-bold py-4 px-6 text-left">Trạng thái</th>
              <th className="!text-white font-bold py-4 px-6 text-center rounded-tr-lg">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? <tr><td colSpan={6} className="text-center py-10 text-slate-300">Đang tải dữ liệu...</td></tr>
              : users.map(user => {
                  const isActuallyPicOnly = user.email?.includes('pic_only_');
                  const username = isActuallyPicOnly ? '---' : (user.email?.split('@')[0] || user.email);
                  return (
                    <tr key={user.uid} className={`hover:bg-blue-50/30 transition-colors group ${isActuallyPicOnly ? 'bg-slate-50/50' : ''}`}>
                      <td className="py-3 px-6">
                        <div className="font-bold text-slate-800">{user.displayName}</div>
                        {user.isPic && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-amber-200">
                              PIC: {user.linkedPic || user.displayName}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="text-slate-500 font-mono py-3 px-6 italic">{username}</td>
                      <td className="py-3 px-6"><span className="text-slate-600 font-semibold">{user.department}</span></td>
                      <td className="py-3 px-6">
                        {isActuallyPicOnly ? (
                          <span className="badge badge-gray">Chỉ làm PIC</span>
                        ) : (
                          <span className={`badge ${ROLE_BADGE[user.role] || 'badge-gray'}`}>{user.role}</span>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`badge ${user.isActive ? 'badge-green' : 'badge-gray'}`}>
                          {user.isActive ? 'Hoạt động' : 'Đã khoá'}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Sửa */}
                          <button onClick={() => startEdit(user)} className="btn btn-icon btn-ghost btn-sm text-blue-600 hover:bg-blue-100" title="Chỉnh sửa">
                            <Pencil size={14} />
                          </button>
                          
                          {/* Reset Pass */}
                          {!isActuallyPicOnly && (
                            <button onClick={() => handleResetPass(user)} className="btn btn-icon btn-ghost btn-sm text-amber-500 hover:bg-amber-100 hover:text-amber-600" title="Reset mật khẩu">
                              <Key size={14} />
                            </button>
                          )}

                          {/* Khoá/Mở */}
                          <button onClick={() => toggleActive(user)} className={`btn btn-icon btn-sm rounded-full ${user.isActive ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`} title={user.isActive ? 'Khoá' : 'Mở khoá'}>
                            {user.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>

                          {/* Xoá */}
                          <button onClick={() => handleDelete(user)} className="btn btn-icon btn-sm text-red-600 hover:bg-red-600 hover:text-white rounded-full transition-all" title="Xoá vĩnh viễn">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`p-5 border-b flex items-center justify-between ${picOnlyMode ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {isEditing ? 'Cập nhật thông tin' : (picOnlyMode ? 'Thêm PIC (Không tài khoản)' : 'Thêm tài khoản người dùng')}
                </h2>
                {isEditing && picOnlyMode && (
                  <p className="text-[10px] text-amber-600 font-bold">Lưu ý: Nhân sự này chưa có tài khoản đăng nhập.</p>
                )}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 p-1 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddOrUpdateUser} className="p-6 space-y-4">
              <div className="space-y-4">
                {/* Upgrade Button IF currently PIC only but editing */}
                {isEditing && picOnlyMode && (
                  <button 
                    type="button"
                    onClick={() => setPicOnlyMode(false)}
                    className="w-full btn btn-sm bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center gap-2 py-3 hover:bg-blue-600 hover:text-white transition-all font-bold"
                  >
                    <ArrowUpCircle size={16} /> Nâng cấp lên Tài khoản đăng nhập
                  </button>
                )}

                {!picOnlyMode && (
                  <div>
                    <label className="form-label text-xs uppercase text-slate-500 font-bold">Username {isEditing ? '' : '*'} </label>
                    <input
                      type="text"
                      className="form-input font-mono !bg-slate-50/50"
                      value={newUserData.username}
                      onChange={e => setNewUserData({...newUserData, username: e.target.value})}
                      placeholder="VD: khoilm"
                      disabled={isEditing && !users.find(u => u.uid === newUserData.uid)?.email?.includes('pic_only_')}
                      required={!isEditing || (isEditing && picOnlyMode === false)}
                    />
                  </div>
                )}

                <div>
                  <label className="form-label text-xs uppercase text-slate-500 font-bold">Họ và tên nhân sự *</label>
                  <input
                    type="text"
                    className="form-input font-bold"
                    value={newUserData.displayName}
                    onChange={e => setNewUserData({...newUserData, displayName: e.target.value})}
                    placeholder="VD: Nguyễn Văn A"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {!picOnlyMode && (
                    <div>
                      <label className="form-label text-xs uppercase text-slate-500 font-bold">Vai trò</label>
                      <select
                        className="form-select font-semibold"
                        value={newUserData.role}
                        onChange={e => setNewUserData({...newUserData, role: e.target.value})}
                      >
                        <option value="Staff">Staff</option>
                        <option value="Manager">Manager</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                  )}
                  <div className={picOnlyMode ? 'col-span-2' : ''}>
                    <label className="form-label text-xs uppercase text-slate-500 font-bold">Bộ phận *</label>
                    <select
                      className="form-select font-semibold"
                      value={newUserData.department}
                      onChange={e => setNewUserData({...newUserData, department: e.target.value})}
                      required
                    >
                      <option value="">-- Chọn bộ phận --</option>
                      {depts.map((d: any) => (
                        <option key={d.key} value={d.key}>{d.value}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`${picOnlyMode ? 'bg-amber-50/50 border-amber-100' : 'bg-blue-50/50 border-blue-100'} p-4 rounded-xl border space-y-3`}>
                  {!picOnlyMode && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded"
                        checked={newUserData.isPic}
                        onChange={e => setNewUserData({...newUserData, isPic: e.target.checked})}
                      />
                      <span className="text-sm font-bold text-slate-700">Hiển thị trong danh sách chọn PIC</span>
                    </label>
                  )}

                  {(newUserData.isPic || picOnlyMode) && (
                    <div className="space-y-1">
                      <label className={`form-label text-[10px] uppercase font-bold ${picOnlyMode ? 'text-amber-600' : 'text-blue-600'}`}>Tên viết tắt (VD: Khôi, Lữ, Phát)</label>
                      <input
                        type="text"
                        className="form-input !bg-white"
                        placeholder="Nếu trống sẽ lấy Họ và tên"
                        value={newUserData.linkedPic}
                        onChange={e => setNewUserData({...newUserData, linkedPic: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-danger flex-1">Hủy</button>
                <button type="submit" disabled={isCreating} className="btn btn-primary flex-1">
                  {isCreating ? 'Đang tải...' : 'Lưu dữ liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
