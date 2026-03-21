# Secrets, API keys, and environment variables

This document is the **allowlist / policy** for where credentials may live. It complements [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md) and [AUTH_AND_LOGIN.md](AUTH_AND_LOGIN.md).

After deployment, follow **[DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)** (HTTPS, CORS, monitoring, database exposure).

## Scan the repository

Run locally or in CI:

```bash
npm run scan-secrets
```

This checks git-tracked source for common mistakes (e.g. `VITE_*SERVICE_ROLE*`, hardcoded JWTs, PEM blocks).

### CI (GitHub Actions)

The workflow **`.github/workflows/security-secrets.yml`** runs on pushes and pull requests to `main` / `master`:

1. **`npm run scan-secrets`** — fast custom patterns on the current tree.
2. **[TruffleHog OSS](https://github.com/trufflesecurity/trufflehog)** (`trufflesecurity/trufflehog@v3.88.4`) with **`--only-verified`** — scans history and files for known verified secret types (lower noise than unverified matches).

You can trigger the same workflow manually under **Actions → Security — secrets → Run workflow**.

### GitHub secret scanning (hosted)

In the repository: **Settings → Code security and analysis** — enable **Secret scanning** (and **Push protection** if your plan allows). That adds GitHub’s own detectors and blocks pushes that match known patterns. Use this **together with** TruffleHog and `scan-secrets`, not instead of them.

## What may appear in the frontend bundle

Vite exposes **only** variables prefixed with `VITE_`. Anything with that prefix is **public** after `npm run build`.

| Variable | Sensitive? | Notes |
|----------|--------------|--------|
| `VITE_SUPABASE_URL` | Low | Public project URL; still do not commit real `.env` files. |
| `VITE_SUPABASE_ANON_KEY` | **Designed to be public** | Supabase **anon** key is meant for browsers. **RLS** must protect data. Never use the **service_role** key here. |
| `VITE_SERVER_URL` | Low | Backend base URL only. |
| `VITE_APP_URL`, `VITE_APP_VERSION`, `VITE_BUILD_TIME` | Low | Routing / diagnostics. |
| `VITE_SUPABASE_STORAGE_BUCKET` | Low | Bucket name, not a secret. |
| `VITE_STRIPE_BILLING_PORTAL` | Low | URL to billing portal. |

**Never** add `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_*SECRET*`, or private API keys as `VITE_*`.

## Server-only (Node API, Vercel serverless, Edge Functions)

Keep these in **host environment**, `server/.env` (gitignored), or Supabase **Edge Function secrets** — never in `src/` or `VITE_*`.

| Secret | Used for |
|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API, RLS bypass (trusted server only). |
| `SUPABASE_ANON_KEY` | Same value as `VITE_SUPABASE_ANON_KEY`; used on server for `POST /api/auth/sign-in` (rate limiting). Still not as powerful as service_role; keep in env, not in source. |
| `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | Signing PayFast payloads (see `server/src/index.js`). |
| `RESEND_API_KEY`, email SMTP passwords | Outbound email. |
| `ADMIN_BOOTSTRAP_TOKEN` | First admin bootstrap route. |
| `BILLING_WEBHOOK_SECRET` / provider webhooks | Verify webhook signatures. |

## Git and files

- **Do not commit** `.env`, `.env.local`, `.env.production`, `server/.env`, PEM files, or `secrets.json`. They are listed in `.gitignore`.
- **Do commit** only `*.example` templates with **empty** values or obvious placeholders.
- If a secret was ever committed, **rotate** it in the provider (Supabase, PayFast, Resend, etc.) and purge history if needed.

## Demo / local-only risk: system settings in the browser

`SystemSettingsService` can persist **integration** fields (e.g. Stripe `secretKey`, webhook secrets) in **`localStorage`** for admin UI demos in development.

**Production builds (`import.meta.env.PROD`):** secret-like fields (`secretKey`, `webhookSecret`, `clientSecret`, `apiKey` under each integration provider) are **stripped** on read/write/import so they are **not** stored in `localStorage`. The console warns when saving integrations. **Do not rely on this UI for configuring live Stripe/PayPal/etc.** — use **server environment variables** or a **secrets manager**, and expose only what the browser needs (e.g. Stripe **publishable** key via a safe channel).

For production integrations, use **server env** or a **secrets manager** and expose only what the client truly needs (e.g. Stripe **publishable** key).

## Single Supabase client in the app

All browser Supabase access goes through `src/lib/supabaseClient.js` with the **anon** key only. Do not call `createClient` elsewhere in `src/` with different credentials.
