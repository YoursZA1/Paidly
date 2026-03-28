import { create } from "zustand";
import { fetchAffiliateDashboardData } from "@/api/affiliateClient";

/**
 * Affiliate dashboard server payload.
 * Always update with `set({ affiliateData: data })` — never assign `state.affiliateData = data` or mutate nested fields in place.
 */
export const useAffiliateDashboardStore = create((set) => ({
  affiliateData: null,
  loadError: null,
  loading: true,
  refreshing: false,

  /**
   * Load or refresh dashboard data. Replaces `affiliateData` with a new object reference on success.
   */
  fetchDashboard: async (isRefresh = false) => {
    if (import.meta.env.DEV) {
      console.log("[AffiliateDashboard] fetchDashboard", { isRefresh: !!isRefresh });
    }

    if (isRefresh) {
      set({ refreshing: true, loadError: null });
    } else {
      set({ loading: true, loadError: null });
    }

    const res = await fetchAffiliateDashboardData();

    if (!res.ok) {
      set({
        loadError: res.error || "Could not load affiliate data",
        affiliateData: null,
        loading: false,
        refreshing: false,
      });
      return;
    }

    // Shallow copy so store always holds a fresh object reference → React re-renders reliably.
    set({
      affiliateData: { ...res },
      loadError: null,
      loading: false,
      refreshing: false,
    });
  },

  /**
   * Manually set affiliate dashboard data
   */
  setAffiliateDashboard: (data) => {
    set({ affiliateData: { ...data } });
  },

  /**
   * Manually set loading state
   */
  setLoading: (isLoading) => {
    set({ loading: isLoading });
  },

  /**
   * Manually set error state
   */
  setLoadError: (error) => {
    set({ loadError: error });
  },
}));
