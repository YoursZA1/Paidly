# Performance & Data Loading Refactor

This document summarizes the performance, stability, and data-loading improvements applied across the app.

## 1. Data Fetching

- **Single request per dataset (Clients page):** The Clients page now uses `useClientsQuery()` from `@/hooks/useClientsQuery`. One async load fetches clients, invoices, and user in a single `Promise.all`; no duplicate Supabase calls on the same page.
- **App store:** `useAppStore.fetchAll` is wrapped with `withApiLogging("appStore.fetchAll", ...)` so failures and slow responses are logged. Timeout remains 30s with 2 retries.

## 2. Loading / Error / Success States

- **Clients page:** Uses React Query `isLoading`, `isError`, `error`, `isRefetching`, and `refetch`. The UI already had:
  - Loading: skeleton list and “Loading…” in the detail panel.
  - Error: “Could not load clients” with “Try again” (toast and inline).
  - Success: client list and detail view.
- **Route-level loading:** Lazy-loaded routes use a single `<Suspense>` with a spinner fallback so navigation never shows a blank screen while a chunk loads.

## 3. Re-renders

- **Clients:** `loadData` is a `useCallback` depending on `refetch` and `activeClient`. `outstandingByClient` and `searchFilteredClients` remain `useMemo`-ized. No API calls run inside frequently re-rendering children.

## 4. Supabase / API

- **Timeout:** `withTimeoutRetry` default timeout is 10s (configurable per call; e.g. Clients use 20s, app store 30s).
- **Logging:** `src/utils/apiLogger.js` provides:
  - `logApiFailure(endpoint, error)` – failed requests.
  - `logSlowResponse(endpoint, durationMs)` – responses &gt; 1s.
  - `logUnhandledError(error)` – used in the root error boundary.
  - `withApiLogging(endpoint, fn)` – wraps an async fn to log duration and failures.
- **Select/limit:** The entity layer still uses `select("*")` in `customClient.js`. A future improvement is to add optional `select` columns and `limit` for list endpoints to reduce payload size and add pagination.

## 5. Client-Side Caching (React Query)

- **Provider:** `QueryClientProvider` in `main.jsx` with:
  - `staleTime: 60 * 1000`
  - `gcTime: 5 * 60 * 1000`
  - `retry: 2`
  - `refetchOnWindowFocus: false`
- **Hooks:** `useClientsQuery` and `useInvoicesQuery` (in `src/hooks/`) use React Query so that:
  - Data is cached for 60s; revisiting the Clients page within that window uses cache.
  - Refetch is explicit (e.g. “Try again”, refresh button, or after create/update/delete).

## 6. Route-Based Code Splitting

- **Lazy loading:** In `src/pages/index.jsx`, all page components are loaded with `React.lazy(() => import("./..."))`.
- **Suspense:** A single `<Suspense fallback={<RouteFallback />}>` wraps all `<Routes>`, so any route transition shows a small spinner until the page chunk loads. This reduces initial bundle size and speeds up first load.

## 7. API Timeout & Retry

- **Timeout:** Default 10s in `fetchWithTimeout.js`; specific calls can pass a higher value (e.g. 20s for clients, 30s for app store).
- **Retry:** Default 2 retries. After failure, the UI shows “Try again” (toast and inline on Clients).

## 8. Error Logging

- **Console:** All logged messages are prefixed with `[Paidly API]` or `[Paidly UI]` and include `page=` and `endpoint=` where applicable.
- **Error boundary:** The root `AppErrorBoundary` in `main.jsx` calls `logUnhandledError(error, getCurrentPage())` before logging to the console.

## 9. Tables / Lists

- **Pagination:** Not yet implemented. Recommended next step: add pagination (e.g. 10–20 rows per page) to Invoices and Quotes tables using React Query’s `keepPreviousData` and offset/limit in the API.

## 10. Initial Load

- **Critical path:** The first paint is the shell (Layout) and the lazy route fallback. Data for the current page (e.g. Clients) loads via React Query or the app store after the route component mounts.
- **Defer non-critical:** Dashboard and other pages that use `useAppStore` can be updated to show KPIs first and load secondary data (e.g. recent activity) in a follow-up request.

## Files Touched

- `src/main.jsx` – QueryClientProvider, error boundary logging, default timeout 10s.
- `src/utils/fetchWithTimeout.js` – Default timeout 10s.
- `src/utils/apiLogger.js` – New: failure/slow/unhandled logging.
- `src/pages/index.jsx` – Lazy imports for all pages, Suspense fallback.
- `src/pages/Clients.jsx` – useClientsQuery, loadData = refetch, no duplicate fetch, setClients replaced by refetch.
- `src/hooks/useClientsQuery.js` – New: single clients+invoices+user fetch with cache.
- `src/hooks/useInvoicesQuery.js` – New: invoices+clients fetch for Invoices page (ready to plug in).
- `src/stores/useAppStore.js` – fetchAll wrapped with withApiLogging.
- `src/components/shared/PageSkeleton.jsx` – New: reusable skeleton components.

## Suggested Next Steps

1. **Invoices page:** Switch to `useInvoicesQuery()`, add loading/error/success UI, and optional client-side pagination (e.g. 20 per page).
2. **Quotes page:** Add `useQuotesQuery` and same pattern.
3. **Dashboard:** Rely on app store for initial data; ensure one fetch on mount (e.g. in Layout or Dashboard), and show skeletons until data is ready.
4. **Supabase:** Add optional `limit` and `order` to entity `list()` / `pullFromSupabase` and use explicit `select` columns where possible.
5. **Indexes:** Ensure Supabase has indexes on `org_id`, `created_at`, and `client_id` for invoices/quotes for faster list and filter queries.
