# Affiliate admin smoke test (curl)

Quick checks for **`GET /api/admin/affiliates`**, **`POST /api/admin/approve`**, and **`POST /api/admin/decline`** with a real **Bearer** token. **Do not** disable auth on these routes.

## Prerequisites

- **Same deployment** as the SPA, or set `HOST` below to your API origin (e.g. `https://api.example.com`).
- **Vercel / server** has **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** for the same Supabase project as the app.
- Your user is **admin**, **management**, or **support** (JWT `app_metadata` / `user_metadata` or `profiles.role` / `profiles.user_role`).

## 1. Get a Bearer token (access token)

You need a **Supabase JWT access token** for a staff user (not the anon key, not the service role key).

**Option A — Browser (fastest)**  
1. Sign in to the app as an admin/support/management user.  
2. DevTools → **Network** → trigger any authed request (e.g. refresh the admin page) → pick a request to your API or Supabase → **Headers** → copy the value after `Bearer ` from **Authorization**.  
3. Or **Application** → **Local Storage** → your origin → open the Supabase auth entry (often `sb-<project-ref>-auth-token`) → parse JSON → **`access_token`**.

**Option B — Supabase Dashboard**  
**Authentication → Users** → select user → issue a magic link or use the Dashboard’s tools only if your workflow allows; the goal is a **user** `access_token` from a password/magic-link session.

Export it in your shell (no trailing newline issues):

```bash
export TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

## 2. Set host

Same origin as production frontend when API is on the same host:

```bash
export HOST='https://www.paidly.co.za'
```

Local Vite + proxied API:

```bash
export HOST='http://127.0.0.1:5173'
```

Separate API host:

```bash
export HOST='https://your-api.example.com'
```

## 3. List affiliate queue

```bash
curl -sS -X GET "${HOST}/api/admin/affiliates?limit=50" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json" | jq .
```

Expect **`200`** and JSON with **`applications`** (array), **`counts`**, optional **`partners`**.

- **401** — missing/invalid/expired token.  
- **403** — authenticated but not admin/management/support.  
- **503** — Supabase env missing on the server.  
- **500** — DB/PostgREST error; read JSON **`error`** / server logs.

## 4. Approve one application (pending)

Replace `APPLICATION_ID` with a real UUID from the list (`applications[].id`).

```bash
export APPLICATION_ID='00000000-0000-4000-8000-000000000000'

curl -sS -X POST "${HOST}/api/admin/approve" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"applicationId\":\"${APPLICATION_ID}\",\"commissionRate\":20}" | jq .
```

Expect **`200`** with **`ok: true`**, **`referral_code`**, **`referral_link`**, **`user_id`**, **`email_sent`** (and **`email_error`** if email failed but DB update succeeded).

Common errors:

- **400** — not pending, bad body, missing email.  
- **409** — `no_user_for_email` (applicant must have a matching **`profiles`** row / signup first).  
- **503** — **`RESEND_API_KEY`** missing (approve handler requires Resend on serverless/Express path used here).

## 5. Decline one application (pending)

```bash
curl -sS -X POST "${HOST}/api/admin/decline" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"applicationId\":\"${APPLICATION_ID}\"}" | jq .
```

Expect **`200`** and **`{ "ok": true }`**. Application status should become **`rejected`** in **`affiliate_applications`**.

## 6. Legacy path (optional)

Same approve handler, alternate URL:

```bash
curl -sS -X POST "${HOST}/api/affiliates/approve" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"applicationId\":\"${APPLICATION_ID}\",\"commissionRate\":20}" | jq .
```

## Checklist

| Step | OK |
|------|----|
| `GET /api/admin/affiliates` → 200, `applications` array | ☐ |
| Pending row exists, applicant has user in `profiles` if approving | ☐ |
| `POST /api/admin/approve` → 200, `referral_code` set | ☐ |
| UI: invalidate / refresh shows updated status (or re-run GET) | ☐ |

## Related code

- Core logic: `server/src/affiliateModerationCore.js`  
- Vercel approve: `POST /api/affiliates/approve` → `api/affiliates/[[...slug]].js` + `api/affiliates/_approveHandler.js` · decline: `server/src/vercelAffiliateDeclinePost.js` via `api/admin/[resource].js`  
- Express: `server/src/affiliateApplicationAdminActions.js`  
- Frontend: `src/api/affiliateAdminModerationApi.js`
