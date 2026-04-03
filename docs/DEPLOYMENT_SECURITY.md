# Secure deployment and monitoring

How to keep **Paidly** safe in production: TLS, secrets, database exposure, and **observable** security events.

## HTTPS (data in transit)

### Node API (`server/`)

- **`enforceHttps`**: In **`NODE_ENV=production`**, requests that are not HTTPS (per `req.secure` or `X-Forwarded-Proto: https`) get a **301** to `https://{host}{url}`.
- Set **`ENFORCE_HTTPS=false`** only if TLS terminates in a way that breaks redirects (e.g. internal health checks); prefer fixing the proxy instead.
- **`securityHeaders`**: Sends **HSTS** (configurable), **`X-Content-Type-Options: nosniff`**, **`X-Frame-Options: DENY`**, **`Referrer-Policy`**, **`Permissions-Policy`**.

| Env | Purpose |
|-----|---------|
| `HSTS_MAX_AGE` | Seconds (default `31536000`). |
| `HSTS_INCLUDE_SUBDOMAINS` | Set to `false` to omit `includeSubDomains`. |
| `HSTS_PRELOAD` | Set to `true` to add `preload` (only if you submit the site to the preload list). |
| `DISABLE_HSTS` | `true` disables HSTS (not recommended in production). |

### Static app (Vercel)

`vercel.json` applies the same class of **response headers** to the SPA. Enable **“Force HTTPS”** in the Vercel project settings as well.

### Origin / CORS

In production, set **`CLIENT_ORIGIN`** to your real app URL (e.g. `https://app.example.com`). The server logs a warning if it is missing or `*`.

---

## Secrets

- Follow **[SECRETS_AND_ENV.md](SECRETS_AND_ENV.md)** and run **`npm run scan-secrets`** in CI.
- Store production values in the **host’s secret store** (Vercel env, Railway, AWS Secrets Manager, etc.), not in the repo.

---

## Database and Supabase (restrict direct DB access)

- Use **hosted Supabase**: Postgres is **not** meant to be wide open on the public internet for app traffic; clients use the **HTTPS API** and **connection pooler** with **RLS**.
- In **Supabase Dashboard → Database → Connection pooling / settings**: use **pooler** URLs for server tools; avoid publishing a **direct** connection string on a `0.0.0.0`-listening VM without a firewall.
- **Never** expose **`SUPABASE_SERVICE_ROLE_KEY`** to the browser; it bypasses RLS. Server and Edge Functions only.
- Keep **RLS** enabled on user data tables (see **[SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)**).

---

## Logging and suspicious activity (API server)

Security-related lines are **single-line JSON** (`type: "security"`) for easy ingestion (Datadog, CloudWatch, Loki, etc.).

| Event | Level | When |
|--------|--------|------|
| `auth_sign_in_success` | info | Password sign-in succeeded (`email`, `userId`, `ip` — no password). |
| `auth_sign_in_failed` | warn | Wrong credentials or empty session (`email`, `ip`). |
| `auth_sign_in_rate_limited` | warn | IP hit login rate limit. |
| `auth_sign_in_bad_request` | warn | Missing email/password. |
| `auth_sign_in_misconfigured` | error | `SUPABASE_ANON_KEY` missing on server. |
| `auth_sign_in_exception` | error | Unexpected error during sign-in. |
| `auth_sign_up_success` | info | Sign-up succeeded (`email`, `userId`, `session` boolean). |
| `auth_sign_up_failed` | warn | Supabase rejected sign-up. |
| `auth_sign_up_bad_request` | warn | Missing email/password. |
| `auth_sign_up_misconfigured` | error | `SUPABASE_ANON_KEY` missing. |
| `auth_sign_up_exception` | error | Unexpected error during sign-up. |
| `api_rate_limited` | warn | Tiered `/api` abuse limiter (see [ABUSE_PROTECTION.md](ABUSE_PROTECTION.md)). |
| `admin_api` | warn / error | Admin route returned **4xx/5xx** (`method`, `path`, `status`, `detail`). |
| `admin_forbidden` | warn | **403** on `/api/admin/*`. |
| `http_server_error` | error | Any response **status ≥ 500** (`path`, `method`, `ip`). |
| `suspicious_404_burst` | warn | Same IP hit **404** at least **`SECURITY_404_BURST_THRESHOLD`** times (default **80**) within **`SECURITY_404_WINDOW_MS`** (default **10 minutes**). |
| `suspicious_auth_fail_burst` | warn | Same IP got **401** on **`/api/*`** at least **`SECURITY_AUTH_FAIL_BURST_THRESHOLD`** times (default **30**) within **`SECURITY_AUTH_FAIL_WINDOW_MS`** (default **10 minutes**). |
| `suspicious_rate_limit_burst` | warn | Same IP hit **429** on **`/api/*`** at least **`SECURITY_RATE_LIMIT_BURST_THRESHOLD`** times (default **40**) within **`SECURITY_RATE_LIMIT_WINDOW_MS`** (default **10 minutes**). |
| `suspicious_5xx_burst` | warn | Same IP received **≥500** responses at least **`SECURITY_5XX_BURST_THRESHOLD`** times (default **30**) within **`SECURITY_5XX_WINDOW_MS`** (default **10 minutes**). |
| `invalid_json_body` | warn | Malformed JSON body. |
| `unhandled_exception` | error | Express error handler. |

**Privacy:** Sign-in logs include **email** for abuse investigation. To reduce PII in logs later, add a redaction flag and hash or domain-only logging in `server/src/index.js` if your policy requires it.

---

## Operations checklist

- [ ] TLS everywhere (CDN + API + Supabase URLs).
- [ ] `CLIENT_ORIGIN` set; CORS not `*` in production.
- [ ] All secrets in platform env, not git.
- [ ] Ship logs to a **SIEM** or alert on `level=error` / `suspicious_404_burst` / repeated `auth_sign_in_rate_limited`.
- [ ] Review Supabase **Auth** rate limits and **MFA** policy for admins.
