# React Application Performance Audit

This document summarizes the performance audit and the refactors applied to reduce UI lag and make navigation feel instant.

---

## 1. Duplicate Supabase Queries

### Current state
- **Centralized selects**: `src/api/customClient.js` defines `SUPABASE_SELECT_COLUMNS` and `getSelectColumns(table)`. All `pullFromSupabase`, `get()`, and entity list/line-item fetches use explicit column lists instead of `.select("*")`.
- **Explicit selects in pages**: Invoices, Quotes, AdminInvoicesQuotes, AdminSubscriptions, and invoice/quote_items fetches use explicit column lists.
- **Indexes**: `supabase/migrations/20250316000000_supabase_query_performance_indexes.sql` adds indexes for `invoices`, `quotes`, `invoice_items`, `quote_items`, `clients`, `payments` (created_at, org_id, client_id, status, etc.).

### Duplicate data fetches
- **Layout** calls `fetchAll()` (store) when user is present; **Dashboard** (non-admin) reads from the same store, so one fetch serves both.
- **Layout** skips `fetchAll` when `lastFetchedAt` is within 5 minutes to avoid refetch on re-mount.
- **Invoices** and **Quotes** use React Query with dedicated keys (`invoices-page`, `quotes-page`); **Clients** uses `useClientsQuery` (key `clients`). No duplicate fetches when navigating between these pages within cache window.
- **RecurringInvoices**, **CashFlow**, **Calendar**, **Reports**, **Messages**, etc. previously used `useEffect` + `loadData()` with no cache; they have been (or can be) migrated to React Query to share cache and avoid refetch on back-navigation.

### Recommendation
- Keep using explicit column lists for any new Supabase queries.
- Prefer React Query for list/dashboard data so multiple pages can share cached data (e.g. same clients/invoices).

---

## 2. Components Re-rendering Excessively

### Current state
- **Memoized list components**: `InvoiceList`, `QuoteList`, `InvoiceRow`, `InvoiceMobileCard`, `VirtualizedTableBody`, `QuoteRow` use `React.memo`.
- **Memoized UI components**: `InvoiceStatusBadge`, `PartialPaymentIndicator`, `InvoiceActions`, `QuoteActions`, `BankingCard`, `ServiceCard`, `ExpenseList` use `React.memo`.
- **Stable callbacks**: `InvoiceList` and `QuoteList` use `useCallback` for `getClientName` and `getTotalPaid` so row components don’t re-render unnecessarily.
- **Invoices page** passes `handleActionSuccess` and `handleOptimisticUpdate` via `useCallback`; `onPaymentFullyPaid` is a stable import (`runPaidConfetti`).

### Recommendation
- When adding new list row or card components, wrap them with `React.memo` and pass stable callbacks (`useCallback`) from the parent.

---

## 3. Large Datasets Without Virtualization

### Current state
- **InvoiceList (desktop)**: Uses `@tanstack/react-virtual` with `useVirtualizer`; only visible rows (plus overscan) are rendered; scroll container has `maxHeight: 480px`.
- **QuoteList (desktop)**: Virtualized with `@tanstack/react-virtual` (same pattern as InvoiceList).
- **ClientList**: Desktop table virtualized with `@tanstack/react-virtual`; fixed-height scroll container (`maxHeight: 480px`).
- **ExpenseList (desktop)**: Table virtualized with `@tanstack/react-virtual`; mobile remains card list (no virtualization).
- **Mobile**: Invoice and Quote pages use card lists (no virtualization); ClientList and ExpenseList mobile views unchanged.

### Recommendation
- For any new table that can show 50+ rows, use `useVirtualizer` and a fixed-height scroll container.

---

## 4. Lack of API Caching

### Current state
- **React Query** is used for:
  - **Invoices**: `queryKey: ["invoices-page"]`, `staleTime: 5 * 60 * 1000`, `refetchOnMount: false`.
  - **Quotes**: `queryKey: ["quotes-page"]`, same defaults.
  - **Clients**: `useClientsQuery` with `queryKey: ["clients"]`, `staleTime: 5 * 60 * 1000`, `refetchOnMount: false`.
- **Global defaults** (`main.jsx`): `staleTime: 5 * 60 * 1000`, `gcTime: 10 * 60 * 1000`, `refetchOnWindowFocus: false`, `refetchOnMount: false`.
- **Layout** only calls `fetchAll()` when store data is missing or older than 5 minutes (`lastFetchedAt`).
- **RecurringInvoices** and **CashFlow** migrated to React Query so their data is cached and not refetched when navigating back.

### Recommendation
- Use React Query for any page that fetches list or dashboard data; use consistent query keys and invalidation on mutations/realtime.

---

## 5. Pages Not Using Lazy Loading

### Current state
- **All route components** in `src/pages/index.jsx` are loaded with `React.lazy()` (Dashboard, Invoices, Quotes, Clients, Settings, etc.).
- **Routes** are wrapped in `<Suspense fallback={<RouteFallback />}>` (spinner).
- **Dashboard** additionally lazy-loads `DashboardRevenueChart`.

### Recommendation
- Keep all route-level pages lazy-loaded; add lazy for heavy non-route components (e.g. charts, PDF viewers) where beneficial.

---

## 6. Large JavaScript Bundle Size

### Current state
- **Vite `manualChunks`** (`vite.config.js`) split vendor code into: `supabase`, `recharts`, `framer-motion`, `lucide`, `pdf` (jspdf, html2canvas), `xlsx`, and a generic `vendor` chunk.
- **Lazy routes** ensure each page is in its own chunk; only the current route is loaded.
- Build warns about large chunks (e.g. vendor, pdf, xlsx); these are already split from the main bundle.

### Recommendation
- Consider splitting heavy pages (e.g. Dashboard, CashFlow) further via dynamic imports for sub-components (e.g. charts, tables) if bundle size becomes an issue.
- Optional: add `confetti` to a separate chunk if it’s only used on one flow.

---

## Summary of Refactors

| Area              | Refactor |
|-------------------|----------|
| Supabase queries  | Explicit column lists in customClient and key pages; migration for indexes. |
| Re-renders        | React.memo on list/row/card components; useCallback for handlers passed to children. |
| Virtualization    | InvoiceList desktop table virtualized; QuoteList desktop table virtualized. |
| API caching       | React Query for Invoices, Quotes, Clients, RecurringInvoices, CashFlow; 5 min staleTime, refetchOnMount: false. |
| Lazy loading      | All route components lazy-loaded; Suspense with RouteFallback. |
| Loading states    | DocumentPageSkeleton, CardGridSkeleton, SkeletonTable; skeletons on PublicInvoice, PublicPayslip, QuotePDF, ReportPDF, Vendors, RecurringInvoiceCycleHistory. |
| Navigation state  | Layout skips fetchAll when data is fresh; React Query avoids refetch on mount when cache is valid. |

---

## How to Verify

1. **Production build**: `npm run build` then `npm run preview` — test navigation and list scrolling.
2. **React Query DevTools** (optional): Add `@tanstack/react-query-devtools` in development to inspect cache and refetches.
3. **Profiler**: Use React DevTools Profiler to confirm list rows don’t re-render when parent state unrelated to them changes.
