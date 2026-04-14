'use client';
import { create } from 'zustand';
import { MasterDataMap } from '@/types';
import { getMasterData } from '@/lib/services/masterData';

interface AppState {
  masterData: MasterDataMap;
  isMasterDataLoaded: boolean;
  loadMasterData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  masterData: {},
  isMasterDataLoaded: false,

  loadMasterData: async () => {
    try {
      const data = await getMasterData();
      set({ masterData: data, isMasterDataLoaded: true });
    } catch (e) {
      console.error('Failed to load master data:', e);
    }
  },
}));
