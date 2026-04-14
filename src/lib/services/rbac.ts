import { collection, getDocs, setDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COL = 'rbac_config';

export interface RBACPermission {
  isRequired: boolean;
  statusPermissions: Record<string, boolean>; // statusKey -> canEdit/isVisible? usually canEdit
}

export interface RBACConfig {
  id: string; // role name (e.g. 'Admin', 'QA', 'Manager', 'Staff')
  fields: Record<string, RBACPermission>;
}

export const RBAC_FIELDS = [
  { key: 'createdDate', label: 'Ngày lập phiếu', group: 'header' },
  { key: 'supplier', label: 'Nhà cung cấp', group: 'header' },
  { key: 'classification', label: 'Phân loại hàng', group: 'header' },
  { key: 'incidentType', label: 'Loại sự cố', group: 'header' },
  { key: 'invoiceNo', label: 'Số hóa đơn (INV)', group: 'header' },
  { key: 'dept', label: 'Bộ phận phát hiện', group: 'header' },
  { key: 'pic', label: 'PIC', group: 'header' },
  { key: 'subPic', label: 'sub-PIC', group: 'header' },
  { key: 'tags', label: 'Nhãn dán (Tags)', group: 'header' },
  { key: 'status', label: 'Trạng thái', group: 'header' },
  { key: 'completedDate', label: 'Ngày hoàn tất', group: 'header' },
  { key: 'note', label: 'Ghi chú chung', group: 'header' },
  { key: 'items', label: 'Danh sách hàng hóa (Mục II)', group: 'section' },
  { key: 'investigation', label: 'Điều tra sơ bộ (Mục II)', group: 'section' },
  { key: 'immediateAction', label: 'Hành động khắc phục (Mục II)', group: 'section' },
];

export async function getRBACConfigs(): Promise<RBACConfig[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RBACConfig)).filter(c => c.id !== 'global_fields');
}

export async function getGlobalFields(): Promise<Record<string, boolean>> {
  const snap = await getDocs(query(collection(db, COL), where('__name__', '==', 'global_fields')));
  if (snap.empty) return {};
  return snap.docs[0].data() as Record<string, boolean>;
}

export async function saveRBACConfig(config: RBACConfig): Promise<void> {
  const { id, ...data } = config;
  await setDoc(doc(db, COL, id), data);
}

export async function saveGlobalFields(fields: Record<string, boolean>): Promise<void> {
  await setDoc(doc(db, COL, 'global_fields'), fields);
}

export function checkPermission(
  role: string | undefined, 
  status: string, 
  fieldKey: string, 
  configs: RBACConfig[]
): boolean {
  // 1. Admin ALWAYS has full access
  if (role === 'Admin') return true;

  // 2. Determine target config group
  // If role is 'QA', use 'QA' config. Otherwise, use 'Bộ phận khác' for all other departments.
  const targetGroupId = role === 'QA' ? 'QA' : 'Bộ phận khác';
  
  const config = configs.find(c => c.id === targetGroupId);
  if (!config) return true; // Default to true if config for that group doesn't exist yet
  
  return !!config.fields[fieldKey]?.statusPermissions[status];
}
