# Application Performance Diagnostic Report

**Last run:** 2026-03-15  
**Target URL:** http://localhost:5173

---

## How to run

From project root with the dev server running (`npm run dev`):

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers TARGET_URL=http://localhost:5173 node scripts/performance-audit-playwright.cjs
```

- **Headless (default):** Omit `HEADLESS` or set `HEADLESS=1`.
- **With browser visible:** `HEADLESS=0`.
- **Authenticated run:** Log in manually first, or extend the script to load a saved storage state so Dashboard/Clients/Quotes/Invoices data loading can be validated.

**Note:** Slow requests in this report are mostly Vite dev-server module requests (JS/CSS). Production builds use bundled assets and typically load faster. Focus optimization on Supabase and backend API response times.

---

## 1. Application performance summary

| Metric | Value |
|--------|-------|
| Initial page load time | 4,711 ms |
| Average page navigation time | 1,795 ms |
| Slow requests (>1 s) | 12 |
| Failed requests (4xx/5xx) | 0 |
| Duplicate API calls | 7 |
| Console errors | 0 |

---

## 2. Failed or slow requests

All listed requests returned **200**; they are flagged as slow (>1 s). In dev, these are typically Vite-served modules.

| Resource | Response time | Status |
|----------|----------------|--------|
| `src/index.css` | 1,994 ms | 200 |
| `src/components/ui/toast.jsx` | 1,561 ms | 200 |
| `src/components/ui/use-toast.jsx` | 1,573 ms | 200 |
| `src/pages/Layout.jsx` | 1,584 ms | 200 |
| `node_modules/.vite/deps/react-router-dom.js` | 1,617 ms | 200 |
| `node_modules/.vite/deps/chunk-F34GCA6J.js` | 1,661 ms | 200 |
| `src/components/auth/AuthContext.jsx` | 1,661 ms | 200 |
| `src/components/auth/RequireAuth.jsx` | 1,684 ms | 200 |
| `src/lib/supabaseClient.js` | 1,684 ms | 200 |
| `src/utils/excelUtils.js` | 1,685 ms | 200 |
| `src/services/ExcelUserService.js` | 1,685 ms | 200 |
| `src/api/entities.js` | 1,691 ms | 200 |

---

## 3. Data loading issues

- **Authenticated routes (Dashboard, Clients, Quotes, Invoices, Settings):** Not validated — session was unauthenticated and the app redirected to Login. Re-run the audit after logging in to verify tables/lists load and to catch empty states caused by API failures.

---

## 4. UI performance issues

- **Navigation to Dashboard:** 2,234 ms (above 2 s threshold). Likely due to dev-mode chunk loading; production builds should improve with code-splitting and preload.

---

## 5. Stress test (rapid navigation)

- **Runs:** 2 full cycles (Dashboard → Clients → Quotes → Invoices → Dashboard).
- **Result:** No freezes or failed reloads reported.

---

## 6. Duplicate API calls

**7** duplicate calls detected (same method + URL requested more than once). Usually these are Supabase REST or app API calls triggered from both Layout and page components. Re-run the script to print exact endpoints in the generated report.

---

## 7. Console errors

No console errors were captured during the run.

---

## 8. Recommended fixes

### API / backend

- Add or review indexes for Supabase queries used on Dashboard, Clients, Quotes, and Invoices.
- Ensure list endpoints return paginated or bounded result sets.
- Consider caching for rarely changing data (e.g. services, org settings).

### Frontend

- Lazy-load heavy routes and defer non-critical JS.
- Avoid duplicate fetches (e.g. same list in Layout and page); centralize or deduplicate with React Query (or similar).
- Use React Query or similar to deduplicate and cache API calls.

### Network

- Minimize payload size for list endpoints (select only needed columns).
- Use stable cache headers for static assets.

---

## 9. Root cause summary

| Observation | Likely cause |
|-------------|--------------|
| Initial load ~4.7 s | Vite dev server serving many JS modules; production bundling and code-splitting will reduce this. |
| Navigation ~1.8–2.2 s | Additional chunk loads per route; improve with lazy-loading and critical-path preload. |
| 7 duplicate API calls | Same Supabase/REST endpoints requested from multiple components; deduplicate or cache. |
| No failed requests | All HTTP 200 in this run; with an authenticated run, monitor for 4xx/5xx on Supabase and backend. |
| Data loading not validated | Run was unauthenticated; re-run after login to verify tables/lists and rule out API-driven empty states. |
