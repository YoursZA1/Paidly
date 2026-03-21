# Auth & Login – How the platform follows best practices

## Summary

- **Login** uses Supabase (email/password + OAuth), with protected routes and redirect-after-login. **Email/password** sign-in is proxied through **`POST /api/auth/sign-in`** so the API can **rate-limit by IP** before credentials reach Supabase.
- **Secrets policy:** [SECRETS_AND_ENV.md](SECRETS_AND_ENV.md) — which keys may appear in the frontend bundle vs server-only; run **`npm run scan-secrets`**.
- **Forgot / Reset password** use Supabase’s reset flow; we do not reveal whether an email exists.
- **Sessions** are managed by Supabase (tokens, refresh); profile is synced from `profiles` and cached in memory/localStorage for the app.

## Checklist

| Practice | Status | Notes |
|----------|--------|--------|
| **HTTPS in production** | ✅ Your responsibility | Ensure app and API are served over HTTPS (e.g. Vercel + backend over HTTPS). |
| **Password not logged** | ✅ | Passwords are sent to **`POST /api/auth/sign-in`** (then Supabase) or `updateUser`; never logged or stored in app state beyond the form. |
| **Email normalization** | ✅ | Login normalizes email with `trim().toLowerCase()` before calling Supabase. |
| **No email enumeration on forgot password** | ✅ | Forgot password always shows the same “check your email” message; uses `SupabaseAuthService.resetPasswordForEmail()`. |
| **Reset link via email only** | ✅ | Supabase sends the reset email; reset is completed via `updateUser({ password })` after user lands on `/ResetPassword` from the link. |
| **Redirect after login** | ✅ | User is sent to `from` (or Dashboard); admins to Dashboard; replace: true to avoid back-button to login. |
| **Protected routes** | ✅ | `RequireAuth` redirects unauthenticated users to Login and preserves `from` for post-login redirect. |
| **Role-based access** | ✅ | `RequireAuth` accepts `roles`; shows “Access restricted” when role doesn’t match. |
| **Email verification handling** | ✅ | Login catches “email not confirmed” and shows verify dialog; resend uses `supabase.auth.resend({ type: 'signup' })` (no client-side tokens). |
| **Session refresh** | ✅ | `onAuthStateChange` handles `TOKEN_REFRESHED` and `INITIAL_SESSION`; profile refreshed via `User.restoreFromSupabaseSession` / `User.me()`. |
| **Logout clears state** | ✅ | `SupabaseAuthService.signOut()` + `User.logout()`; session and user state cleared. |
| **Login rate limit (client)** | ✅ | `src/utils/loginRateLimit.js` — failed attempts per email are throttled in `sessionStorage` (defense in depth; Supabase also rate-limits). |
| **Login rate limit (server / IP)** | ✅ | `server/src/loginIpRateLimit.js` + **`POST /api/auth/sign-in`**. **Production** enforces by default. **Local dev** disables IP limiting unless `LOGIN_RATE_LIMIT_IN_DEV=true` (avoids one shared IP through the Vite proxy blocking everyone). Use Redis or similar if you run **multiple API instances** (in-memory store is per process). |
| **Admin team invites** | ✅ | `POST /api/admin/invite-user` (Bearer user JWT, admin only) calls `inviteUserByEmail` with the service role on the server — never a client-generated invite URL. |
| **Password reset tokens** | ✅ | Only Supabase recovery session on `/ResetPassword`; no `localStorage` reset tokens. |
| **Email confirmations (local)** | ⚙️ | `supabase/config.toml` sets `enable_confirmations = true`; use Inbucket (`supabase status`) for local test emails. |

### API server (email/password sign-in)

Add to **`server/.env`** (same Supabase project as the app):

| Variable | Purpose |
|----------|---------|
| **`SUPABASE_ANON_KEY`** | Same value as `VITE_SUPABASE_ANON_KEY`. Required for **`POST /api/auth/sign-in`** in production. |
| **`LOGIN_RATE_PER_IP_MAX`** | Optional. Default **40** sign-in attempts per IP per window. |
| **`LOGIN_RATE_PER_IP_WINDOW_MS`** | Optional. Default **900000** (15 minutes). |
| **`LOGIN_RATE_LIMIT_ENABLED`** | Set to **`false`** to disable IP limiting entirely (e.g. debugging). |
| **`LOGIN_RATE_LIMIT_IN_DEV`** | Set to **`true`** to enforce IP limiting when `NODE_ENV` is not `production` (e.g. staging). |
| **`TRUST_PROXY`** | Set to **`false`** only if the API is never behind a reverse proxy. |
| **`TRUST_PROXY_HOPS`** | Number of trusted `X-Forwarded-For` hops (default **1**). |

## Supabase configuration required

1. **Redirect URLs**  
   In Supabase Dashboard → Authentication → URL Configuration, add:
   - **Canonical:** `https://www.paidly.co.za/**` (e.g. `/Login`, `/ResetPassword`, `/Dashboard`)
   - **Apex (optional):** `https://paidly.co.za/**` if the apex still serves the app before redirect to www (**`vercel.json`** 308s apex → `www`)
   - **Legacy app subdomains (optional):** `https://app.paidly.co.za/**`, `https://www.app.paidly.co.za/**` until DNS is retired (**`vercel.json`** redirects both → `www.paidly.co.za`)
   - **Dev:** `http://localhost:5173/**` (or your Vite port)

2. **SMTP (password reset emails)**  
   In Authentication → SMTP Settings, configure your provider so Supabase can send reset emails.

3. **Site URL**  
   Set Site URL to **`https://www.paidly.co.za`**. With a **single** deployment on www, leave **`VITE_APP_URL` unset** so post-login stays same-origin. Set **`VITE_APP_URL`** only when the sign-in page is on a different host than the dashboard.

### Sign-in from apex or legacy hosts

If users still open **`https://paidly.co.za`** or legacy **`app.paidly.co.za`** / **`www.app.paidly.co.za`**, point those hostnames at the same Vercel project; **`vercel.json`** redirects them to **`https://www.paidly.co.za`**. Use the **same** `VITE_SUPABASE_*` values everywhere. Add each origin you serve (or redirect from) under Supabase **Redirect URLs** until legacy DNS is removed.

## Files involved

- **Login:** `src/pages/Login.jsx`
- **Forgot password:** `src/pages/ForgotPassword.jsx` (uses `SupabaseAuthService.resetPasswordForEmail`)
- **Reset password:** `src/pages/ResetPassword.jsx` (Supabase recovery session only)
- **Auth context:** `src/components/auth/AuthContext.jsx`
- **Auth service:** `src/services/SupabaseAuthService.js` (`signInWithEmail` → API then `setSession`, `resetPasswordForEmail`, `updatePassword`, `getSession`, `signOut`)
- **API sign-in + IP limit:** `server/src/index.js` (`POST /api/auth/sign-in`), `server/src/loginIpRateLimit.js`, `server/src/supabaseAnon.js`
- **Protected routes:** `src/components/auth/RequireAuth.jsx`
