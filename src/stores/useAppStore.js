import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Invoice, Client, User, Payment, InvoiceView, Expense, Quote, Payroll } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { getAutoStatusUpdate } from "@/utils/invoiceStatus";
import { withApiLogging } from "@/utils/apiLogger";
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { dashboardInvoicesQueryKey, dashboardPayslipsQueryKey } from "@/services/DashboardDataService";
import { fetchDashboardBootstrap } from "@/services/dashboardBootstrapService";
import { mapDashboardInvoiceSummaryRow } from "@/schemas/dashboardInvoiceSummary";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";

/**
 * Global app store for invoices, clients, user profile, payments, invoice views, and expenses.
 * Hydrated from `/api/dashboard/bootstrap` (when JWT present) or parallel entity lists; persisted via Zustand
 * so return visits are not cold loads. TanStack Query keys are seeded from the same payload.
 * Layout skips full `fetchAll` while data is younger than `PAIDLY_STALE_MS.appStoreBootstrap` (`paidlyClientCachePolicy.js`).
 *
 * Performance: Use selective selectors to avoid re-renders when unrelated state changes.
 * @example
 * // Prefer: only re-render when invoices change
 * const invoices = useAppStore((s) => s.invoices);
 * // Avoid: re-renders on any store change
 * const state = useAppStore();
 */

/** Bumps on each fetchAll start so overlapping runs do not clear `isLoading` while a newer fetch is still in flight. */
let fetchAllGeneration = 0;

const appStorePersistStorage =
  typeof window !== "undefined" && window.localStorage
    ? createJSONStorage(() => window.localStorage)
    : undefined;

export const useAppStore = create(
  persist((set, get) => ({
  invoices: [],
  quotes: [],
  clients: [],
  payslips: [],
  userProfile: null,
  payments: [],
  invoiceViews: [],
  expenses: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,

  /**
   * Fetch all dashboard/invoices data in parallel. Call once when user is present (e.g. in Layout).
   * When `options.accessToken` is set, prefers GET /api/dashboard/bootstrap (single HTTP round-trip).
   * @param {object | null} authUser - Prefer `user` from AuthContext (Supabase-backed); avoids duplicate auth resolution.
   * @param {{ accessToken?: string | null }} [options]
   */
  fetchAll: async (authUser = null, options = null) => {
    const accessToken = options?.accessToken ?? null;
    if (isRecoveryCircuitOpen()) {
      set({ isLoading: false, error: "Session requires reauthentication" });
      return;
    }
    const gen = ++fetchAllGeneration;
    const clearLoadingIfLatest = () => {
      if (gen === fetchAllGeneration) set({ isLoading: false });
    };
    set({ isLoading: true, error: null });
    try {
      const safe = async (endpoint, fn, fallback, timeoutMs = 30000, retries = 1) => {
        try {
          return await withApiLogging(endpoint, () => withTimeoutRetry(fn, timeoutMs, retries));
        } catch {
          return fallback;
        }
      };

      let userData =
        authUser && (authUser.id || authUser.supabase_id) ? { ...authUser } : null;

      if (!userData) {
        userData = await User.getCurrentUser?.();
      }
      if (!userData) {
        try {
          userData = await withTimeoutRetry(
            async () => (await User.restoreFromSupabaseSession?.()) || null,
            6000,
            0
          );
        } catch {
          userData = null;
        }
      }
      if (!userData) {
        try {
          userData = await withApiLogging("auth.me", () => withTimeoutRetry(() => User.me(), 8000, 0));
        } catch {
          userData = null;
        }
      }

      if (!userData) {
        if (gen === fetchAllGeneration) set({ error: "Not authenticated" });
        return;
      }

      const uid = userData?.id || userData?.supabase_id || null;
      const calendarYear = new Date().getFullYear();

      let usedBootstrap = false;
      if (accessToken && typeof accessToken === "string") {
        try {
          const boot = await withApiLogging("dashboard.bootstrap", () =>
            withTimeoutRetry(
              () => fetchDashboardBootstrap({ accessToken, calendarYear }),
              45000,
              0
            )
          );
          if (
            boot &&
            typeof boot === "object" &&
            boot.dashboard &&
            typeof boot.dashboard === "object" &&
            Array.isArray(boot.recentInvoices)
          ) {
            const mergedUser =
              boot.user && typeof boot.user === "object" ? { ...userData, ...boot.user } : userData;
            userData = mergedUser;

            const dash = boot.dashboard;
            let invoicesData = Array.isArray(boot.recentInvoices) ? boot.recentInvoices : [];
            const clientsData = Array.isArray(dash.clients) ? dash.clients : [];
            const quotesData = Array.isArray(dash.quotes) ? dash.quotes : [];
            const payslipsData = Array.isArray(dash.payslips) ? dash.payslips : [];
            const expensesData = Array.isArray(dash.expenses) ? dash.expenses : [];
            const paymentsData = Array.isArray(dash.payments) ? dash.payments : [];

            const updates = (invoicesData || [])
              .map((inv) => ({ inv, update: getAutoStatusUpdate(inv) }))
              .filter(({ update }) => update);

            let resolvedInvoices = invoicesData;
            if (updates.length > 0) {
              await Promise.all(updates.map(({ inv, update }) => Invoice.update(inv.id, update)));
              const updatedMap = new Map(updates.map(({ inv, update }) => [inv.id, update]));
              resolvedInvoices = resolvedInvoices.map((inv) => ({ ...inv, ...(updatedMap.get(inv.id) || {}) }));
            }

            if (gen !== fetchAllGeneration) return;

            usedBootstrap = true;
            const queryClient = getOrCreateAppQueryClient();
            queryClient.setQueryData(
              dashboardInvoicesQueryKey(uid),
              resolvedInvoices.slice(0, 40).map((row) => mapDashboardInvoiceSummaryRow(row))
            );
            queryClient.setQueryData(dashboardPayslipsQueryKey(uid), Array.isArray(payslipsData) ? payslipsData : []);

            set({
              invoices: resolvedInvoices,
              quotes: Array.isArray(quotesData) ? quotesData : [],
              clients: Array.isArray(clientsData) ? clientsData : [],
              payslips: Array.isArray(payslipsData) ? payslipsData : [],
              userProfile: userData,
              payments: Array.isArray(paymentsData) ? paymentsData : [],
              invoiceViews: get().invoiceViews || [],
              expenses: Array.isArray(expensesData) ? expensesData : [],
              error: null,
              lastFetchedAt: Date.now(),
            });
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn("[fetchAll] dashboard bootstrap failed, falling back to entity lists:", e?.message || e);
          }
        }
      }

      if (usedBootstrap) {
        return;
      }

      const primarySettled = await Promise.allSettled([
        // Slightly longer caps so cold Supabase still returns rows; one retry on timeout.
        safe("invoices.list", () => Invoice.list("-created_date", { limit: 50, maxWaitMs: 12000 }), [], 25000, 1),
        safe("clients.list", () => Client.list("-created_date", { limit: 50, maxWaitMs: 12000 }), [], 25000, 1),
        safe("quotes.list", () => Quote.list("-created_date", { limit: 100, maxWaitMs: 12000 }), [], 20000, 1),
        safe("payslips.list", () => Payroll.list("-created_date", { limit: 100, maxWaitMs: 12000 }), [], 20000, 1),
      ]);

      const [invoicesData, clientsData, quotesData, payslipsData] = primarySettled.map((r) =>
        r.status === "fulfilled" ? r.value : []
      );

      // Apply auto status updates (e.g. overdue, viewed) and persist
      const updates = (invoicesData || [])
        .map((inv) => ({ inv, update: getAutoStatusUpdate(inv) }))
        .filter(({ update }) => update);

      let resolvedInvoices = Array.isArray(invoicesData) ? invoicesData : [];
      if (updates.length > 0) {
        await Promise.all(updates.map(({ inv, update }) => Invoice.update(inv.id, update)));
        const updatedMap = new Map(updates.map(({ inv, update }) => [inv.id, update]));
        resolvedInvoices = resolvedInvoices.map((inv) => ({ ...inv, ...(updatedMap.get(inv.id) || {}) }));
      }

      if (gen !== fetchAllGeneration) return;

      const queryClient = getOrCreateAppQueryClient();
      queryClient.setQueryData(
        dashboardInvoicesQueryKey(userData?.id || userData?.supabase_id || null),
        Array.isArray(resolvedInvoices) ? resolvedInvoices : []
      );
      queryClient.setQueryData(
        dashboardPayslipsQueryKey(userData?.id || userData?.supabase_id || null),
        Array.isArray(payslipsData) ? payslipsData : []
      );

      set({
        invoices: resolvedInvoices,
        quotes: Array.isArray(quotesData) ? quotesData : [],
        clients: Array.isArray(clientsData) ? clientsData : [],
        payslips: Array.isArray(payslipsData) ? payslipsData : [],
        userProfile: userData,
        payments: [],
        // Invoice views are hydrated lazily on the Invoices page.
        invoiceViews: get().invoiceViews || [],
        expenses: [],
        error: null,
        lastFetchedAt: Date.now(),
      });

      // Defer non-critical, heavier reads until after first paint.
      setTimeout(async () => {
        try {
          if (isRecoveryCircuitOpen()) return;
          const [paymentsData, expensesData] = await Promise.all([
            safe("payments.list", () => Payment.list("-created_date", { limit: 50, maxWaitMs: 12000 }), [], 25000, 1),
            safe("expenses.list", () => Expense.list("-date", { limit: 50, maxWaitMs: 12000 }), [], 25000, 1),
          ]);
          set({
            payments: Array.isArray(paymentsData) ? paymentsData : [],
            expenses: Array.isArray(expensesData) ? expensesData : [],
          });
        } catch {
          // ignore deferred failures
        }
      }, 250);
    } catch (err) {
      if (gen === fetchAllGeneration) {
        set({
          error: err?.message || "Failed to load data",
        });
      }
    } finally {
      clearLoadingIfLatest();
    }
  },

  /**
   * Optimistically update an invoice in the store, then persist to the database.
   * Reverts local state if the request fails.
   */
  updateInvoice: async (invoiceId, patch) => {
    if (isRecoveryCircuitOpen()) {
      throw new Error("Session requires reauthentication");
    }
    const prev = get().invoices;
    const index = prev.findIndex((i) => i.id === invoiceId);
    if (index === -1) return;
    const next = [...prev];
    next[index] = { ...next[index], ...patch };
    set({ invoices: next });
    const currentUserId = get().userProfile?.id || get().userProfile?.supabase_id || null;
    if (currentUserId) {
      const queryClient = getOrCreateAppQueryClient();
      queryClient.setQueryData(dashboardInvoicesQueryKey(currentUserId), next.slice(0, 40));
    }
    try {
      await Invoice.update(invoiceId, patch);
    } catch (err) {
      console.error("updateInvoice failed, reverting:", err);
      set({ invoices: prev });
      throw err;
    }
  },

  /** Replace a single invoice in the list (e.g. after record payment). */
  setInvoice: (invoiceId, updatedInvoice) => {
    set((state) => ({
      invoices: state.invoices.map((inv) => (inv.id === invoiceId ? { ...inv, ...updatedInvoice } : inv)),
    }));
  },

  /** Merge or insert from Supabase realtime (no network). */
  upsertInvoiceFromRemote: (invoice) =>
    set((state) => {
      const list = state.invoices || [];
      const idx = list.findIndex((i) => i.id === invoice.id);
      let nextInvoices;
      if (idx === -1) {
        nextInvoices = [invoice, ...list];
      } else {
        nextInvoices = [...list];
        nextInvoices[idx] = { ...nextInvoices[idx], ...invoice };
      }
      const currentUserId = state.userProfile?.id || state.userProfile?.supabase_id || null;
      if (currentUserId) {
        const queryClient = getOrCreateAppQueryClient();
        queryClient.setQueryData(dashboardInvoicesQueryKey(currentUserId), nextInvoices.slice(0, 40));
      }
      return { invoices: nextInvoices };
    }),

  removeInvoiceFromRemote: (invoiceId) =>
    set((state) => {
      const nextInvoices = (state.invoices || []).filter((i) => i.id !== invoiceId);
      const currentUserId = state.userProfile?.id || state.userProfile?.supabase_id || null;
      if (currentUserId) {
        const queryClient = getOrCreateAppQueryClient();
        queryClient.setQueryData(dashboardInvoicesQueryKey(currentUserId), nextInvoices.slice(0, 40));
      }
      return { invoices: nextInvoices };
    }),

  upsertClient: (clientId, patch) =>
    set((state) => {
      const existing = (state.clients || []).find((c) => c.id === clientId);
      if (!existing) return state;
      return {
        clients: state.clients.map((client) =>
          client.id === clientId ? { ...client, ...patch, updated_at: new Date().toISOString() } : client
        ),
      };
    }),

  /** Merge or insert from Supabase realtime (no network). */
  upsertClientFromRemote: (client) =>
    set((state) => {
      const list = state.clients || [];
      const idx = list.findIndex((c) => c.id === client.id);
      let nextClients;
      if (idx === -1) {
        nextClients = [client, ...list];
      } else {
        nextClients = [...list];
        nextClients[idx] = { ...nextClients[idx], ...client };
      }
      return { clients: nextClients };
    }),

  removeClientFromRemote: (clientId) =>
    set((state) => ({
      clients: (state.clients || []).filter((c) => c.id !== clientId),
    })),

  prependOptimisticInvoice: (invoice) =>
    set((state) => {
      const nextInvoices = [invoice, ...(state.invoices || [])];
      const currentUserId = state.userProfile?.id || state.userProfile?.supabase_id || null;
      if (currentUserId) {
        const queryClient = getOrCreateAppQueryClient();
        queryClient.setQueryData(dashboardInvoicesQueryKey(currentUserId), nextInvoices.slice(0, 40));
      }
      return { invoices: nextInvoices };
    }),

  replaceOptimisticInvoice: (tempId, realInvoice) =>
    set((state) => {
      const nextInvoices = (state.invoices || []).map((inv) => (inv.id === tempId ? { ...inv, ...realInvoice } : inv));
      const currentUserId = state.userProfile?.id || state.userProfile?.supabase_id || null;
      if (currentUserId) {
        const queryClient = getOrCreateAppQueryClient();
        queryClient.setQueryData(dashboardInvoicesQueryKey(currentUserId), nextInvoices.slice(0, 40));
      }
      return { invoices: nextInvoices };
    }),

  /** Append or replace invoices (e.g. after create). */
  setInvoices: (invoices) => set({ invoices: Array.isArray(invoices) ? invoices : get().invoices }),

  /** Replace payments list (e.g. after Cash Flow or dashboard fetch). */
  setPayments: (payments) => set({ payments: Array.isArray(payments) ? payments : get().payments }),

  /** Replace quotes list (e.g. after fetch). */
  setQuotes: (quotes) => set({ quotes: Array.isArray(quotes) ? quotes : get().quotes }),

  /** Replace payslips list (e.g. after fetch). */
  setPayslips: (payslips) => set({ payslips: Array.isArray(payslips) ? payslips : get().payslips }),

  /**
   * Create an expense and prepend it to the store.
   */
  addExpense: async (expenseData) => {
    if (isRecoveryCircuitOpen()) {
      throw new Error("Session requires reauthentication");
    }
    const created = await Expense.create(expenseData);
    set((state) => ({
      expenses: [created, ...(state.expenses || [])],
    }));
    return created;
  },

  /**
   * Optimistically update an expense in the store, then persist.
   */
  updateExpense: async (expenseId, patch) => {
    if (isRecoveryCircuitOpen()) {
      throw new Error("Session requires reauthentication");
    }
    const prev = get().expenses;
    const index = prev.findIndex((e) => e.id === expenseId);
    if (index === -1) return;
    const next = [...prev];
    next[index] = { ...next[index], ...patch };
    set({ expenses: next });
    try {
      await Expense.update(expenseId, patch);
    } catch (err) {
      console.error("updateExpense failed, reverting:", err);
      set({ expenses: prev });
      throw err;
    }
  },

  /** Remove an expense from the store and delete on the server. */
  deleteExpense: async (expenseId) => {
    if (isRecoveryCircuitOpen()) {
      throw new Error("Session requires reauthentication");
    }
    const prev = get().expenses;
    set({ expenses: prev.filter((e) => e.id !== expenseId) });
    try {
      await Expense.delete(expenseId);
    } catch (err) {
      console.error("deleteExpense failed, reverting:", err);
      set({ expenses: prev });
      throw err;
    }
  },

  /** Replace expenses list (e.g. after fetch). */
  setExpenses: (expenses) => set({ expenses: Array.isArray(expenses) ? expenses : get().expenses }),

  /** Clear store on logout. */
  reset: () =>
    set({
      invoices: [],
      quotes: [],
      clients: [],
      payslips: [],
      userProfile: null,
      payments: [],
      invoiceViews: [],
      expenses: [],
      isLoading: false,
      error: null,
      lastFetchedAt: null,
    }),
}),
  {
    name: "paidly_app_store_v1",
    storage: appStorePersistStorage,
    partialize: (state) => ({
      invoices: state.invoices,
      quotes: state.quotes,
      clients: state.clients,
      payslips: state.payslips,
      userProfile: state.userProfile,
      payments: state.payments,
      invoiceViews: state.invoiceViews,
      expenses: state.expenses,
      lastFetchedAt: state.lastFetchedAt,
    }),
  })
);
