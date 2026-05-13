# Paidly `/api` deployment model

This document is the **canonical map** of where `/api` traffic runs so rate limits, auth, and observability are applied to the **correct** runtime.

## 1. Two runtimes (do not conflate them)

| Runtime | How it is served | Global Express rate limit (`server/src/globalExpressRateLimit.js`) | `apiAbuseLimiter` / login IP limit |
|--------|-------------------|--------------------------------------|-----------------------------------|
| **A — Vercel Serverless** | `api/*.js` (and rewrites in `vercel.json` → e.g. `/api/keep-alive` → `/api/system?op=keep-alive`) | **Not used** — there is no Express `app` on these invocations unless you wrap them. | **Not used** unless you add middleware. |
| **B — Node Express API** | `server/src/index.js` (e.g. dedicated host, `npm run server`, or a platform that runs this process) | **Yes** — `app.use("/api", createGlobalApiLimiter(...))` | **Yes** — chained after the global limiter. |

**Rule:** When debugging “429 from Paidly” or “100 requests / 15 minutes,” first confirm whether the failing URL is handled by **A** or **B**. Tuning `RATE_LIMIT_MAX` on Express does **nothing** for routes that only exist as Vercel functions.

**SPA client:** `src/api/backendClient.js` uses same-origin `/api` in production when `VITE_SERVER_URL` is unset (typical Vercel app hosting). Those requests hit **A**, not **B**, unless you proxy `/api` to an external Express origin.

## 2. Related docs

- **`docs/API_RATE_LIMIT_BUDGET.md`** — keep-alive, Axios retries, and Express budget math.
- **`docs/SESSION_TIMEOUT_INTEGRATION.md`** — inactivity and keep-alive UX.

## 3. Hardening checklist (in priority order)

1. **Single source of truth** — Pick one primary API surface for authenticated app traffic (same-origin serverless vs Express); document env (`VITE_SERVER_URL`) in runbooks.
2. **Rate limits** — For **B**: use `RATE_LIMIT_MAX` from production p99 per IP; consider **Redis / Vercel KV** for shared counters across instances (`apiAbuseLimiter.js` comments).
3. **For Vercel serverless (A)** — add platform-level throttling or WAF rules if abuse appears; rely on Supabase RLS for data isolation.
4. **Invoice pipeline** — `SyncEngine` + queue: ensure session recovery when the queue drains (see `SyncEngine.jsx` + `sessionRefreshScheduler`).
5. **DB** — Atomic invoice + line items (transaction or RPC); unique `(org_id, invoice_number)` where product allows; validate in migrations (backlog items).

## 4. Observability

- Log **route**, **deployment target** (function name vs Express), and **client IP** on 429.
- Correlate user reports of “session timeout” with **Supabase Auth** logs and **PostgREST** pool metrics, not only app-level limiters.
