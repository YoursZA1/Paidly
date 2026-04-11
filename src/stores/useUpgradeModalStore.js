import { create } from "zustand";

/**
 * Global upgrade modal: locked feature → pick tier → PayFast checkout (see `UpgradeModal.jsx`).
 * @param {string | { featureKey?: string | null, title?: string | null, description?: string | null }} opts
 */
export const useUpgradeModalStore = create((set) => ({
  open: false,
  featureKey: null,
  title: null,
  description: null,
  openUpgradeModal: (opts) => {
    if (typeof opts === "string") {
      set({ open: true, featureKey: opts, title: null, description: null });
      return;
    }
    set({
      open: true,
      featureKey: opts?.featureKey ?? null,
      title: opts?.title ?? null,
      description: opts?.description ?? null,
    });
  },
  closeUpgradeModal: () =>
    set({ open: false, featureKey: null, title: null, description: null }),
}));
