# Paidly `/api` deployment model

This document is the **canonical map** of where `/api` traffic runs so rate limits, auth, and observability are applied to the **correct** runtime.

## 1. Two runtimes (do not conflate them)

| Runtime | How it is served | Global Express rate limit (`server/src/globalExpressRateLimit.js`) | `apiAbuseLimiter` / login IP limit |
|--------|-------------------|--------------------------------------|-----------------------------------|
| **A — Vercel Serverless** | `api/*.js` (and rewrites in `vercel.json` → e.g. `/api/keep-alive` → `/api/system?op=keep-alive`) | **Not used** — there is no Express `app` on these invocations unless you wrap them. | **Not used** unless you add middleware. |
| **B — Node Express API** | `server/src/index.js` (e.g. dedicated host, `npm run server`, or a platform that runs this process) | **Yes** — `app.use("/api", createGlobalApiLimiter(...))` | **Yes** — chained after the global limiter. |

**Rule:** When debugging “429 from Paidly” or “100 requests / 15 minutes,” first confirm whether the failing URL is handled by **A** or **B**. Tuning `RATE_LIMIT_MAX` on Express does **nothing** for routes that only exist as Vercel functions.

**SPA client:** `src/api/backendClient.js` uses same-origin `/api` in production when `VITE_SERVER_URL` is unset (typical Vercel app hosting). Those requests hit **A**, not **B**, unless you proxy `/api` to an external Express origin.

## 1b. Shared serverless handlers (Wave 1)

These routes use **one implementation** in `server/src/` re-exported from `api/` (same pattern as `api/auth/bootstrap-user.js`):

| Route | Shared module |
|-------|----------------|
| `POST /api/auth/sign-in` | `server/src/auth/authSignInApi.js` |
| `POST /api/auth/sign-up` | `server/src/auth/authSignUpApi.js` |
| `POST /api/auth/forgot-password` | `server/src/auth/authForgotPasswordApi.js` |
| `POST /api/auth/refresh` | `server/src/auth/authRefreshApi.js` |
| `POST /api/send-email` | `server/src/sendEmailApi.js` |

**Production auth (default):** `shouldUseNodeAuthApi()` is **true** on production builds unless `VITE_SUPABASE_ONLY=1` or `VITE_DISABLE_NODE_AUTH_API=1`. JWTs still come from Supabase; the API adds IP rate limits and security logs.

**Server env (Vercel + Express):** `SUPABASE_ANON_KEY`, `RESEND_*` for send-email.

**Auth rate limits (Vercel + Express):** `POST /api/auth/sign-in` and `sign-up` use `consume_rate_limit_bucket` in Postgres when `RATE_LIMIT_PERSIST=1` (default in production) and `SUPABASE_SERVICE_ROLE_KEY` is set — shared across serverless instances. Falls back to in-memory per isolate if the RPC is missing. Apply migration `20260516160000_api_rate_limit_consume_rpc.sql`.

## 1c. Canonical integration paths (PayFast + email)

| Concern | Canonical route | Client entry | Notes |
|--------|-----------------|--------------|-------|
| **Transactional email** | `POST /api/send-email` | `IntegrationManager.Core.SendEmail` → same-origin `/api` | Implementation: `server/src/sendEmailApi.js` (Vercel re-export `api/send-email.js`). Do not call Resend from the browser. |
| **PayFast subscription checkout** | `POST /api/payfast/subscription` | Billing UI via `backendApi` / `apiRequest` | Signed payload from server; client posts `fields` to PayFast. |
| **PayFast one-time invoice** | `POST /api/payfast/once` | Invoice payment flows | `server/src/payfastOnceApi.js` (Express + Vercel `api/payfast/once.js` / `__pf=once`). |
| **PayFast ITN (webhooks)** | `POST /api/payfast/webhook`, `POST /api/payfast/subscription/itn` | N/A (PayFast server) | Subscription ITN also at `/payfast/subscription/itn` on Express. **Billing columns** (`subscription_plan`, `payfast_*`) are updated only here or via admin/service role — never from `AuthManager.updateMyUserData`. |

Legacy duplicate handlers in `api/payfast-handler.js` should be treated as deprecated; new work uses the routes above.

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
