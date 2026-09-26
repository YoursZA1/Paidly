# Paidly authentication emails — setup

Supabase remains the authentication engine (accounts, passwords, sessions, verification tokens).
Paidly owns what customers see: the email templates, the verification landing page and the welcome
email.

```
Create account ──► "Confirm your Paidly email"  (sent by Supabase, Paidly template)
                          │  Confirm Email
                          ▼
   /auth/verified?token_hash=…&type=email  ──►  supabase.auth.verifyOtp()   (Supabase verifies)
                          │
                          ▼
   "Email verified ✓"  ──►  POST /api/auth/welcome  ──►  "Welcome to Paidly" (Resend, once ever)
                          │  Go to Paidly
                          ▼
   business setup (step 2) / invited till / Dashboard
```

Unverified accounts: sign-in is refused, the app shows **Verify your email** instead of any page, and
the API answers 401/403 `EMAIL_NOT_VERIFIED`.

## Code

| Piece | File |
|---|---|
| Email layout, template builders, welcome email | `server/src/auth/paidlyAuthEmails.js` |
| Supabase template files (generated) | `supabase/templates/*.html` — `node scripts/generate-auth-email-templates.mjs` |
| Local CLI wiring | `supabase/config.toml` → `[auth.email.template.*]` |
| Email logo (PNG — Gmail/Outlook do not render SVG) | `public/email/paidly-logo.png` |
| Verification page | `src/pages/AuthVerified.jsx` (`/auth/verified`, `/auth/verified/pos-invite/:token`) |
| Verify-required screen | `src/components/auth/VerifyEmailRequired.jsx` (rendered by `RequireAuth`) |
| Welcome email endpoint | `server/src/auth/authWelcomeEmailApi.js` → `POST /api/auth/welcome` |
| Once-only marker | `profiles.welcome_email_sent_at` (migration `20260926100000`) |
| Verification rule | `shared/auth/emailVerification.js` |

## Supabase Dashboard — required manual configuration (production project)

Nothing below can be set from the repository; until it is done, production still sends the default
Supabase emails.

1. **Authentication → Sign In / Providers → Email**
   - *Confirm email*: **ON** (this is what stops unverified users from getting a session at all).
2. **Authentication → URL Configuration**
   - *Site URL*: `https://www.paidly.co.za`
   - *Redirect URLs* — add:
     - `https://www.paidly.co.za/auth/verified`
     - `https://www.paidly.co.za/auth/verified/**`
     - preview deployments, e.g. `https://*-<your-vercel-team>.vercel.app/auth/verified/**`
     - local: `http://localhost:5173/auth/verified/**`
     - keep the existing entries (password reset `/ResetPassword`, OAuth callbacks, `/Signup`).
3. **Authentication → Emails → SMTP Settings** (so the sender is Paidly, not the auth provider)
   - *Enable custom SMTP*: ON — host `smtp.resend.com`, port `465`, username `resend`,
     password = the Resend API key (same key as `RESEND_API_KEY`; enter it in the dashboard, never in code).
   - *Sender email*: an address on the Resend-verified `paidly.co.za` domain (e.g. `no-reply@paidly.co.za`).
   - *Sender name*: `Paidly`.
4. **Authentication → Emails → Templates** — for each, set the subject and paste the file contents:

   | Template | Subject | File |
   |---|---|---|
   | Confirm signup | `Confirm your Paidly email` | `supabase/templates/confirm-signup.html` |
   | Reset password | `Reset your Paidly password` | `supabase/templates/reset-password.html` |
   | Magic link | `Your Paidly sign-in link` | `supabase/templates/magic-link.html` |
   | Change email address | `Confirm your new Paidly email` | `supabase/templates/change-email.html` |
   | Invite user | `You've been invited to Paidly` | `supabase/templates/invite.html` |

   Only *Confirm signup* changes the link (to Paidly's `/auth/verified` with the token hash); the others
   keep Supabase's `{{ .ConfirmationURL }}`, so password reset, magic link and invites work as before.
5. **Rate limits** (Authentication → Rate Limits): with custom SMTP the email rate limit can be raised
   from the built-in default to suit sign-up volume.

## Environment variables (names only)

- Server: `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`, `CLIENT_ORIGIN` / `PUBLIC_APP_ORIGIN` (welcome email links and logo).
- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public by design). No email or service-role key
  is ever read by browser code.

## Database

Apply `supabase/migrations/20260926100000_profiles_welcome_email_sent_at.sql`. It marks every
**already verified** user as welcomed, so existing customers do not get a welcome email on release.
