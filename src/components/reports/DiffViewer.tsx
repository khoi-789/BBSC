'use client';
import { DiffedItem, ReportItem } from '@/types';

export function computeDiff(oldItems: ReportItem[], newItems: ReportItem[]): DiffedItem[] {
  const compositeKey = (i: ReportItem) => `${i.itemCode}_${i.batchNo}`;
  const oldMap = new Map(oldItems.map(i => [compositeKey(i), i]));
  const newMap = new Map(newItems.map(i => [compositeKey(i), i]));

  const result: DiffedItem[] = [];

  // Items in NEW
  newItems.forEach(newItem => {
    const key = compositeKey(newItem);
    const old = oldMap.get(key);
    if (!old) {
      result.push({ ...newItem, diffStatus: 'ADDED' });
    } else {
      const changed = old.quantity !== newItem.quantity || old.issueType !== newItem.issueType || old.note !== newItem.note;
      result.push({
        ...newItem,
        diffStatus: changed ? 'MODIFIED' : 'UNCHANGED',
        oldValues: changed ? old : undefined,
      });
    }
  });

  // Items only in OLD (removed)
  oldItems.forEach(old => {
    const key = compositeKey(old);
    if (!newMap.has(key)) {
      result.push({ ...old, diffStatus: 'REMOVED' });
    }
  });

  return result;
}

const DIFF_ROW_CLASS: Record<string, string> = {
  ADDED:     'diff-added',
  REMOVED:   'diff-removed',
  MODIFIED:  'diff-modified',
  UNCHANGED: '',
};
const DIFF_LABEL: Record<string, string> = {
  ADDED: '+ MỚI', REMOVED: '- XÓA', MODIFIED: '~ SỬA', UNCHANGED: '',
};

interface DiffViewerProps {
  oldItems: ReportItem[];
  newItems: ReportItem[];
}

export default function DiffViewer({ oldItems, newItems }: DiffViewerProps) {
  const diffs = computeDiff(oldItems, newItems);
  const hasChanges = diffs.some(d => d.diffStatus !== 'UNCHANGED');

  if (!hasChanges) {
    return <p className="text-sm text-slate-400 italic">Không có thay đổi nào về danh sách hàng hóa.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>Thay đổi</th>
            <th>Mã SP</th>
            <th>Tên SP</th>
            <th>Số lô</th>
            <th>SL (cũ → mới)</th>
            <th>Loại lỗi</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((item, i) => (
            <tr key={i} className={DIFF_ROW_CLASS[item.diffStatus]}>
              <td>
                <span className="badge text-[10px]">{DIFF_LABEL[item.diffStatus]}</span>
              </td>
              <td>{item.itemCode}</td>
              <td>{item.itemName}</td>
              <td>{item.batchNo}</td>
              <td>
                {item.diffStatus === 'MODIFIED' && item.oldValues
                  ? <><s className="text-red-500">{item.oldValues.quantity}</s> → <strong>{item.quantity}</strong></>
                  : item.quantity
                }
              </td>
              <td>
                {item.diffStatus === 'MODIFIED' && item.oldValues?.issueType !== item.issueType
                  ? <><s className="text-red-500">{item.oldValues?.issueType}</s> → {item.issueType}</>
                  : item.issueType
                }
              </td>
              <td>{item.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
