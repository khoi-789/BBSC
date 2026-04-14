'use client';
import { createContext, useContext, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';

const AuthContext = createContext<null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setFirebaseUser, loadProfile, clearUser, setLoading } = useAuthStore();
  const { loadMasterData } = useAppStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setFirebaseUser(user);
        await Promise.all([loadProfile(user.uid), loadMasterData()]);
      } else {
        clearUser();
      }
    });
    return () => unsubscribe();
  }, []);

  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>;
}
