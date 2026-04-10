import { createContext, useContext, useState } from "react";
import { useAppStore } from "@/stores/useAppStore";

const AppContext = createContext(null);

/**
 * App-level control layer: coordinates UI loading flags with Zustand data hydration (Supabase-backed lists).
 * Auth state remains in AuthProvider; notifications for the bell live in Supabase + NotificationBell.
 */
export function AppProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const isDataHydrating = useAppStore((s) => s.isLoading);
  const dataHydrationError = useAppStore((s) => s.error);
  const lastDataFetchedAt = useAppStore((s) => s.lastFetchedAt);

  return (
    <AppContext.Provider
      value={{
        loading,
        setLoading,
        isDataHydrating,
        dataHydrationError,
        lastDataFetchedAt,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export const useAppContext = useApp;
