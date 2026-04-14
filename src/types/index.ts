// ============================================================
// BBSC System v3.0 – Core TypeScript Types
// ============================================================

import { Timestamp } from 'firebase/firestore';

// ---- User & Auth ----
export type UserRole = 'Admin' | 'Manager' | 'Staff';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  linkedPic?: string; // This is the shortened PIC Name
  isPic?: boolean;    // Flag to show in PIC dropdowns
  isActive: boolean;
  lastLogin?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ---- Master Data ----
export interface MasterDataItem {
  key: string;
  value: string;
  order: number;
  isActive: boolean;
  group: string;
  color?: string; // Hex color for Tags e.g. #ff0000
  isUrgent?: boolean; // Flag for urgent incident types
}

export interface MasterDataMap {
  [group: string]: MasterDataItem[];
}

// ---- BBSC Report ----
export type ReportStatus =
  | 'Khởi tạo'
  | 'Đang xử lý'
  | 'Hoàn tất'
  | 'Hủy'
  | 'Chờ hết INV'
  | 'Chờ xác nhận';

export interface ReportItem {
  id: string;            // client-side temp id for list key
  itemCode: string;
  itemName: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  unit: string;
  issueType: string;
  note?: string;
}

export interface ReportHeader {
  supplier: string;       // NCC
  invoiceNo: string;      // Số HĐ
  incidentType: string;   // Loại sự cố
  dept: string;           // Bộ phận phát hiện
  pic: string;            // PIC Chính
  subPic?: string;        // PIC Phụ
  tags?: string;
  note?: string;
  classification?: string; // Phân loại hàng (Header level)
  createdDate: string;    // yyyy-MM-dd
  status: ReportStatus;
  completedDate?: string;
  investigation?: string;
  immediateAction?: string;
}

export interface ReportTask {
  id: string;
  content: string;
  progress: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface BBSCReport {
  id: string;                     // Firestore doc ID = reportId
  reportId: string;               // BBSC-YYYYMMDD-XXXX
  header: ReportHeader;
  items: ReportItem[];
  tasks?: ReportTask[];
  attachments?: string[];
  createdBy: string;              // uid
  createdByName: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
  updatedByName?: string;
  reasonForChange?: string;
}

// ---- Audit Log ----
export type AuditAction = 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'DELETED';

export interface AuditLog {
  id: string;
  reportId: string;
  reportNo: string;
  action: AuditAction;
  performedBy: string;
  performedByName: string;
  changes?: {
    old?: Partial<BBSCReport>;
    new?: Partial<BBSCReport>;
    reason?: string;
  };
  timestamp: Timestamp;
}

// ---- UI / Form ----
export interface FilterState {
  status: string;
  dept: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

// ---- Diff Engine ----
export type DiffStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';

export interface DiffedItem extends ReportItem {
  diffStatus: DiffStatus;
  oldValues?: Partial<ReportItem>;
}
