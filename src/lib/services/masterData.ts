import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MasterDataItem, MasterDataMap } from '@/types';

const COL = 'master_data';

export async function getMasterData(): Promise<MasterDataMap> {
  // Fetch ALL documents without ordering to avoid index requirements in Firestore
  const snap = await getDocs(collection(db, COL));

  const result: MasterDataMap = {};
  
  // Map and Sort by group and then numeric order using JavaScript
  const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() } as MasterDataItem & { id: string }));
  
  // Group them first
  allItems.forEach(item => {
    if (!result[item.group]) result[item.group] = [];
    result[item.group].push(item);
  });

  // Sort each group internally by the 'order' field
  Object.keys(result).forEach(group => {
    result[group].sort((a, b) => (a.order || 0) - (b.order || 0));
  });

  return result;
}

export async function addMasterDataItem(item: Omit<MasterDataItem, 'id'>): Promise<void> {
  await addDoc(collection(db, COL), { ...item, createdAt: Timestamp.now() });
}

export async function updateMasterDataItem(id: string, data: Partial<MasterDataItem>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: Timestamp.now() });
}

export async function deleteMasterDataItem(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

// Master data group names
export const MASTER_GROUPS = {
  SUPPLIER: 'supplier',
  DEPT: 'dept',
  PIC: 'pic',
  INCIDENT_TYPE: 'incident_type',
  CLASSIFICATION: 'classification',
  TAG: 'tag',
  STATUS: 'status',
  UNIT: 'unit',
} as const;
