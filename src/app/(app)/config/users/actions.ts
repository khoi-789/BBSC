'use server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { UserProfile } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function adminCreateUser(data: {
  username: string;
  password?: string;
  displayName: string;
  role: string;
  department: string;
  linkedPic?: string; // Shortened name
  isPic?: boolean;    // Is this user a PIC?
}) {
  try {
    let uid = '';
    let email = '';

    const isPicOnly = data.username === 'PIC_ONLY';

    if (isPicOnly) {
      // For PIC-only, we don't create an Auth account
      uid = `pic_${Date.now()}`;
      email = `pic_only_${uid}@pic.bbsc.com`;
    } else {
      // Normalize username to email-like format for Firebase Auth
      email = data.username.toLowerCase().trim();
      if (!email.includes('@')) {
        email = `${email}@bbsc.com`;
      }

      // 1. Create User in Auth
      const userRecord = await adminAuth.createUser({
        email,
        password: data.password || 'BBSC123456', // Default password
        displayName: data.displayName,
      });
      uid = userRecord.uid;
    }

    // 2. Create Profile in Firestore
    const profile: any = {
      uid,
      email,
      displayName: data.displayName,
      role: data.role as any,
      department: data.department,
      linkedPic: data.linkedPic || '',
      isPic: !!data.isPic,
      isActive: true,
      isPicOnly: isPicOnly,
      lastLogin: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await adminDb.collection('users').doc(uid).set(profile);

    return { success: true, uid };
  } catch (error: any) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
}

export async function adminResetPassword(uid: string) {
  try {
    const user = await adminDb.collection('users').doc(uid).get();
    if (!user.exists) throw new Error('User not found');
    const email = user.data()?.email;
    if (!email || email.includes('@pic.bbsc.com')) throw new Error('Cannot reset password for this user type');

    await adminAuth.updateUser(uid, { password: 'BBSC123456' });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function adminDeleteUser(uid: string) {
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error('User not found');
    const email = userDoc.data()?.email;

    // Only delete from Auth if it's NOT a PIC-only placeholder email
    if (email && !email.includes('@pic.bbsc.com')) {
      await adminAuth.deleteUser(uid);
    }

    await adminDb.collection('users').doc(uid).delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function adminUpgradeToUser(uid: string, data: { username: string; password?: string }) {
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error('User not found');
    
    let email = data.username.toLowerCase().trim();
    if (!email.includes('@')) email = `${email}@bbsc.com`;

    const userRecord = await adminAuth.createUser({
      email,
      password: data.password || 'BBSC123456',
      displayName: userDoc.data()?.displayName,
    });

    const newUid = userRecord.uid;
    const oldData = userDoc.data();

    // Create new profile with new UID
    await adminDb.collection('users').doc(newUid).set({
      ...oldData,
      uid: newUid,
      email,
      isPicOnly: false,
      updatedAt: Timestamp.now(),
    });

    // Delete old placeholder
    await adminDb.collection('users').doc(uid).delete();

    return { success: true, uid: newUid };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
