'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/components/ui/ToastProvider';
import { createReport, updateReport } from '@/lib/services/reports';
import { BBSCReport, ReportItem, ReportStatus, UserProfile } from '@/types';
import { PlusCircle, Trash2, Save, Send } from 'lucide-react';
import { ALL_STATUSES } from '@/components/ui/StatusBadge';
import { getPicUsers } from '@/lib/services/users';

interface FormValues {
  header: {
    createdDate: string;
    supplier: string;
    invoiceNo: string;
    incidentType: string;
    dept: string;
    pic: string;
    subPic: string;
    tags: string;
    status: ReportStatus;
    note: string;
    completedDate: string;
    classification: string;
    investigation?: string;
    immediateAction?: string;
  };
  items: (ReportItem & { lpn?: string; asn?: string; detailedDescription?: string })[];
}

const EMPTY_ITEM = (): any => ({
  id: uuidv4(),
  itemCode: '', itemName: '', batchNo: '',
  expiryDate: '', quantity: 1, unit: 'HOP', 
  lpn: '', asn: '', detailedDescription: '', note: '',
});

interface ReportFormProps {
  existing?: BBSCReport;
}

export default function ReportForm({ existing }: ReportFormProps) {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { masterData } = useAppStore();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [picUsers, setPicUsers] = useState<UserProfile[]>([]);

  // Fetch PIC users once on mount
  useEffect(() => {
    getPicUsers().then(users => {
      setPicUsers(users);
      if (existing) {
        // RHF async default value fix: re-apply values so <select> visually updates when options arrive
        setValue('header.pic', existing.header.pic || '', { shouldDirty: false });
        setValue('header.subPic', existing.header.subPic || '', { shouldDirty: false });
      }
    });
  }, [existing, setValue]);

  const suppliers   = (masterData['supplier']      || []).filter((i: any) => i.isActive);
  const depts       = (masterData['dept']          || []).filter(i => i.isActive);
  const types       = (masterData['incident_type'] || []).filter(i => i.isActive);
  const tags        = (masterData['tag']            || []).filter(i => i.isActive);
  const units       = (masterData['unit']          || []).filter(i => i.isActive);
  const classes     = (masterData['classification'] || []).filter(i => i.isActive);
  const statusOpts   = (masterData['status']        || []).filter(i => i.isActive);

  const { register, control, handleSubmit, formState: { errors, isDirty }, setValue } = useForm<FormValues>({
    defaultValues: existing ? {
      header: {
        ...existing.header,
        classification: (existing.header as any).classification || '',
        completedDate: (existing.header as any).completedDate || '',
        investigation: existing.header.investigation || '',
        immediateAction: existing.header.immediateAction || '',
      } as any,
      items: (existing.items || []).map(i => {
        // Normalize: strip old `issueType` (it's now `detailedDescription` in the form)
        const { issueType: _drop, ...rest } = i as any;
        return {
          ...rest,
          lpn: (i as any).lpn || '',
          asn: (i as any).asn || '',
          detailedDescription: (i as any).detailedDescription || (i as any).issueType || '',
        };
      }),
    } : {
      header: {
        createdDate: new Date().toISOString().slice(0, 10),
        supplier: '', invoiceNo: '', incidentType: '',
        dept: profile?.department || '', pic: profile?.linkedPic || '',
        subPic: '', tags: '', status: 'Khởi tạo', note: '', completedDate: '',
        classification: '',
        investigation: '', immediateAction: '',
      },
      items: [EMPTY_ITEM()],
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // RBAC
  const [rbacConfigs, setRbacConfigs] = useState<any[]>([]);
  const [globalFields, setGlobalFields] = useState<any>({});
  
  useEffect(() => {
    const { getRBACConfigs, getGlobalFields } = require('@/lib/services/rbac');
    Promise.all([getRBACConfigs(), getGlobalFields()]).then(([configs, globals]) => {
      setRbacConfigs(configs);
      setGlobalFields(globals);
    });
  }, []);

  const currentStatus = existing?.header.status || 'Khởi tạo';
  
  const isReadonly = (fieldKey: string) => {
    const { checkPermission } = require('@/lib/services/rbac');
    return !checkPermission(profile?.role, currentStatus, fieldKey, rbacConfigs);
  };

  const isMandatory = (fieldKey: string) => !!globalFields[fieldKey];

  const watchedSupplier = useWatch({ control, name: 'header.supplier' });
  const watchedDate = useWatch({ control, name: 'header.createdDate' });
  const watchedPic = useWatch({ control, name: 'header.pic' });

  function formatDate(d: string) {
    if (!d) return '';
    const part = d.split('-');
    if (part.length === 3) return `${part[2]}/${part[1]}/${part[0]}`;
    return d;
  }

  // Real-time auto-population
  useEffect(() => {
    const inv = control._formValues.header.investigation;
    const act = control._formValues.header.immediateAction;

    if (watchedSupplier && watchedDate) {
      if (!inv || inv.startsWith('Hàng ')) {
        const supplierObj = suppliers.find(s => s.key === watchedSupplier);
        const supplierName = supplierObj ? supplierObj.value : watchedSupplier;
        setValue('header.investigation', `Hàng ${supplierName} nhập ngày ${formatDate(watchedDate)}, trong quá trình ... phát hiện sự cố, mô tả chi tiết như bảng trên`, { shouldDirty: false });
      }
      if (!act || act === 'Chuyển khu vực biệt trữ, thông báo đến hãng và bộ phận liên quan') {
        setValue('header.immediateAction', `Chuyển khu vực biệt trữ, thông báo đến hãng và bộ phận liên quan`, { shouldDirty: false });
      }
    }
  }, [watchedSupplier, watchedDate, suppliers, setValue, control]);

  async function onSubmit(data: FormValues, status?: ReportStatus) {
    if (!profile) return;
    setSubmitting(true);
    try {
      const finalStatus = status || data.header.status;

      // Normalize items: map detailedDescription -> issueType (canonical Firestore field)
      // This ensures audit diff doesn't show false changes between old issueType and new detailedDescription
      const normalizedItems = data.items.map(({ detailedDescription, ...rest }: any) => ({
        ...rest,
        issueType: detailedDescription || rest.issueType || '',
      }));

      const payload = {
        ...data,
        header: { ...data.header, status: finalStatus },
        items: normalizedItems,
      };

      if (existing) {
        await updateReport(existing.id, payload, profile.uid, profile.displayName, 'Cập nhật qua form');
        toast('Đã cập nhật phiếu sự cố', 'success');
        router.push(`/dashboard/${existing.id}`);
      } else {
        const id = await createReport(payload as any, profile.uid, profile.displayName);
        toast('Tạo phiếu sự cố thành công!', 'success');
        router.push(`/dashboard/${id}`);
      }
    } catch (e: any) {
      toast(e.message || 'Đã xảy ra lỗi', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(d => onSubmit(d))} className="flex flex-col gap-1.5">

      {/* ─── SECTION 1: HEADER ─── */}
      <div className="card !p-2">
        <h2 className="text-[12px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase">
          THÔNG TIN CHUNG
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5">

          {/* Row 1 */}
          <div>
            <label className="form-label">Mã sự cố (System ID)</label>
            <input 
              readOnly 
              className="form-input bg-slate-50 text-slate-500 font-bold" 
              value={existing ? existing.reportId : '(Tự động sinh)'} 
            />
          </div>

          <div>
            <label className="form-label">Ngày lập phiếu {isMandatory('createdDate') && <span className="required">*</span>}</label>
            <input id="f-created-date" type="date" className="form-input font-medium" disabled={isReadonly('createdDate')} {...register('header.createdDate', { required: isMandatory('createdDate') })} />
          </div>

          {/* Row 2 */}
          <div>
            <label className="form-label">Nhà cung cấp (NCC) {isMandatory('supplier') && <span className="required">*</span>}</label>
            <select id="f-supplier" className="form-select" disabled={isReadonly('supplier')} {...register('header.supplier', { required: isMandatory('supplier') })}>
              <option value="">— Chọn —</option>
              {suppliers.map(s => <option key={s.key} value={s.key}>{s.value}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Phân loại hàng {isMandatory('classification') && <span className="required">*</span>}</label>
            <select id="f-class" className="form-select" disabled={isReadonly('classification')} {...register('header.classification', { required: isMandatory('classification') })}>
              <option value="">— Chọn —</option>
              {classes.map(c => <option key={c.key} value={c.key}>{c.value}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Loại sự cố {isMandatory('incidentType') && <span className="required">*</span>}</label>
            <select id="f-incident-type" className="form-select" disabled={isReadonly('incidentType')} {...register('header.incidentType', { required: isMandatory('incidentType') })}>
              <option value="">— Chọn —</option>
              {types.map(t => <option key={t.key} value={t.key}>{t.value}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Số hóa đơn (INV/PO) {isMandatory('invoiceNo') && <span className="required">*</span>}</label>
            <input id="f-invoice" type="text" className="form-input" placeholder="Nhập số INV..." disabled={isReadonly('invoiceNo')} {...register('header.invoiceNo', { required: isMandatory('invoiceNo') })} />
          </div>

          {/* Row 3 */}
          <div>
            <label className="form-label">Bộ phận phát hiện {isMandatory('dept') && <span className="required">*</span>}</label>
            <select id="f-dept" className="form-select" disabled={isReadonly('dept')} {...register('header.dept', { required: isMandatory('dept') })}>
              <option value="">— Chọn —</option>
              {depts.map(d => <option key={d.key} value={d.key}>{d.value}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">PIC {isMandatory('pic') && <span className="required">*</span>}</label>
            <select id="f-pic" className="form-select" disabled={isReadonly('pic')} {...register('header.pic', { required: isMandatory('pic') })}>
              <option value="">— Chọn —</option>
              {picUsers.map(u => (
                <option key={u.uid} value={u.linkedPic || u.displayName}>
                  {u.displayName}{u.department ? ` (${u.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">sub-PIC {isMandatory('subPic') && <span className="required">*</span>}</label>
            <select id="f-sub-pic" className="form-select" disabled={isReadonly('subPic')} {...register('header.subPic', { required: isMandatory('subPic') })}>
              <option value="">(Không có)</option>
              {picUsers
                .filter(u => (u.linkedPic || u.displayName) !== watchedPic)
                .map(u => (
                  <option key={u.uid} value={u.linkedPic || u.displayName}>
                    {u.displayName}{u.department ? ` (${u.department})` : ''}
                  </option>
                ))
              }
            </select>
          </div>

          <div>
            <label className="form-label">Nhãn dán (Tags) {isMandatory('tags') && <span className="required">*</span>}</label>
            <select id="f-tags" className="form-select" disabled={isReadonly('tags')} {...register('header.tags', { required: isMandatory('tags') })}>
              <option value="">— Chọn —</option>
              {tags.map(t => <option key={t.key} value={t.key}>{t.value}</option>)}
            </select>
          </div>

          {/* Row 4 */}
          <div>
            <label className="form-label">Trạng thái hồ sơ {isMandatory('status') && <span className="required">*</span>}</label>
            <select id="f-status" className="form-select" disabled={isReadonly('status')} {...register('header.status', { required: isMandatory('status') })}>
              {statusOpts.map(s => <option key={s.key} value={s.value}>{s.value}</option>)}
              {statusOpts.length === 0 && ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Ngày hoàn tất {isMandatory('completedDate') && <span className="required">*</span>}</label>
            <input id="f-completed-date" type="date" className="form-input" disabled={isReadonly('completedDate')} {...register('header.completedDate', { required: isMandatory('completedDate') })} />
          </div>

          <div className="col-span-2">
            <label className="form-label">Ghi chú chung {isMandatory('note') && <span className="required">*</span>}</label>
            <textarea 
              id="f-note" 
              className="form-textarea w-full !min-h-[40px]" 
              placeholder="Ghi chú thêm..." 
              disabled={isReadonly('note')}
              {...register('header.note', { required: isMandatory('note') })} 
            />
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: ITEMS ─── */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase">
            DANH SÁCH HÀNG HÓA SỰ CỐ {isMandatory('items') && <span className="required">*</span>}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isReadonly('items')}
            onClick={() => append(EMPTY_ITEM())}
          >
            <PlusCircle size={14} /> Thêm dòng
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }} className="rounded-tl-lg">#</th>
                <th style={{ minWidth: 100 }}>Mã SP</th>
                <th style={{ minWidth: 150 }}>Tên sản phẩm</th>
                <th style={{ minWidth: 120 }}>Số lô</th>
                <th style={{ minWidth: 110 }}>HSD</th>
                <th style={{ width: 60 }}>SL</th>
                <th style={{ width: 80 }}>ĐVT</th>
                <th style={{ width: 100 }}>LPN</th>
                <th style={{ width: 100 }}>ASN</th>
                <th style={{ minWidth: 150 }}>Mô tả chi tiết</th>
                <th style={{ minWidth: 100 }}>Hành động</th>
                <th style={{ width: 40 }} className="rounded-tr-lg"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => (
                <tr key={field.id}>
                  <td className="text-center text-slate-400 text-xs">{idx + 1}</td>
                  <td><input id={`item-code-${idx}`} className="form-input" placeholder="Mã SP" disabled={isReadonly('items')} {...register(`items.${idx}.itemCode` as any)} /></td>
                  <td><input id={`item-name-${idx}`} className="form-input" placeholder="Tên sản phẩm" disabled={isReadonly('items')} {...register(`items.${idx}.itemName` as any)} /></td>
                  <td><input id={`batch-no-${idx}`} className="form-input" placeholder="Số lô" disabled={isReadonly('items')} {...register(`items.${idx}.batchNo` as any)} /></td>
                  <td><input id={`expiry-${idx}`} type="date" className="form-input" disabled={isReadonly('items')} {...register(`items.${idx}.expiryDate` as any)} /></td>
                  <td>
                    <input
                      id={`qty-${idx}`} type="number" min="0" className="form-input text-right !px-1"
                      disabled={isReadonly('items')}
                      {...register(`items.${idx}.quantity` as any, { valueAsNumber: true, min: 0 })}
                    />
                  </td>
                  <td>
                    <select id={`unit-${idx}`} className="form-select !px-1" disabled={isReadonly('items')} {...register(`items.${idx}.unit` as any)}>
                      {units.length > 0
                        ? units.map(u => <option key={u.key} value={u.key}>{u.value}</option>)
                        : ['HOP', 'VIEN', 'LON', 'TUBE', 'ONG', 'CHAI'].map(u => <option key={u} value={u}>{u}</option>)
                      }
                    </select>
                  </td>
                  <td><textarea id={`lpn-${idx}`} className="form-textarea !min-h-[38px] !py-1" placeholder="LPN" disabled={isReadonly('items')} {...register(`items.${idx}.lpn` as any)} /></td>
                  <td><textarea id={`asn-${idx}`} className="form-textarea !min-h-[38px] !py-1" placeholder="ASN" disabled={isReadonly('items')} {...register(`items.${idx}.asn` as any)} /></td>
                  <td><textarea id={`desc-${idx}`} className="form-textarea !min-h-[38px] !py-1" placeholder="Mô tả lỗi" disabled={isReadonly('items')} {...register(`items.${idx}.detailedDescription` as any)} /></td>
                  <td><textarea id={`item-note-${idx}`} className="form-textarea !min-h-[38px] !py-1" placeholder="Hành động" disabled={isReadonly('items')} {...register(`items.${idx}.note` as any)} /></td>
                  <td>
                    {fields.length > 1 && !isReadonly('items') && (
                      <button type="button" onClick={() => remove(idx)} className="btn btn-icon btn-danger !w-7 !h-7" title="Xóa dòng">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── SECTION 3: INVESTIGATION ─── */}
      <div className="card !p-2">
        <h2 className="text-[12px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase">
          ĐIỀU TRA & XỬ LÝ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Điều tra sơ bộ (Mục II) {isMandatory('investigation') && <span className="required">*</span>}</label>
            <textarea 
              className="form-textarea !min-h-[80px]" 
              placeholder="Kết quả điều tra nguyên nhân..." 
              disabled={isReadonly('investigation')}
              {...register('header.investigation', { required: isMandatory('investigation') })}
            />
          </div>
          <div>
            <label className="form-label">Hành động khắc phục (Mục II) {isMandatory('immediateAction') && <span className="required">*</span>}</label>
            <textarea 
              className="form-textarea !min-h-[80px]" 
              placeholder="Các hành động đã thực hiện ngay..." 
              disabled={isReadonly('immediateAction')}
              {...register('header.immediateAction', { required: isMandatory('immediateAction') })}
            />
          </div>
        </div>
      </div>

      {/* ─── ACTIONS ─── */}
      <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
        <button type="button" onClick={() => router.back()} className="btn btn-danger btn-sm px-6 font-bold">
          Hủy
        </button>

        {/* For existing reports: only show save buttons when there are actual changes */}
        {existing ? (
          <>
            <button
              id="btn-save-draft"
              type="button"
              disabled={submitting || !isDirty}
              title={!isDirty ? 'Chưa có thay đổi nào để lưu' : undefined}
              onClick={handleSubmit(d => onSubmit(d, 'Khởi tạo'))}
              className={`btn btn-ghost border-blue-300 text-blue-700 ${!isDirty ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Save size={15} /> Lưu nháp
            </button>
            <button
              id="btn-submit-report"
              type="submit"
              disabled={submitting || !isDirty}
              title={!isDirty ? 'Chưa có thay đổi nào để cập nhật' : undefined}
              className={`btn btn-primary ${!isDirty ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Send size={15} /> {submitting ? 'Đang lưu...' : 'Cập nhật'}
            </button>
          </>
        ) : (
          <button
            id="btn-submit-report"
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
          >
            <Send size={15} /> {submitting ? 'Đang lưu...' : 'Tạo phiếu'}
          </button>
        )}
      </div>
    </form>
  );
}
