'use client';
import { create } from 'zustand';
import { MasterDataMap, BBSCReport } from '@/types';
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
  filterItemCode: string;
  filterLotNumber: string;
  filterItemName: string;
  detailClassification: boolean;
  detailIncident: boolean;
  pageSize: number;
  page: number;
}

interface AppState {
  masterData: MasterDataMap;
  isMasterDataLoaded: boolean;
  loadMasterData: () => Promise<void>;
  
  // Tổng kho Reports
  allReports: BBSCReport[];
  lastSync: number; // timestamp
  isReportsLoaded: boolean;
  setAllReports: (reports: BBSCReport[]) => void;
  upsertReports: (newOrModified: BBSCReport[]) => void;
  
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
  filterItemCode: '',
  filterLotNumber: '',
  filterItemName: '',
  detailClassification: false,
  detailIncident: false,
  pageSize: 10,
  page: 1,
};

export const useAppStore = create<AppState>((set) => ({
  masterData: {},
  isMasterDataLoaded: false,
  
  allReports: [],
  lastSync: 0,
  isReportsLoaded: false,

  reportFilters: DEFAULT_FILTERS,

  loadMasterData: async () => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('master_data_cache');
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
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

  setAllReports: (reports) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bbsc_reports_cache', JSON.stringify({
        data: reports,
        lastSync: Date.now()
      }));
    }
    set({ allReports: reports, isReportsLoaded: true, lastSync: Date.now() });
  },
  
  upsertReports: (newDocs) => set((state) => {
    const updated = [...state.allReports];
    newDocs.forEach(doc => {
      const idx = updated.findIndex(r => r.id === doc.id);
      if (idx > -1) {
        updated[idx] = doc;
      } else {
        updated.unshift(doc);
      }
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem('bbsc_reports_cache', JSON.stringify({
        data: updated,
        lastSync: Date.now()
      }));
    }

    return { allReports: updated, lastSync: Date.now() };
  }),

  setReportFilters: (filters) => set((state) => ({
    reportFilters: { ...state.reportFilters, ...filters }
  })),

  resetReportFilters: () => set({ reportFilters: DEFAULT_FILTERS }),
}));

// Helper to pre-load from cache before app starts
export const initReportsFromCache = () => {
  if (typeof window === 'undefined') return;
  const cached = localStorage.getItem('bbsc_reports_cache');
  if (cached) {
    try {
      const { data, lastSync } = JSON.parse(cached);
      useAppStore.setState({ allReports: data, lastSync, isReportsLoaded: true });
    } catch (e) {
      console.error('Failed to parse reports cache');
    }
  }
};
