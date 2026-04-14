'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/stores/appStore';
import { MasterDataItem } from '@/types';
import { 
  addMasterDataItem, 
  updateMasterDataItem, 
  deleteMasterDataItem, 
  MASTER_GROUPS 
} from '@/lib/services/masterData';
import { useToast } from '@/components/ui/ToastProvider';
import RoleGuard from '@/components/auth/RoleGuard';
import { 
  PlusCircle, 
  ArrowUp, 
  ArrowDown, 
  SortAsc, 
  Edit2, 
  Trash2, 
  Check, 
  X 
} from 'lucide-react';

const TABS = [
  { key: MASTER_GROUPS.SUPPLIER,      label: 'Nhà cung cấp' },
  { key: MASTER_GROUPS.DEPT,          label: 'Bộ phận' },
  { key: MASTER_GROUPS.PIC,           label: 'PIC' },
  { key: MASTER_GROUPS.INCIDENT_TYPE, label: 'Loại sự cố' },
  { key: MASTER_GROUPS.CLASSIFICATION,label: 'Phân loại hàng' },
  { key: MASTER_GROUPS.TAG,           label: 'Nhãn (Tags)' },
  { key: MASTER_GROUPS.STATUS,        label: 'Trạng thái' },
  { key: MASTER_GROUPS.UNIT,          label: 'Đơn vị tính' },
];

export default function ConfigPage() {
  return (
    <RoleGuard allowedRoles={['Admin', 'Manager']}>
      <Suspense fallback={<div className="text-center py-20 text-slate-400">Đang tải cấu hình...</div>}>
        <ConfigContent />
      </Suspense>
    </RoleGuard>
  );
}

function ConfigContent() {
  const { masterData, loadMasterData } = useAppStore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  const [activeTab, setActiveTab] = useState<string>(tabParam || MASTER_GROUPS.SUPPLIER);

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [adding, setAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newItem, setNewItem] = useState({ key: '', value: '', color: '#3b82f6' });

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');

  const items: MasterDataItem[] = masterData[activeTab] || [];

  async function handleAdd() {
    if (!newItem.key || !newItem.value) return toast('Vui lòng điền đầy đủ Mã và Tên', 'error');
    try {
      setIsProcessing(true);
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.order || 0)) + 1 : 1;
      await addMasterDataItem({ ...newItem, group: activeTab, order: nextOrder, isActive: true });
      toast('Đã thêm thành công', 'success');
      setAdding(false);
      setNewItem({ key: '', value: '', color: '#3b82f6' });
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  async function toggleActive(item: MasterDataItem & { id?: string }) {
    if (!item.id) return;
    try {
      await updateMasterDataItem(item.id, { isActive: !item.isActive });
      toast(`Đã ${item.isActive ? 'ẩn' : 'kích hoạt'} ${item.value}`, 'success');
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  async function handleDelete(item: any) {
    if (!confirm(`Bạn có chắc muốn XOÁ VĨNH VIỄN mục "${item.value}"?`)) return;
    try {
      setIsProcessing(true);
      await deleteMasterDataItem(item.id);
      toast('Đã xoá mục cấu hình', 'success');
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  async function startEdit(item: any) {
    setEditingId(item.id);
    setEditValue(item.value);
    setEditColor(item.color || '#3b82f6');
  }

  async function saveEdit() {
    if (!editingId || !editValue.trim()) {
      setEditingId(null);
      return;
    }
    try {
      setIsProcessing(true);
      await updateMasterDataItem(editingId, { 
        value: editValue.trim(),
        color: activeTab === MASTER_GROUPS.TAG ? editColor : undefined
      });
      toast('Cập nhật thành công', 'success');
      setEditingId(null);
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  async function moveItem(index: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const current = items[index] as MasterDataItem & { id: string };
    const other = items[targetIdx] as MasterDataItem & { id: string };

    try {
      setIsProcessing(true);
      const currentOrder = current.order || 0;
      const otherOrder = other.order || 0;

      await updateMasterDataItem(current.id, { order: otherOrder });
      await updateMasterDataItem(other.id, { order: currentOrder });
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  async function sortAZ() {
    if (items.length < 2) return;
    const sorted = [...items].sort((a, b) => a.value.localeCompare(b.value, 'vi'));
    try {
      setIsProcessing(true);
      toast('Đang cập nhật thứ tự...', 'info');
      await Promise.all(sorted.map((item, idx) => 
        updateMasterDataItem((item as any).id, { order: idx + 1 })
      ));
      toast('Sắp xếp A-Z thành công', 'success');
      await loadMasterData();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="card-header">
        <div className="card-header-icon">
          <img src="/img/config-bg.png" alt="" className="w-full h-full object-contain" />
        </div>
        <h1>CẤU HÌNH HỆ THỐNG</h1>
        <p>Quản lý danh mục, phòng ban và các cài đặt hệ thống.</p>
      </div>

      <div className="flex gap-3">
        {/* Content Area (Full Width - Tabs are now in sidebar) */}
        <div className="card flex-1 min-h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-700 capitalize">
              {TABS.find(t => t.key === activeTab)?.label}
            </h2>
            <div className="flex items-center gap-2">
              <button 
                className="btn btn-ghost btn-sm text-slate-500 hover:text-blue-600 flex items-center gap-1.5" 
                onClick={sortAZ}
                disabled={isProcessing || items.length < 2}
              >
                <SortAsc size={16} /> Sắp xếp A-Z
              </button>
              <button 
                className="btn btn-primary btn-sm px-4 flex items-center gap-1.5" 
                onClick={() => setAdding(!adding)}
                disabled={isProcessing}
              >
                <PlusCircle size={16} /> Thêm mới
              </button>
            </div>
          </div>

          {adding && (
            <div className="flex gap-3 items-end mb-4 p-3 bg-blue-50/80 border border-blue-200/50 rounded-xl animate-in fade-in slide-in-from-top-4 duration-300">
              <div style={{ width: 140 }}>
                <label className="text-[10px] uppercase text-blue-700 font-bold mb-1.5 block px-1">Mã (Key)</label>
                <input
                  className="form-input !bg-white !rounded-xl"
                  value={newItem.key}
                  onChange={e => setNewItem(p => ({ ...p, key: e.target.value.toUpperCase().trim() }))}
                  placeholder="VD: VE_PHARMA"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase text-blue-700 font-bold mb-1.5 block px-1">Tên hiển thị</label>
                <input
                  className="form-input !bg-white !rounded-xl"
                  value={newItem.value}
                  onChange={e => setNewItem(p => ({ ...p, value: e.target.value }))}
                  placeholder="VD: Công ty VE Pharma"
                />
              </div>

              {activeTab === MASTER_GROUPS.TAG && (
                <div>
                  <label className="text-[10px] uppercase text-blue-700 font-bold mb-1.5 block px-1">Màu sắc hiển thị</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-10 h-[42px] rounded-xl cursor-pointer border-0 p-0"
                      value={newItem.color}
                      onChange={e => setNewItem({...newItem, color: e.target.value})}
                    />
                    <div
                      className="flex-1 h-[42px] rounded-xl border border-slate-200 flex items-center px-3 text-xs font-bold text-white shadow-sm"
                      style={{ backgroundColor: newItem.color }}
                    >
                      BẢN XEM TRƯỚC
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button className="btn btn-primary px-6 h-[42px] rounded-xl font-bold shadow-lg shadow-blue-200" onClick={handleAdd} disabled={isProcessing}>
                  Lưu mới
                </button>
                <button className="btn btn-danger h-[42px] px-6 rounded-xl font-bold" onClick={() => setAdding(false)}>Hủy</button>
              </div>
            </div>
          )}

          <div className="overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm">
            <table className="data-table">
              <thead>
                <tr className="!bg-slate-50/80">
                  <th style={{ width: 150 }} className="rounded-tl-xl">Mã</th>
                  <th>Tên hiển thị</th>
                  <th style={{ width: 120 }}>Trạng thái</th>
                  <th style={{ width: 240 }} className="text-right px-6 rounded-tr-xl">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0
                  ? <tr><td colSpan={4} className="text-center py-16 text-slate-400 bg-slate-50/30">Chưa có dữ liệu cho danh mục này</td></tr>
                  : items.map((item: any, idx) => (
                    <tr key={item.id || item.key} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="font-mono text-[11px] text-slate-400 px-6">{item.key}</td>
                      <td className="font-medium text-slate-700">
                        {editingId === item.id ? (
                          <div className="flex flex-col gap-2">
                            <input 
                              autoFocus
                              className="form-input text-sm !h-8 !border-blue-400 !bg-white"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                            />
                            {activeTab === MASTER_GROUPS.TAG && (
                              <div className="flex items-center gap-2 mt-1">
                                <input 
                                  type="color" 
                                  className="w-8 h-8 rounded border-0 p-0 cursor-pointer"
                                  value={editColor}
                                  onChange={e => setEditColor(e.target.value)}
                                />
                                <span className="text-[10px] text-slate-400 uppercase font-mono">{editColor}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {activeTab === MASTER_GROUPS.TAG && (
                              <div className="w-3 h-3 rounded-full shadow-sm border border-white" style={{ backgroundColor: item.color || '#cbd5e1' }} />
                            )}
                            <span className={activeTab === MASTER_GROUPS.TAG ? "px-1 text-xs font-bold py-0.5 rounded text-white" : "px-1"} 
                                  style={activeTab === MASTER_GROUPS.TAG ? { backgroundColor: item.color || '#3b82f6' } : {}}>
                              {item.value}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${item.isActive ? 'badge-green' : 'badge-gray'}`}>
                          {item.isActive ? 'Hoạt động' : 'Đã ẩn'}
                        </span>
                      </td>
                      <td className="text-right px-6">
                        <div className="flex items-center justify-end gap-1">
                          {editingId === item.id ? (
                            <>
                              <button className="btn btn-icon btn-primary btn-sm !w-8 !h-8" title="Lưu" onClick={saveEdit} disabled={isProcessing}>
                                <Check size={14} />
                              </button>
                              <button className="btn btn-icon btn-danger btn-sm !w-8 !h-8" title="Hủy" onClick={() => setEditingId(null)}>
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Reorder */}
                              <button className="btn btn-icon btn-ghost btn-sm text-slate-400 hover:text-blue-600" onClick={() => moveItem(idx, 'up')} disabled={idx === 0 || isProcessing}>
                                <ArrowUp size={14} />
                              </button>
                              <button className="btn btn-icon btn-ghost btn-sm text-slate-400 hover:text-blue-600" onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1 || isProcessing}>
                                <ArrowDown size={14} />
                              </button>
                              <div className="w-px h-4 bg-slate-200 mx-1" />
                              {/* Edit */}
                              <button className="btn btn-icon btn-ghost btn-sm text-slate-400 hover:text-amber-500" title="Sửa tên" onClick={() => startEdit(item)}>
                                <Edit2 size={14} />
                              </button>
                              {/* Toggle */}
                              <button 
                                className={`text-[11px] font-bold px-2 py-1 rounded-md transition-all ${
                                  item.isActive ? 'text-slate-400 hover:text-red-500' : 'text-green-600 hover:bg-green-50'
                                }`}
                                onClick={() => toggleActive(item)}
                              >
                                {item.isActive ? 'Ẩn' : 'Bật'}
                              </button>
                              {/* Delete */}
                              <button className="btn btn-icon btn-danger !w-7 !h-7" title="Xoá vĩnh viễn" onClick={() => handleDelete(item)} disabled={isProcessing}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
