'use client';
import { create } from 'zustand';
import { MasterDataMap } from '@/types';
import { getMasterData } from '@/lib/services/masterData';

interface ReportFilters {
  search: string;
  filterStatus: string;
  showAdvanced: boolean;
  filterSupplier: string;
  filterClass: string;
  filterType: string;
  filterDept: string;
  filterPic: string;
  filterTag: string;
  filterTerm: string;
  detailClassification: boolean;
  detailIncident: boolean;
  pageSize: number;
  page: number;
}

interface AppState {
  masterData: MasterDataMap;
  isMasterDataLoaded: boolean;
  loadMasterData: () => Promise<void>;
  reportFilters: ReportFilters;
  setReportFilters: (filters: Partial<ReportFilters>) => void;
  resetReportFilters: () => void;
}

const DEFAULT_FILTERS: ReportFilters = {
  search: '',
  filterStatus: '',
  showAdvanced: false,
  filterSupplier: '',
  filterClass: '',
  filterType: '',
  filterDept: '',
  filterPic: '',
  filterTag: '',
  filterTerm: '',
  detailClassification: true,
  detailIncident: false,
  pageSize: 10,
  page: 1,
};

export const useAppStore = create<AppState>((set) => ({
  masterData: {},
  isMasterDataLoaded: false,
  reportFilters: DEFAULT_FILTERS,

  loadMasterData: async () => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('master_data_cache');
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          // Check if cache is older than 12 hours
          const isExpired = Date.now() - timestamp > 12 * 60 * 60 * 1000;
          if (!isExpired) {
            set({ masterData: data, isMasterDataLoaded: true });
            return;
          }
        }
      }

      const data = await getMasterData();
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('master_data_cache', JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      }

      set({ masterData: data, isMasterDataLoaded: true });
    } catch (e) {
      console.error('Failed to load master data:', e);
    }
  },

  setReportFilters: (filters) => set((state) => ({
    reportFilters: { ...state.reportFilters, ...filters }
  })),

  resetReportFilters: () => set({ reportFilters: DEFAULT_FILTERS }),
}));
