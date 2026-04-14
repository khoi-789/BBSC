'use client';
import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile } from '@/types';
import { getUserProfile } from '@/lib/services/users';

interface AuthState {
  firebaseUser: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  setFirebaseUser: (user: User | null) => void;
  loadProfile: (uid: string) => Promise<void>;
  clearUser: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  setFirebaseUser: (user) => set({ firebaseUser: user }),

  loadProfile: async (uid) => {
    const profile = await getUserProfile(uid);
    set({ profile, isInitialized: true, isLoading: false });
  },

  clearUser: () => set({ firebaseUser: null, profile: null, isInitialized: true, isLoading: false }),

  setLoading: (v) => set({ isLoading: v }),
}));
