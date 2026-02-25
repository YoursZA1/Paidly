# Supabase Security

This document summarizes how the app keeps Supabase access secure: **Row Level Security (RLS)** for data access per user/role, and **no service keys in the frontend**. For access restrictions, compliance policies, and a full security checklist, see **[SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md)**.

## 1. Row Level Security (RLS)

All application tables and storage use RLS so that access is restricted by user and role. Policies are defined in **`supabase/schema.postgres.sql`**.

### Tables with RLS enabled

- **organizations** – Owner can manage their org; admins have full access.
- **profiles** – Users can read/update only their own profile (`id = auth.uid()`); admins have full access.
- **memberships** – Members can select rows for orgs they belong to; only org owners can insert/update/delete memberships for their org; admins have full access.
- **clients, services, quotes, quote_items, invoices, invoice_items, payments** – **Org-scoped**: users can select rows where they have a membership in the same `org_id`; they can insert/update/delete only for that org. Admins have full access.

### Role model

- **Admin**: `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'` (see `public.is_admin()`). Admins bypass org checks and have full access to all rows in the listed tables.
- **Org member**: Access only to rows where `org_id` matches an org they belong to (via `memberships`).
- **Profile**: Each user can only read/update their own row in `profiles` (by `id = auth.uid()`).

### Storage (buckets)

- **User-owned objects** (e.g. logos): Path first segment must equal `auth.uid()::text` for insert/select/update/delete.
- **Org-scoped objects**: Path first segment must equal the user’s `org_id` (via membership) for all operations.
- **Admin**: Full access to the configured buckets when `is_admin()`.

RLS ensures that even if the frontend or an attacker sends a request for another org’s data, Supabase will not return or modify rows that don’t match the policies. This provides **data protection** for compliance: access is enforced at the database layer regardless of client behaviour.

## 2. Never expose service keys in the frontend

- **Frontend** must use only the **anonymous (public) key**: `VITE_SUPABASE_ANON_KEY`.  
  This key is safe to ship in the browser; RLS and Postgres permissions limit what it can do.  
  The frontend Supabase client is created in **`src/lib/supabaseClient.js`** using only:
  - `import.meta.env.VITE_SUPABASE_URL`
  - `import.meta.env.VITE_SUPABASE_ANON_KEY`

- **Service role key** must **never** be used in the frontend or in any client-side bundle. It bypasses RLS and has full database access.  
  It may only be used in a **backend** (e.g. Node server) that runs in a trusted environment. This project uses it only in **`server/`** via `process.env.SUPABASE_SERVICE_ROLE_KEY` (see **`server/.env.example`** and **`server/src/supabaseAdmin.js`**).  
  The frontend **`.env`** and **`.env.example`** do not and must not contain any variable like `SERVICE_ROLE_KEY` or `VITE_*` that holds the service key.

### Checklist

- [ ] Frontend `.env` / env vars: only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and optional `VITE_SUPABASE_STORAGE_BUCKET`, `VITE_SERVER_URL`). No `VITE_*` variable for the service role key.
- [ ] Server-only operations (e.g. admin sync, bypassing RLS) use a backend that reads `SUPABASE_SERVICE_ROLE_KEY` from server env, never from the client.
- [ ] No `createClient(url, serviceRoleKey)` or similar in any file under `src/` or in any Vite bundle.

## 3. Compliance

RLS is used to **enforce access and compliance**: only org members (or admins) can read/write org-scoped rows; users can only access their own profile. For a full list of access rules, admin checks, and a compliance checklist, see [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md).

## 4. Applying and verifying

- **Apply RLS and policies**: Run **`supabase/schema.postgres.sql`** (e.g. via Supabase SQL Editor or migrations). That script enables RLS on the listed tables and creates the policies above (and storage policies).
- **Verify frontend key**: In the built app, only the anon key should appear in network requests or env (e.g. in Supabase client config). The service role key must not appear in client-side code or in any `VITE_*` env var.
