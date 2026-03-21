# Abuse protection (bots, scraping, overload)

Layered limits so automated clients cannot easily spam auth, email, payments, or future AI routes.

## Server (Node API)

### Tiered `/api` rate limiting

**Middleware:** `server/src/apiAbuseLimiter.js` — runs after the body parser for all `/api/*` except:

- `GET /api/health`
- `GET /api/email-track/*` (high volume from email clients)
- `POST /api/payfast/itn` (PayFast server callbacks)

| Tier | Default | Env overrides |
|------|---------|----------------|
| **Global** | 450 req / 15 min / IP | `API_RATE_GLOBAL_MAX`, `API_RATE_GLOBAL_WINDOW_MS` |
| **Sign-up** | 8 / hour / IP | `API_RATE_SIGNUP_MAX`, `API_RATE_SIGNUP_WINDOW_MS` |
| **Send email** | 25 / 15 min / IP | `API_RATE_SEND_EMAIL_*` |
| **Send invoice** | 25 / 15 min / IP | `API_RATE_SEND_INVOICE_*` |
| **Track open** | 120 / 15 min / IP | `API_RATE_TRACK_OPEN_*` |
| **PayFast (user flows)** | 45 / 15 min / IP | `API_RATE_PAYFAST_*` (not ITN) |
| **AI / LLM** (any `POST /api/ai/*`) | 20 / hour / IP | `API_RATE_AI_MAX`, `API_RATE_AI_WINDOW_MS` |

Enable in dev with **`API_ABUSE_LIMIT_IN_DEV=true`**. Disable entirely with **`API_ABUSE_LIMIT_ENABLED=false`**.

429 responses include **`Retry-After`** and a structured log line: `api_rate_limited` (see [DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)).

### Auth routes

- **`POST /api/auth/sign-in`** — IP login window (`loginIpRateLimit.js`) **plus** global API tier.
- **`POST /api/auth/sign-up`** — sign-up tier **plus** global; logs `auth_sign_up_*` events.

In-memory stores only — use **Redis** (or similar) if you run **multiple API instances**.

## Browser (defense in depth)

| Area | File | Behavior |
|------|------|----------|
| Login | `src/utils/loginRateLimit.js` | Failed attempts per email in `sessionStorage`. |
| Sign-up | `src/utils/signupRateLimit.js` | Attempts per email / hour in `sessionStorage`. |
| Receipt OCR / scan | `src/utils/receiptOcrRateLimit.js` | Scans per tab / hour (browser OCR + upload pipeline). |

## Supabase

The hosted project applies its own **Auth rate limits**. RLS still required so the anon key cannot scrape other tenants’ data.

## Operations

- Tune env vars after you have real traffic metrics.
- Alert on **`api_rate_limited`**, **`auth_sign_in_rate_limited`**, and **`suspicious_404_burst`** (see deployment security doc).
