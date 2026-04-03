# Paidly: signup & auth testing (dev)

Practical checklist for local development and staging—aligned with Supabase, Paidly’s client guards, and test email habits.

---

## 1. Raise limits on a **dev-only** Supabase project

Use a **separate** Supabase project for development. Never widen auth rate limits on production to “make testing easier.”

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) → your **dev** project.
2. Go to **Authentication** → **Rate limits** (see [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) for what each control does).
3. Adjust limits that match how aggressively you exercise sign-up, magic links, and OTP in that project.

Some platform limits are fixed or IP-based; if you still see `429` responses, slow down automated tests or run them from fewer parallel workers.

---

## 2. Loading state and double-submit (critical)

Paidly relies on explicit **loading** state plus **synchronous** submit locks where React has not re-rendered yet:

- **Signup** (`src/pages/Signup.jsx`): `loading` state, ref locks on step 1 / step 2, disabled submit while `loading`.
- **Landing sign-in** (`src/components/auth/LandingLoginModal.jsx`): `isLoading`, submit lock ref, disabled submit while loading.

When adding new auth or payment flows, follow the same pattern: `if (loading) return`, set loading in `try`/`finally`, and disable the primary button while the request is in flight.

---

## 3. Avoid repeated signups (abuse + noise)

- **One account per email**: Supabase Auth rejects duplicate signups for the same email; don’t hammer the same address when debugging.
- **Client throttle**: `src/utils/signupRateLimit.js` limits repeated step-1 attempts per email (sessionStorage). It is **automatically relaxed** while `vite` runs in dev (`import.meta.env.DEV`) and can be relaxed for other preview setups with `VITE_RELAX_CLIENT_AUTH_THROTTLE=true` (see `src/utils/clientAuthThrottleEnv.js`). **Production builds** keep the throttle unless you set that variable (avoid in production).
- **Login throttle**: `src/utils/loginRateLimit.js` uses the same relaxation helper for failed password attempts.
- **UI**: Submit locks prevent double clicks from firing two concurrent `signUp` / `signIn` calls before the button disables.

---

## 4. Use test emails properly

- **Plus addressing** (Gmail and many providers): `you+paidly1@gmail.com`, `you+paidly2@gmail.com` — all deliver to `you@gmail.com` but register as distinct users in Supabase.
- **Disposable / team inboxes**: Use addresses you control so confirmation links don’t leak to strangers.
- **Local Supabase**: With the CLI stack, use the [Inbucket](https://supabase.com/docs/guides/local-development#emails)-style mail UI to read auth emails without sending real mail.
- **Disable email confirmation** only on a **throwaway dev project** if you need faster loops—never on production.

---

## Quick reference

| Concern | Where |
|--------|--------|
| Signup flow & tables | [SIGNUP_VERIFICATION.md](./SIGNUP_VERIFICATION.md) |
| Supabase auth rate limits (official) | https://supabase.com/docs/guides/auth/rate-limits |
| Relax **client-side** signup/login throttle | `import.meta.env.DEV` or `VITE_RELAX_CLIENT_AUTH_THROTTLE=true` |
