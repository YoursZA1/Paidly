import { create } from "zustand";
import { Invoice, Client, User, Payment, InvoiceView, Expense } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { getAutoStatusUpdate } from "@/utils/invoiceStatus";

/**
 * Global app store for invoices, clients, user profile, payments, invoice views, and expenses.
 * Fetched in parallel once when the app loads (Layout). Dashboard and Invoices read from here
 * so navigation feels instant and we avoid redundant requests.
 */

export const useAppStore = create((set, get) => ({
  invoices: [],
  clients: [],
  userProfile: null,
  payments: [],
  invoiceViews: [],
  expenses: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,

  /** Fetch all dashboard/invoices data in parallel. Call once when user is present (e.g. in Layout). */
  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [invoicesData, clientsData, userData, paymentsData, viewsData, expensesData] = await withTimeoutRetry(
        () =>
          Promise.all([
            Invoice.list("-created_date"),
            Client.list(),
            (async () => {
              try {
                return await User.me();
              } catch {
                return await User.restoreFromSupabaseSession?.();
              }
            })().catch(() => null),
            Payment.list().catch(() => []),
            InvoiceView.list().catch(() => []),
            Expense.list("-date", 100).catch(() => []),
          ]),
        20000,
        2
      );

      if (!userData) {
        set({ isLoading: false, error: "Not authenticated" });
        return;
      }

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

      set({
        invoices: resolvedInvoices,
        clients: Array.isArray(clientsData) ? clientsData : [],
        userProfile: userData,
        payments: Array.isArray(paymentsData) ? paymentsData : [],
        invoiceViews: Array.isArray(viewsData) ? viewsData : [],
        expenses: Array.isArray(expensesData) ? expensesData : [],
        isLoading: false,
        error: null,
        lastFetchedAt: Date.now(),
      });
    } catch (err) {
      console.error("App store fetchAll failed:", err);
      set({
        isLoading: false,
        error: err?.message || "Failed to load data",
      });
    }
  },

  /**
   * Optimistically update an invoice in the store, then persist to the database.
   * Reverts local state if the request fails.
   */
  updateInvoice: async (invoiceId, patch) => {
    const prev = get().invoices;
    const index = prev.findIndex((i) => i.id === invoiceId);
    if (index === -1) return;
    const next = [...prev];
    next[index] = { ...next[index], ...patch };
    set({ invoices: next });
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

  /** Append or replace invoices (e.g. after create). */
  setInvoices: (invoices) => set({ invoices: Array.isArray(invoices) ? invoices : get().invoices }),

  /**
   * Create an expense and prepend it to the store.
   */
  addExpense: async (expenseData) => {
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
      clients: [],
      userProfile: null,
      payments: [],
      invoiceViews: [],
      expenses: [],
      isLoading: false,
      error: null,
      lastFetchedAt: null,
    }),
}));
