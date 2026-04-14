'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { getRBACConfigs, saveRBACConfig, RBAC_FIELDS, RBACConfig } from '@/lib/services/rbac';
import { ALL_STATUSES } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/ToastProvider';
import { Save, ShieldCheck, Loader2 } from 'lucide-react';
import RoleGuard from '@/components/auth/RoleGuard';

const ROLES = ['QA', 'Bộ phận khác'];

export default function RBACPage() {
  return (
    <RoleGuard allowedRoles={['Admin']}>
      <RBACContent />
    </RoleGuard>
  );
}

function RBACContent() {
  const { masterData } = useAppStore();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RBACConfig[]>([]);
  const [globalFields, setGlobalFields] = useState<Record<string, boolean>>({});
  const [activeRole, setActiveRole] = useState(ROLES[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Statuses from master data
  const statusOpts = (masterData['status'] || []).filter(i => i.isActive).map(i => i.value);
  const columnStatuses = statusOpts.length > 0 ? statusOpts : ALL_STATUSES;

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [data, globals] = await Promise.all([
        getRBACConfigs(),
        require('@/lib/services/rbac').getGlobalFields()
      ]);
      setConfigs(data);
      setGlobalFields(globals);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const currentConfig = configs.find(c => c.id === activeRole) || {
    id: activeRole,
    fields: {}
  };

  function toggleRequired(fieldKey: string) {
    setGlobalFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }

  function toggleStatus(fieldKey: string, status: string) {
    const newConfigs = [...configs];
    const idx = newConfigs.findIndex(c => c.id === activeRole);
    let target = idx >= 0 ? newConfigs[idx] : { id: activeRole, fields: {} } as RBACConfig;
    
    if (!target.fields[fieldKey]) {
      target.fields[fieldKey] = { isRequired: false, statusPermissions: {} };
    }
    
    const current = !!target.fields[fieldKey].statusPermissions[status];
    target.fields[fieldKey].statusPermissions[status] = !current;
    
    if (idx >= 0) newConfigs[idx] = target; else newConfigs.push(target);
    setConfigs(newConfigs);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { saveGlobalFields } = require('@/lib/services/rbac');
      await Promise.all([
        saveRBACConfig(currentConfig),
        saveGlobalFields(globalFields)
      ]);
      toast('Đã lưu cấu hình phân quyền (bao gồm các trường bắt buộc)', 'success');
      await load();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="flex flex-col gap-1">
      <div className="card-header flex items-center justify-between relative overflow-hidden">
        <div className="card-header-icon">
          <img src="/img/rbac-bg.png" alt="RBAC" />
        </div>
        <div>
          <h1>CẤU HÌNH PHÂN QUYỀN (RBAC)</h1>
          <p>Thiết lập quyền chỉnh sửa và bắt buộc nhập theo từng trạng thái hồ sơ.</p>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden bg-white shadow-md">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4 relative overflow-hidden">
          {/* Watermark for the select area */}
          <div className="absolute right-0 top-0 bottom-0 w-64 opacity-[0.03] pointer-events-none flex items-center justify-end pr-4">
            <ShieldCheck size={120} className="text-blue-900" />
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="w-64">
              <label className="form-label text-blue-700 font-bold uppercase tracking-wider">Chọn nhóm người dùng</label>
              <select 
                className="form-select !h-10 !text-base font-medium shadow-sm border-slate-300" 
                value={activeRole} 
                onChange={e => setActiveRole(e.target.value)}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            
            <div className="mt-5 text-[11px] text-slate-400 max-w-sm italic">
              * Cấu hình này xác định trường được phép sửa ứng với trạng thái phiếu. 
            </div>
          </div>

          <button 
            className="btn btn-primary shadow-md px-6 flex items-center gap-2 h-10 mt-5 relative z-10" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="font-bold">Lưu quyền</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table !text-[13px]">
            <thead>
              <tr className="!bg-[#1e40af] border-b border-blue-800">
                <th className="!text-white font-bold py-4 px-6 text-left rounded-tl-xl" style={{ minWidth: 200 }}>Trường dữ liệu</th>
                <th className="text-center !text-amber-300 font-bold whitespace-nowrap px-4 py-4 bg-white/5">
                  <div className="flex flex-col items-center gap-1">
                    <span>Bắt buộc nhập (*)</span>
                    <span className="text-[10px] font-normal text-blue-200">Tất cả trạng thái</span>
                  </div>
                </th>
                {columnStatuses.map((s, idx) => (
                  <th key={s} className={`text-center !text-white font-bold whitespace-nowrap px-4 py-4 min-w-[120px] ${idx === columnStatuses.length - 1 ? 'rounded-tr-xl' : ''}`}>
                    <div className="flex flex-col items-center gap-1">
                      <span>{s}</span>
                      <span className="text-[10px] font-normal text-blue-200 lowercase italic">Cho phép sửa?</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RBAC_FIELDS.map((f) => (
                <tr key={f.key} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="py-3 px-6">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-700">{f.label}</span>
                      <span className="text-[10px] font-mono text-slate-300 group-hover:text-blue-400 transition-colors">{f.key}</span>
                    </div>
                  </td>
                  
                  {/* Required Column */}
                  <td className="text-center bg-red-50/10 group-hover:bg-red-50/20 transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      checked={!!globalFields[f.key]}
                      onChange={() => toggleRequired(f.key)}
                    />
                  </td>

                  {/* Status Columns */}
                  {columnStatuses.map(s => (
                    <td key={s} className="text-center px-4">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={!!currentConfig.fields[f.key]?.statusPermissions[s]}
                        onChange={() => toggleStatus(f.key, s)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex items-start gap-3 mt-4">
        <div className="text-blue-600 mt-0.5"><ShieldCheck size={16} /></div>
        <div className="text-[11px] text-slate-600 leading-relaxed">
          <strong>Ghi chú:</strong> Cột <b>Bắt buộc nhập (*)</b> áp dụng chung cho mọi user; <b>Cho phép sửa</b> xác định quyền theo từng trạng thái phiếu. 
          <span className="ml-2 text-blue-700 font-medium">Nhóm <b>Admin</b> mặc định có toàn quyền hệ thống (Full Access).</span>
        </div>
      </div>
    </div>
  );
}
