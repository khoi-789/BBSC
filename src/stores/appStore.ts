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
      const data = await getMasterData();
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
