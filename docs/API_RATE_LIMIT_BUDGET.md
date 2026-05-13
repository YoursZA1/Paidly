# API rate-limit budget — keep-alive, Axios resilience, and Express `/api`

**Prerequisite:** Confirm whether production `/api` hits **Vercel serverless** or **Express** — see **`docs/API_DEPLOYMENT_MODEL.md`**.

This document maps **browser-initiated** `/api` traffic against the **Express** global limiter (`server/src/globalExpressRateLimit.js`: default **15-minute window**, configurable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`).

## Two deployment paths

| Traffic | Typical handler | Global Express limiter (default **220 / 15 min** per IP, tunable) |
|--------|-----------------|-----------------------------------|
| Same-origin **`/api/*`** on **Vercel** (static + `api/*.js` serverless) | Node/Vercel Functions per file | **Not applied** — there is no Express `app.use` on those routes unless you add platform limits elsewhere. |
| **`VITE_SERVER_URL`** → dedicated **Express** API (`server/src/index.js`) | `createGlobalApiLimiter` on `/api` | **Applied** per `getClientIp(req)` (often `x-forwarded-for`). |

Tune limits using **real** per-IP histograms from API logs or APM (e.g. p95/p99 of `/api` requests per client IP per 15 minutes). Suggested starting formula:

```text
RATE_LIMIT_MAX ≈ ceil(p99_requests_per_ip_per_window * 1.5) + slack_for_retries
```

Record `RateLimit-*` response headers from `express-rate-limit` when probing.

---

## 1. InactivitySessionGuard keep-alive (not Axios)

**Source:** `src/components/session/InactivitySessionGuard.jsx`

| Call | Transport | `installBackendApiResilience` retries | Default interval |
|------|-----------|--------------------------------------|------------------|
| `POST /api/keep-alive` | **Native `fetch`** (not `backendApi`) | **None** (failures are swallowed) | `VITE_SESSION_KEEPALIVE_MS` or **4 minutes** |

**Budget contribution (per signed-in user, active tab):**

```text
ceil(15min / keepAliveIntervalMs) = ceil(900_000 / 240_000) ≈ 4 POSTs / 15min / user / tab
```

Extra tabs: each tab runs its own React tree; if multiple tabs stay authenticated and active, multiply accordingly.

**Express change:** `POST /api/keep-alive` is **skipped** by the global limiter so heartbeats do not consume the shared NAT bucket (see `globalExpressRateLimit.js`).

**Note:** `requestSessionRefresh({ source: "keep_alive", ... })` uses **Supabase** (or `POST /api/auth/refresh` when `VITE_NODE_AUTH_API` is enabled). Those calls are **not** counted here unless they go through Express `/api`.

---

## 2. `installBackendApiResilience` (Axios `backendApi` only)

**Source:** `src/api/installBackendApiResilience.js` (registered in `src/api/backendClient.js`)

Retries apply only to **`backendApi`** responses, **not** to `fetch("/api/keep-alive")`.

| Condition | GET/HEAD | POST/PUT/PATCH/DELETE |
|-----------|----------|------------------------|
| Network / timeout | Up to **2** retries (≤ **3** attempts total) | **1** retry (≤ **2** attempts) |
| 408 / 425 / 502 / 503 / 504 | Same | Same |
| **429** | **At most 1** retry (≤ **2** attempts) — avoids amplifying throttle | **No** retry |

**Worst-case multiplier** for a storm of failing GETs (e.g. flaky 503): **3×** the nominal request count for that route until backoff gives up.

---

## 3. Axios `/api` surfaces (representative, not exhaustive)

All of the following use `backendApi` and therefore **429 / retry rules above**. Many are user-initiated or cached.

| Area | Example paths | Notes |
|------|---------------|--------|
| Node auth (when `VITE_NODE_AUTH_API`) | `POST /api/auth/sign-in`, `POST /api/auth/refresh`, … | Refresh can be frequent under tab churn; refresh is **skipped** from the global IP limiter on Express (see code). |
| Session / auth context | e.g. bootstrap / invite flows via `backendApi` | Infrequent per user. |
| Dashboard | `GET /api/dashboard/bootstrap` | Deduped in client (`dashboardBootstrapService.js`); still counts per successful call. |
| Currency / FX | `GET /api/exchange-rates`, `GET /api/exchange-rates/:date`, `GET /api/currencies`, … | `exchange-rates` path is **excluded** from Axios retries entirely. |
| Admin | `GET /api/admin/sync-users`, `POST /api/admin/*`, … | Low volume except admin power users. |
| Account | `POST /api/account/delete` | Rare. |

Grep for additions: `backendApi.get|post|put|patch|delete` under `src/`.

---

## 4. “Typical power user” — order-of-magnitude model (Express / single IP)

Assumptions: **1** active tab, `VITE_NODE_AUTH_API` off (refresh via Supabase, not `/api/auth/refresh`), **Express** global limiter in effect, dashboard bootstrap **2×** per 15 min, currency **4×**, misc **10×**, resilience adds **20%** overhead.

| Bucket | Nominal calls / 15 min | With retry multiplier (rough) |
|--------|------------------------|-------------------------------|
| Keep-alive | **0** (excluded from limiter) | 0 |
| Bootstrap + lists + FX + actions | **~16–30** | **~20–40** |

A **shared NAT** with **25** such users would need **25 × ~30 ≈ 750** calls / 15 min **before** burst retries if everyone shared one IP — which is why per-IP limits must be **keyed by user id** or raised using measured p99, not a single hardcoded `100`.

---

## 5. Recommended environment knobs

| Variable | Role |
|----------|------|
| `RATE_LIMIT_MAX` | Global Express `/api` cap per IP per window (raise using production p99). |
| `RATE_LIMIT_WINDOW_MS` | Window length (default 15 min). |
| `RATE_LIMIT_ENABLED` | Set `false` only for local debugging. |
| `VITE_SESSION_KEEPALIVE_MS` | Keep-alive interval (trade-off: session liveness vs `/api/keep-alive` volume on serverless `api/system.js`). |

For **Vercel-only** API routes, add separate protection (e.g. Edge middleware + Redis, or Supabase-level limits) if abuse is a concern; this doc’s Express defaults do not apply there.
