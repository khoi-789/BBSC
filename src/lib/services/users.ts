import { collection, getDocs, query, where, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';

const COL = 'users';

export async function getUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDocs(query(collection(db, COL), where('__name__', '==', uid)));
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...snap.docs[0].data() } as UserProfile;
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  await setDoc(doc(db, COL, profile.uid), {
    ...profile,
    createdAt: profile.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, COL, uid), { ...data, updatedAt: Timestamp.now() });
}

// Returns active users who have isPic=true, sorted by displayName.
// Used for PIC / sub-PIC dropdowns in the report form.
// NOTE: Only uses single where() to avoid Firestore composite index requirement.
// isActive is filtered client-side.
export async function getPicUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(
    query(collection(db, COL), where('isPic', '==', true))
  );
  const users = snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
    .filter(u => u.isActive !== false); // filter isActive client-side
  return users.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
}
