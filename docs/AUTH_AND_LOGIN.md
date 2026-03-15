# Auth & Login – How the platform follows best practices

## Summary

- **Login** uses Supabase (email/password + OAuth), with protected routes and redirect-after-login.
- **Forgot / Reset password** use Supabase’s reset flow; we do not reveal whether an email exists.
- **Sessions** are managed by Supabase (tokens, refresh); profile is synced from `profiles` and cached in memory/localStorage for the app.

## Checklist

| Practice | Status | Notes |
|----------|--------|--------|
| **HTTPS in production** | ✅ Your responsibility | Ensure app and API are served over HTTPS (e.g. Vercel + backend over HTTPS). |
| **Password not logged** | ✅ | Passwords only passed to `supabase.auth.signInWithPassword` / `updateUser`; never logged or stored in app state beyond the form. |
| **Email normalization** | ✅ | Login normalizes email with `trim().toLowerCase()` before calling Supabase. |
| **No email enumeration on forgot password** | ✅ | Forgot password always shows the same “check your email” message; uses `SupabaseAuthService.resetPasswordForEmail()`. |
| **Reset link via email only** | ✅ | Supabase sends the reset email; reset is completed via `updateUser({ password })` after user lands on `/ResetPassword` from the link. |
| **Redirect after login** | ✅ | User is sent to `from` (or Dashboard); admins to Dashboard; replace: true to avoid back-button to login. |
| **Protected routes** | ✅ | `RequireAuth` redirects unauthenticated users to Login and preserves `from` for post-login redirect. |
| **Role-based access** | ✅ | `RequireAuth` accepts `roles`; shows “Access restricted” when role doesn’t match. |
| **Email verification handling** | ✅ | Login catches “email not confirmed” and shows verify dialog; resend uses magic link. |
| **Session refresh** | ✅ | `onAuthStateChange` handles `TOKEN_REFRESHED` and `INITIAL_SESSION`; profile refreshed via `User.restoreFromSupabaseSession` / `User.me()`. |
| **Logout clears state** | ✅ | `SupabaseAuthService.signOut()` + `User.logout()`; session and user state cleared. |

## Supabase configuration required

1. **Redirect URLs**  
   In Supabase Dashboard → Authentication → URL Configuration, add:
   - **App (production):** `https://app.paidly.co.za/**` (e.g. `https://app.paidly.co.za/ResetPassword`, `https://app.paidly.co.za/Login`)
   - **Marketing site (same database):** so users can sign in from https://paidly.co.za/Auth.html and be redirected to the app after login, add:
     - `https://paidly.co.za/**`
     - `https://www.paidly.co.za/**` (if you use www)
   - **Dev:** `http://localhost:5173/**` (or your Vite port)

2. **SMTP (password reset emails)**  
   In Authentication → SMTP Settings, configure your provider so Supabase can send reset emails.

3. **Site URL**  
   Set Site URL to your main app origin (e.g. `https://app.paidly.co.za`). This is the default redirect after email confirmation; the app also uses `VITE_APP_URL` to send users from the marketing site to the app after login.

### Sign-in from the marketing site (paidly.co.za/Auth.html)

So that users can sign in from https://paidly.co.za/Auth.html and use the **same database** as the app:

- **Deploy the same app** (this codebase) to paidly.co.za so that `/Auth` and `/Auth.html` serve the Login page. The router defines these routes and renders the same Supabase-backed Login component.
- **Use the same Supabase project** on the paidly.co.za deployment: set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as on app.paidly.co.za.
- **Redirect to the app after login:** on the paidly.co.za build, set `VITE_APP_URL=https://app.paidly.co.za`. After a successful login (or signup), the user is sent to the app dashboard and uses the same session.
- **Allow the marketing origin in Supabase:** add `https://paidly.co.za` and `https://www.paidly.co.za` to Redirect URLs (see above) so OAuth and password-reset flows work from that origin.

## Files involved

- **Login:** `src/pages/Login.jsx`
- **Forgot password:** `src/pages/ForgotPassword.jsx` (uses `SupabaseAuthService.resetPasswordForEmail`)
- **Reset password:** `src/pages/ResetPassword.jsx` (Supabase recovery + legacy token fallback)
- **Auth context:** `src/components/auth/AuthContext.jsx`
- **Auth service:** `src/services/SupabaseAuthService.js` (`signInWithEmail`, `resetPasswordForEmail`, `updatePassword`, `getSession`, `signOut`)
- **Protected routes:** `src/components/auth/RequireAuth.jsx`
