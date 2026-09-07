# Secrets, API keys, and environment variables

This document is the **allowlist / policy** for where credentials may live. It complements [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md) and [AUTH_AND_LOGIN.md](AUTH_AND_LOGIN.md).

After deployment, follow **[DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)** (HTTPS, CORS, monitoring, database exposure). Storage visibility (`paidly` public vs `receipts` / `bank-details` private) is in **[SUPABASE_STORAGE.md](SUPABASE_STORAGE.md)** — that is not a substitute for keeping the service role off the client.

> Canonical path: **`docs/ENV_AND_CREDENTIALS.md`**. The old name `docs/SECRETS_AND_ENV.md` is hidden from AI/tooling by `.cursorignore` (`**/*secret*`) and is a short pointer only.

## Scan the repository

Run locally or in CI:

```bash
npm run scan-secrets
```

This checks git-tracked source for common mistakes (e.g. `VITE_*SERVICE_ROLE*`, hardcoded JWTs, PEM blocks).

### CI (GitHub Actions)

The workflow **`.github/workflows/security-secrets.yml`** runs on pushes and pull requests to `main` / `master`:

1. **`npm run scan-secrets`** — fast custom patterns on the current tree.
2. **[TruffleHog OSS](https://github.com/trufflesecurity/trufflehog)** — scans history and files for known verified secret types (lower noise than unverified matches).

`ci.yml` also runs **`npm run scan-secrets`**. You can trigger the secrets workflow manually under **Actions → Security — secrets → Run workflow**.

### GitHub secret scanning (hosted)

In the repository: **Settings → Code security and analysis** — enable **Secret scanning** (and **Push protection** if your plan allows). That adds GitHub’s own detectors and blocks pushes that match known patterns. Use this **together with** TruffleHog and `scan-secrets`, not instead of them.

## What may appear in the frontend bundle

Vite exposes **only** variables prefixed with `VITE_`. Anything with that prefix is **public** after `npm run build`.

| Variable | Sensitive? | Notes |
|----------|--------------|--------|
| `VITE_SUPABASE_URL` | Low | Public project URL; still do not commit real `.env` files. |
| `VITE_SUPABASE_ANON_KEY` | **Designed to be public** | Supabase **anon** key is meant for browsers. **RLS** must protect data. Never use the **service_role** key here. |
| `VITE_SERVER_URL` | Low | Backend base URL only. Omit in production when the SPA and `/api/*` share the same Vercel app. |
| `VITE_APP_URL`, `VITE_APP_VERSION`, `VITE_BUILD_TIME` | Low | Routing / diagnostics. |
| `VITE_SUPABASE_STORAGE_BUCKET` | Low | Bucket name (default `paidly`), not a secret. |
| `VITE_SUPABASE_ONLY` | Low | Flag to silence missing-API warnings when the Node API is not deployed. |
| `VITE_STRIPE_BILLING_PORTAL` | Low | URL to billing portal. |
| `VITE_SUPPORT_EMAIL`, `VITE_CONTACT_SALES_EMAIL` | Low | Public contact addresses. |
| `VITE_SENTRY_DSN` | Low | Public Sentry DSN. **Not** `SENTRY_AUTH_TOKEN`. |
| `VITE_PAYFAST_PUBLIC_SITE_URL`, `VITE_PAYFAST_RETURN_URL`, `VITE_PAYFAST_CANCEL_URL`, `VITE_PAYFAST_SUBSCRIPTION_NOTIFY_URL` | Low | Public PayFast redirect / notify URLs. Signing keys stay server-only. |
| `VITE_GOOGLE_AUTH_ENABLED` | Low | Feature flag. |

**Never** add `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_*SECRET*`, `VITE_*PASSPHRASE*`, private API keys, or Square / PayFast / Resend credentials as `VITE_*`.

Public invoice pages must use **public** `paidly` URLs (`getPublicUrl`). Do not put `createSignedUrl` (or a service role) on the anonymous viewer path.

## Server-only (Node API, Vercel serverless, Edge Functions)

Keep these in the **host environment**, `server/.env` (gitignored), or Supabase **Edge Function secrets** — never in `src/` or `VITE_*`.

| Secret | Used for |
|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API, RLS bypass (trusted server only). |
| `SUPABASE_URL` | Same project as `VITE_SUPABASE_URL`; server-side client. |
| `SUPABASE_ANON_KEY` | Same value as `VITE_SUPABASE_ANON_KEY`; used on server for `POST /api/auth/sign-in` (rate limiting). Still not as powerful as service_role; keep in env, not in source. |
| `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | Signing PayFast payloads and ITN verification. |
| `RESEND_API_KEY` | Outbound email. `RESEND_FROM` is a from-address, not a credential. |
| `ADMIN_BOOTSTRAP_TOKEN` | First admin bootstrap route (`x-bootstrap-token`). |
| `BILLING_WEBHOOK_SECRET` / provider webhooks | Verify webhook signatures. |
| `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_PERSONAL_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY` | POS OAuth and webhooks. See [POS_INTEGRATIONS.md](POS_INTEGRATIONS.md). |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Source-map upload at **build** time. Never prefix with `VITE_`. |
| `SENTRY_DSN` | Server-side Sentry. Optional; distinct from the public `VITE_SENTRY_DSN`. |

Copy **`.env.*.example`** templates for local names. Production values live in the host secret store (Vercel Environment Variables, Railway, AWS Secrets Manager, etc.).

## Git and files

- **Do not commit** `.env`, `.env.local`, `.env.production`, `server/.env`, PEM files, or `secrets.json`. They are listed in `.gitignore`.
- **Do commit** only `*.example` templates with **empty** values or obvious placeholders.
- If a secret was ever committed, **rotate** it in the provider (Supabase, PayFast, Resend, Square, etc.) and purge history if needed.
- The repo uses `.cursorignore` so env and auth state are not included in AI context. Policy markdown lives at this path so a `*secret*` ignore rule cannot hide the runbook.

## Demo / local-only risk: system settings in the browser

`SystemSettingsService` can persist **integration** fields (e.g. Stripe `secretKey`, webhook secrets) in **`localStorage`** for admin UI demos in development.

**Production builds (`import.meta.env.PROD`):** secret-like fields (`secretKey`, `webhookSecret`, `clientSecret`, `apiKey` under each integration provider) are **stripped** on read/write/import so they are **not** stored in `localStorage`. The console warns when saving integrations. **Do not rely on this UI for configuring live Stripe/PayPal/etc.** — use **server environment variables** or a **secrets manager**, and expose only what the browser needs (e.g. Stripe **publishable** key via a safe channel).

## Single Supabase client in the app

All browser Supabase access goes through `src/lib/supabaseClient.js` with the **anon** key only. Do not call `createClient` elsewhere in `src/` with different credentials.
