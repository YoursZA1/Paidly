# Paidly `/api` deployment model

This document is the **canonical map** of where `/api` traffic runs so rate limits, auth, and observability are applied to the **correct** runtime.

## 1. Two runtimes (do not conflate them)

| Runtime | How it is served | Global Express rate limit (`server/src/globalExpressRateLimit.js`) | `apiAbuseLimiter` / login IP limit |
|--------|-------------------|--------------------------------------|-----------------------------------|
| **A — Vercel Serverless** | `api/*.js` (and rewrites in `vercel.json` → e.g. `/api/keep-alive` → `/api/system?op=keep-alive`) | **Not used** — there is no Express `app` on these invocations unless you wrap them. | **Not used** unless you add middleware. |
| **B — Node Express API** | `server/src/index.js` (e.g. dedicated host, `npm run server`, or a platform that runs this process) | **Yes** — `app.use("/api", createGlobalApiLimiter(...))` | **Yes** — chained after the global limiter. |

Hobby production is capped at **12** serverless functions. Add a rewrite onto an existing `api/*.js` file instead of a new endpoint file. `/api/payments/webhook/:provider` is rewritten onto `api/payment-intents/[[...path]].js`.

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
| **Transactional email** | `POST /api/send-email` | `IntegrationManager.Core.SendEmail` → same-origin `/api` | Do not call Resend from the browser. |
| **Catalog** | `GET /api/subscriptions/plans` | Pricing / Settings | Public active `plans` rows (Starter/Business/Growth/Enterprise). |
| **Subscription checkout** | `POST /api/subscriptions/create` | Settings billing / upgrade | Server loads amount from `plans`; returns signed PayFast fields in Custom Integration order. Never activates. Express and Vercel both serve this route. |
| **Change plan** | `POST /api/subscriptions/change` | Settings | Cancels existing PayFast token then creates pending checkout. |
| **Status / cancel** | `GET /api/subscriptions/status\|current`, `POST …/cancel` | Return page / Settings | Poll after PayFast; cancel recurring + DB. |
| **PayFast ITN** | `POST /api/payfast/itn` (+ webhook aliases) | N/A (PayFast) | Signature → IP → VALID → merchant/amount → idempotent ledger. |
| **PayFast one-time invoice** | `POST /api/payfast/once` | Invoice payment flows | Document Engine invoice payments. |

**Deprecated:** `POST /api/payfast/subscription` returns **410** (client-priced checkout removed). Keep ITN notify URL aliases for live tokens.

## 1d. POS integrations (Square OAuth + Yoco + webhooks)

| Concern | Canonical route | Client entry | Notes |
|--------|-----------------|--------------|-------|
| **Square OAuth start** | `POST /api/pos/oauth/square/start` | Settings → Integrations | Returns `authorize_url`; callback at `GET /api/pos/oauth/callback/square`. |
| **Yoco connect** | `POST /api/pos/oauth/yoco/connect` | Settings → Integrations | Merchant API key; Paidly registers Yoco webhook. |
| **POS sale webhooks** | `POST /api/pos/webhook/:token`, `POST /api/pos/webhook/provider/square` | N/A (POS provider) | Implementation: `server/src/pos/`, `api/pos/[[...path]].js`. |
| **Connections / sales** | `GET /api/pos/connections`, `GET /api/pos/sales` | `PosIntegrationService` | Org-scoped; RLS on `pos_*` tables. |

**Env:** `SQUARE_*`, `POS_CREDENTIALS_ENCRYPTION_KEY` — see **`docs/POS_INTEGRATIONS.md`** (includes Square sandbox testing).

## 2. Related docs

- **`docs/API_RATE_LIMIT_BUDGET.md`** — keep-alive, Axios retries, and Express budget math.
- **`docs/SESSION_TIMEOUT_INTEGRATION.md`** — inactivity and keep-alive UX.
- **`docs/POS_INTEGRATIONS.md`** — Square OAuth, Yoco connect, webhook env vars, sandbox testing.

## 3. Hardening checklist (in priority order)

1. **Single source of truth** — Pick one primary API surface for authenticated app traffic (same-origin serverless vs Express); document env (`VITE_SERVER_URL`) in runbooks.
2. **Rate limits** — For **B**: use `RATE_LIMIT_MAX` from production p99 per IP; consider **Redis / Vercel KV** for shared counters across instances (`apiAbuseLimiter.js` comments).
3. **For Vercel serverless (A)** — add platform-level throttling or WAF rules if abuse appears; rely on Supabase RLS for data isolation.
4. **Invoice pipeline** — `SyncEngine` + queue: ensure session recovery when the queue drains (see `SyncEngine.jsx` + `sessionRefreshScheduler`).
5. **DB** — Atomic invoice + line items (transaction or RPC); unique `(org_id, invoice_number)` where product allows; validate in migrations (backlog items).

## 4. Observability

- Log **route**, **deployment target** (function name vs Express), and **client IP** on 429.
- Correlate user reports of “session timeout” with **Supabase Auth** logs and **PostgREST** pool metrics, not only app-level limiters.
