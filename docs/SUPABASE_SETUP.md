# Supabase setup – Paidly

Single guide to get Supabase configured for the Paidly app: project, env vars, schema, auth (email + Google + Apple), storage, Edge Functions, and verification.

---

## 1. Create a Supabase project

1. Go to [app.supabase.com](https://app.supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `paidly`), database password, region.
3. Wait for the project to be ready.

Use **separate projects** for development and production. Do not point production at a dev project.

---

## 2. Get project credentials

In the Supabase Dashboard:

- **Settings → API**
  - **Project URL** → `VITE_SUPABASE_URL` / `SUPABASE_URL`
  - **anon public** key → `VITE_SUPABASE_ANON_KEY` (frontend only)
  - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server/Edge Functions only; never expose to the client)

---

## 3. Environment variables

### 3.1 Frontend (project root)

Create or edit `.env` or `.env.development`:

```env
# Backend API (optional; default http://localhost:5179)
VITE_SERVER_URL=http://localhost:5179

# Supabase – required for auth and data
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here

# Storage bucket name (optional; default invoicebreek)
VITE_SUPABASE_STORAGE_BUCKET=invoicebreek
```

Use `.env.production` (or your host’s env) for production and set the same keys for the **production** Supabase project.

### 3.2 Backend server (`server/`)

Create or edit `server/.env`:

```env
PORT=5179
CLIENT_ORIGIN=http://localhost:5173

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

---

## 4. Apply schema and migrations

### 4.1 Main schema

In Supabase Dashboard → **SQL Editor**, run the contents of:

**`supabase/schema.postgres.sql`**

This creates:

- Tables: `organizations`, `profiles`, `memberships`, `clients`, `invoices`, `invoice_items`, `payments`, `quotes`, `quote_items`, `services`, `banking_details`, `recurring_invoices`, `invoice_views`, `payslips`, `expenses`, `tasks`, `notifications`, `packages`, etc.
- RLS policies
- Triggers (e.g. `handle_new_user` for signup)
- Storage bucket entry for `invoicebreek`

### 4.2 PayFast subscription columns (profiles)

Run the migration that adds PayFast-related columns to `profiles`:

**`supabase/migrations/20240308120000_add_profiles_payfast_columns.sql`**

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payfast_token text,
  ADD COLUMN IF NOT EXISTS subscription_status text;
```

Or run that SQL directly in the SQL Editor.

---

## 5. Storage bucket

If the bucket was not created by the schema:

1. **Storage → Buckets → New bucket**
2. Name: **`invoicebreek`**
3. Keep it **private** (app uses signed URLs).

---

## 6. Auth providers

### 6.1 Email / password

- **Authentication → Providers → Email**
- Enable **Email** and confirm **Confirm email** settings (e.g. double opt-in) if you use them.

### 6.2 Google

1. **Authentication → Providers → Google** → Enable.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create **OAuth 2.0 Client ID** (Web application).
   - **Authorized redirect URIs**:  
     `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Copy **Client ID** and **Client secret** into Supabase Google provider.

### 6.3 Apple

1. **Authentication → Providers → Apple** → Enable.
2. In [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId): create a **Sign in with Apple** Services ID and configure keys.
3. In Supabase, set **Services ID**, **Secret Key**, **Key ID**, **Team ID**, **Bundle ID** (or other required fields as shown in the UI).

### 6.4 URL configuration

- **Authentication → URL configuration**
  - **Site URL**: your app origin (e.g. `https://your-app.vercel.app` or `http://localhost:5173`).
  - **Redirect URLs**: add the same origin(s) so OAuth and magic links redirect back correctly.

---

## 7. Edge Functions (PayFast ITN)

The **payfast-itn** function updates `profiles` when PayFast sends an ITN (Instant Transaction Notification).

### 7.1 Deploy the function

From the project root (with [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in):

```bash
supabase functions deploy payfast-itn
```

Or deploy via Dashboard (if your project supports it).

### 7.2 Set secrets

In Dashboard → **Edge Functions** → **payfast-itn** → **Secrets** (or Project Settings → Edge Functions):

| Secret               | Description                    |
|----------------------|--------------------------------|
| `PAYFAST_PASSPHRASE` | PayFast merchant passphrase    |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are usually provided by Supabase; if not, add them.

### 7.3 ITN URL in PayFast

In PayFast → **Settings → Developer → ITN Notify URL** set:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/payfast-itn
```

---

## 8. Admin user (optional)

To give a user the admin role, run in **SQL Editor** (replace the email):

```sql
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
WHERE email = 'admin@example.com';
```

---

## 9. Verify setup

From the project root:

```bash
node scripts/verify-supabase-config.js
```

This checks:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` / `.env.development`
- Connection to Supabase
- That the anon key can access the API (e.g. `organizations` table)

Fix any missing or incorrect env vars, then restart the app:

- Frontend: `npm run dev`
- Backend: `npm run server` (or `npm run server` from repo root if configured)

---

## 10. Quick checklist

| Step | Action |
|------|--------|
| 1 | Create Supabase project (separate for prod) |
| 2 | Copy Project URL and anon key → frontend `.env` |
| 3 | Copy Project URL and service_role key → `server/.env` |
| 4 | Run `supabase/schema.postgres.sql` in SQL Editor |
| 5 | Run `supabase/migrations/20240308120000_add_profiles_payfast_columns.sql` (or the SQL inside it) |
| 6 | Create storage bucket `invoicebreek` if missing |
| 7 | Enable Email provider; configure Google and Apple if used |
| 8 | Set Site URL and Redirect URLs in Auth URL configuration |
| 9 | Deploy `payfast-itn`, set `PAYFAST_PASSPHRASE`, configure PayFast ITN URL |
| 10 | Run `node scripts/verify-supabase-config.js` and fix any errors |

---

## References

- **Schema & RLS:** `supabase/schema.postgres.sql`, `docs/SUPABASE_SETUP_AND_MAINTENANCE.md`
- **Storage:** `docs/SUPABASE_STORAGE.md`, `SUPABASE_BUCKETS_SETUP.md`
- **Security:** `docs/SUPABASE_SECURITY.md`
- **Realtime:** `docs/SUPABASE_REALTIME.md`
