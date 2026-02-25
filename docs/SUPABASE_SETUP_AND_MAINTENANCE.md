# Supabase: Environment Setup & Maintenance

This document is the main reference for **setting up** and **maintaining** Supabase in this project. Use it for onboarding, new environments, and future maintenance.

---

## Supabase Configuration (Critical)

Before going live or deploying:

- **Production:** Use a **production Supabase project** (create a dedicated project in [Supabase Dashboard](https://app.supabase.com) for production). Do **not** point the live app at a dev or local Supabase project.
- **Staging:** Use a separate Supabase project for staging so production data is never mixed with test data.
- **Local dev:** Use a separate project or the same staging project; never use the production project URL/keys in development unless you intend to hit production data.

**Checklist:**

| Item | Status |
|------|--------|
| Production Supabase project created (not using dev project) | ☐ |
| **`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` correctly set in production** (host env or `.env.production`) | ☐ |
| **Service role key never exposed on frontend** — frontend uses **anon key only**; `SUPABASE_SERVICE_ROLE_KEY` only in server env | ☐ |
| Server `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (if used) point to same production project | ☐ |
| Schema applied to production project (`schema.postgres.sql` or ensure scripts) | ☐ |
| **RLS enabled on ALL user-related tables** (non-negotiable; see RLS section below) | ☐ |
| RLS policies enabled; anon key used in frontend only | ☐ |

---

## Row Level Security (RLS) – NON-NEGOTIABLE

**RLS must be enabled on ALL user-related tables.** Do not ship or deploy with RLS disabled on any table that holds user or org data. The anon key is safe in the frontend only because RLS restricts what each user can read and write.

**Checklist:**

| Item | Status |
|------|--------|
| **RLS enabled on ALL user-related tables** (see list below) | ☐ |
| **Policies restrict users to only their own data** (org-scoped or user-scoped; no cross-org access for non-admins) | ☐ |
| **Admin-only policies clearly separated** (distinct "admin full access ..." policies using `public.is_admin()`; no mixing with org/user policies) | ☐ |

**Admin-only policies clearly separated:** Admin access is implemented as **separate policies** named `"admin full access <table>"` that use **`public.is_admin()`** (JWT `app_metadata.role = 'admin'`). These are defined alongside, but distinct from, the org-scoped and user-scoped policies (e.g. "org members select", "org members write", "users own notifications"). Do not combine admin logic into the same policy as member logic; keep admin bypass in its own policy so it is auditable and can be reviewed independently.

**Policies restrict users to only their own data:** Non-admin users must only see and modify rows that belong to them or their organization. The schema does this via: (1) **org-scoped policies** — e.g. "org members select/write" so users can only access rows where `org_id` matches one of their memberships; (2) **user-scoped policies** — e.g. `profiles` and `notifications` where `user_id = auth.uid()` or `id = auth.uid()`; (3) **admin bypass** — `public.is_admin()` grants full access only when the JWT has the admin role. There must be no policy that allows a normal user to read or write another org’s or another user’s data.

**Tables that must have RLS enabled:** Every table in `public` that the app uses: `organizations`, `profiles`, `memberships`, `clients`, `services`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `banking_details`, `recurring_invoices`, `packages`, `invoice_views`, `payslips`, `expenses`, `tasks`, `notifications`. Storage: `storage.objects` (policies per bucket).

**In schema:** Each of these tables has `alter table public.<table> enable row level security;` and one or more policies (e.g. "admin full access ...", "org members select", "org members write"). Verify in Supabase Dashboard → Authentication → Policies, or run:

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

**Expected:** `rowsecurity = true` for every table. If any table shows `false`, run `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` and add the required policies from **`supabase/schema.postgres.sql`**.

---

## Database Structure

All application tables are defined in **`supabase/schema.postgres.sql`** and are considered **finalized** for production use.

**Checklist:**

| Item | Status |
|------|--------|
| **All tables finalized** (users, invoices, clients, payments, subscriptions-related, etc.) | ☐ |
| **Proper foreign keys + indexes added** (FKs and indexes defined in `schema.postgres.sql`) | ☐ |
| **No unused columns** — every column is used by the app or reserved for a defined purpose | ☐ |
| **Naming consistency: snake_case** — database columns and API payloads to Supabase use `snake_case` (e.g. `org_id`, `client_id`, `created_at`) | ☐ |

**Foreign keys:** All tables use proper `references` (e.g. `org_id` → `organizations(id)`, `client_id` → `clients(id)`, `invoice_id` → `invoices(id)`, `quote_id` → `quotes(id)`, `created_by_id` / `user_id` → `auth.users(id)`), with `on delete cascade` or `on delete set null` as appropriate.

**Indexes:** Indexes are created for common filters and sorts: `org_id`, `client_id`, `invoice_id`, `quote_id`, `status`, `created_at`, `invoice_number`, `quote_number`, `pay_date`, `due_date`, etc. See the `create index if not exists idx_*` statements at the end of **`supabase/schema.postgres.sql`**.

**Naming:** Database and Supabase API use **snake_case** for all column names (e.g. `org_id`, `client_id`, `created_at`, `created_by_id`). The frontend may use camelCase in UI state; mapping to/from snake_case happens at the API layer (e.g. in **`src/api/customClient.js`**). Do not add camelCase column names to the schema.

**Unused columns:** Schema is kept without unused columns; every column is referenced by the app or explicitly reserved. When adding columns, ensure they are used or documented as reserved.

**Tables (public schema):**

| Table | Purpose |
|-------|---------|
| `organizations` | Tenants / companies |
| `profiles` | User profile data (extends `auth.users`) |
| `memberships` | User–organization link (roles) |
| `clients` | Customers |
| `services` | Services, products, labor, materials, expenses (unified catalog) |
| `quotes` | Quotes |
| `quote_items` | Quote line items |
| `invoices` | Invoices |
| `invoice_items` | Invoice line items |
| `payments` | Payments against invoices |
| `banking_details` | Bank/import data |
| `recurring_invoices` | Recurring invoice templates |
| `packages` | Subscription packages (platform/org) |
| `invoice_views` | Invoice view tracking |
| `payslips` | Payroll / payslips |
| `expenses` | Expenses |
| `tasks` | Tasks |
| `notifications` | User notifications |

**Auth:** Users are stored in **`auth.users`** (Supabase Auth). The app uses **`profiles`** and **`memberships`** for display and org-scoped access. Subscription/billing state may be in app logic or external (e.g. Payfast); **`packages`** holds package definitions.

To apply or verify: run **`supabase/schema.postgres.sql`** in the Supabase SQL Editor, or use the **`scripts/ensure-*-schema.sql`** scripts for individual tables. See **`docs/PLATFORM_SUPABASE_SCHEMA_CHECK.md`** and **`docs/SUPABASE_INTEGRATION_CHECKLIST.md`**.

---

## 1. Environment setup

### 1.1 Frontend (Vite / React app)

Variables are loaded from the project root. Vite loads (in order) **`.env`**, **`.env.local`**, then **`.env.[mode]`** (e.g. `.env.development` or `.env.production`) and **`.env.[mode].local`**. Only names starting with **`VITE_`** are exposed to the client.

#### Separate DEV and PROD

| Environment | Example file | When used | Supabase project |
|-------------|--------------|-----------|-------------------|
| **Development** | `.env.development.example` → `.env.development` | `npm run dev` | Dev or staging only |
| **Production** | `.env.production.example` → `.env.production` (or host env) | `npm run build` / deploy | Production only |

- **DEV:** Copy `.env.development.example` to `.env.development` (or use `.env`). Use a **dev or staging** Supabase project; never point dev at production.
- **PROD:** Set variables in your host (Vercel, Netlify, etc.) or copy `.env.production.example` to `.env.production` for builds. Use a **dedicated production** Supabase project only.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | **Yes** | Supabase project URL. Get it: **Supabase Dashboard → Project → Settings → API → Project URL**. |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Anonymous (public) key. Same place: **Settings → API → Project API keys → `anon` public**. |
| `VITE_SERVER_URL` | No | Backend API base URL. DEV: e.g. `http://localhost:5179`. PROD: your API base URL. |
| `VITE_SUPABASE_STORAGE_BUCKET` | No | Default storage bucket name (default: `invoicebreek`). |

**Steps (development):**

1. Copy the development example:
   ```bash
   cp .env.development.example .env.development
   # or: cp .env.example .env
   ```
2. Open **Supabase Dashboard → your dev/staging project → Settings → API**.
3. Set in `.env.development` (or `.env`):
   - `VITE_SUPABASE_URL` = **Project URL**
   - `VITE_SUPABASE_ANON_KEY` = **anon public** key (not the `service_role` key).
4. Save. Restart the dev server if it was running (`npm run dev`).

**Steps (production):** Configure the same variables in your deployment platform’s environment (e.g. Vercel → Settings → Environment Variables) using values from your **production** Supabase project.

**Important:** Never put the **service_role** key in the frontend or in any `VITE_*` variable. It bypasses RLS and must only be used on the server. See [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md).

---

### 1.2 Server (Node backend)

Used for admin/sync and any server-only Supabase operations. Config lives in **`server/.env`** (or host environment in production).

#### Separate DEV and PROD (server)

| Environment | Example file | When used |
|-------------|--------------|-----------|
| **Development** | `server/.env.development.example` → `server/.env` or `server/.env.development` | Local `npm run dev` (server) |
| **Production** | `server/.env.production.example` → host env or `server/.env.production` | Deployed API |

- **DEV:** Use a dev/staging Supabase project; `PAYFAST_MODE=sandbox`; `ADMIN_BYPASS_AUTH` only if needed.
- **PROD:** Use production Supabase; `PAYFAST_MODE=live`; set `ADMIN_BYPASS_AUTH=false` and real URLs.

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes (if using Supabase from server) | Same project URL as frontend for that environment. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (if using admin/Supabase from server) | **Settings → API → `service_role`** key. Keep secret. |
| `SUPABASE_STORAGE_BUCKET` | No | Default bucket (e.g. `invoicebreek`). |
| `ADMIN_BOOTSTRAP_TOKEN` | Optional | For admin bootstrap flows. |
| `ADMIN_BYPASS_AUTH` | No | Set to `true` only in dev if you need to bypass auth. Must be `false` in production. |

**Steps:**

1. Copy **`server/.env.example`** (or **`server/.env.development.example`** / **`server/.env.production.example`**) to **`server/.env`**.
2. Fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the **same** Supabase project as the frontend for that environment (dev vs prod).
3. Do not commit `server/.env` (it is in `.gitignore`).

---

### 1.3 New project / new environment

For a **new Supabase project** (e.g. staging or production):

1. Create the project in [Supabase Dashboard](https://app.supabase.com).
2. Apply the schema: run **`supabase/schema.postgres.sql`** in **SQL Editor** (or use Supabase CLI: `supabase link` then `supabase db push` if you use migrations).
3. Create frontend `.env` and server `server/.env` with that project’s **URL**, **anon key**, and (for server) **service_role** key.
4. Optionally create storage buckets via the schema (buckets and RLS are defined there); see [SUPABASE_STORAGE.md](SUPABASE_STORAGE.md).
5. In **Database → Replication**, ensure the **supabase_realtime** publication includes the tables you need (`invoices`, `quotes`, `payments`, `clients`); see [SUPABASE_REALTIME.md](SUPABASE_REALTIME.md).

---

## 2. Where Supabase is used in the app

Quick reference for maintenance and debugging.

| Area | Purpose | Main files / entry points |
|------|----------|---------------------------|
| **Auth** | Sign up, sign in, sign out, session, magic link | `src/components/auth/AuthContext.jsx`, `src/services/SupabaseAuthService.js`, Login/Signup pages |
| **Database (CRUD)** | Clients, services, invoices, quotes, payments, org/profile | `src/api/customClient.js` (EntityManager, AuthManager), entities in `src/api/entities.js`; pages use `Client.*`, `Invoice.*`, etc. |
| **Database (admin)** | Subscriptions, users, audit data | `src/pages/AdminSubscriptions.jsx`, `src/pages/AdminInvoicesQuotes.jsx`, `src/components/notifications/NotificationBell.jsx` (direct `supabase.from(...)`) |
| **Storage** | Logos, receipts, attachments, bank imports | `src/services/SupabaseStorageService.js`, `src/services/SupabaseMultiBucketService.js`, `src/api/customClient.js` (IntegrationManager), `src/api/integrations.js` |
| **Realtime** | Live list updates (invoices, quotes) | `src/hooks/useSupabaseRealtime.js`, used in `Invoices.jsx`, `Quotes.jsx` |

### 2.1 Authentication & Access Control

- **Email verification:** Ensure Supabase **Email confirmations** are configured (Dashboard → Authentication → Providers → Email). The app shows a “Email not verified” state via **`src/components/auth/AuthContext.jsx`** (`showVerifyDialog`). Confirm that confirmation emails are sent and that the **Site URL** and **Redirect URLs** (Authentication → URL Configuration) are correct for your environment.
- **Password reset:** The flow uses **`sendPasswordReset`** in AuthContext (Supabase `resetPasswordForEmail`). Users receive an email and complete the reset on **`/ResetPassword`** (**`src/pages/ResetPassword.jsx`**). Verify the flow end-to-end and that Supabase **Email templates** and redirect URLs are correct for dev and production.
- **Session persistence:** The Supabase client is created with **`persistSession: true`** (**`src/lib/supabaseClient.js`**), so the session is stored (e.g. in localStorage) and restored on reload. **`AuthContext`** initializes by calling **`SupabaseAuthService.getSession()`** and subscribes to auth state changes so the user stays logged in across refreshes and tab switches. Confirm that after sign-in, refreshing the page or reopening the app keeps the user authenticated.
- **Logout clears session:** On logout, **`AuthContext`** calls **`SupabaseAuthService.signOut()`** (Supabase `auth.signOut()`), then **`User.logout()`** and clears local session state (`setSession(null)`). This removes the stored session so the user is fully signed out. Verify that after logout the user cannot access protected routes, that a reload shows the login screen, and that no stale session is restored.
- **Admin role separated from normal users:** Admin identity is **only** from Supabase Auth JWT **`app_metadata.role === 'admin'`**. The database uses **`public.is_admin()`** (same check) in **separate** RLS policies (e.g. "admin full access ..."); normal users are restricted by org membership or own-row policies. Admin UI routes are protected by **`RequireAuth`** with **`roles={["admin"]}`**; the server admin API checks the JWT role (e.g. **`getAdminFromRequest`** in **`server/src/index.js`**). Confirm that non-admin users cannot access admin routes or admin API endpoints, and that admins get full access only via the dedicated admin policies.
- **"Admin access required" issue fully resolved:** When a user has **`app_metadata.role === 'admin'`** in their Supabase JWT, they can access admin UI and admin API (sync, roles, etc.) without seeing 403 or "Admin access required." That message appears only when the caller is **not** an admin (expected). Resolution is ensured by: (1) setting the admin role in Supabase Auth (Dashboard or **`POST /api/admin/roles`**), (2) server using **`getAdminFromRequest`** so the same JWT role is trusted for API access, and (3) frontend **`RequireAuth`** and role display using the same role from the session. If a legitimate admin still sees "Admin access required," re-check that their **`app_metadata.role`** is set to **`"admin"`** and that they have a valid session (re-login may be needed after role change).

**Client instance:** The single Supabase client used in the frontend is created in **`src/lib/supabaseClient.js`** using only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. All frontend Supabase usage goes through this client (or re-exports of it).

---

## 3. Admin features and Supabase

For **future maintenance** of admin functionality and how it uses Supabase, see **[ADMIN_FEATURES_AND_SUPABASE.md](ADMIN_FEATURES_AND_SUPABASE.md)**. It includes:

- A list of all **admin routes and features** and how each uses Supabase (sync, direct DB, server API, storage).
- The **server admin API** (sync-data, roles, delete user) and which Supabase calls they use.
- A **Supabase setup summary** (env, client, auth, RLS, storage, realtime, sync flow).
- A **documentation index** and **common maintenance tasks** (add admin feature, fix sync, permission denied, schema changes).

Use it together with **[SUPABASE_INTEGRATION_CHECKLIST.md](SUPABASE_INTEGRATION_CHECKLIST.md)** (integration checklist and final steps) and **[MONITORING_LOGS_AND_SYNC.md](MONITORING_LOGS_AND_SYNC.md)** (logs and sync/permission troubleshooting).

---

## 4. Detailed documentation (by topic)

| Document | Contents |
|----------|----------|
| [ADMIN_FEATURES_AND_SUPABASE.md](ADMIN_FEATURES_AND_SUPABASE.md) | Admin features list, Supabase usage per feature, setup summary, doc index (future maintenance). |
| [SUPABASE_INTEGRATION_CHECKLIST.md](SUPABASE_INTEGRATION_CHECKLIST.md) | Client setup, auth/RLS, database ops, storage, realtime, admin workflows, final steps. |
| [MONITORING_LOGS_AND_SYNC.md](MONITORING_LOGS_AND_SYNC.md) | Where to look for logs, common sync/permission issues and fixes. |
| [SUPABASE_DATA_MODEL.md](SUPABASE_DATA_MODEL.md) | Table ↔ entity mapping, CRUD flow, schema alignment, applying schema. |
| [SUPABASE_STORAGE.md](SUPABASE_STORAGE.md) | Buckets, RLS policies, path conventions, app integration (logos, activities, bank-details). |
| [SUPABASE_REALTIME.md](SUPABASE_REALTIME.md) | Realtime publication, `useSupabaseRealtime` hook, enabling new tables. |
| [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md) | RLS, anon vs service key, checklist for not exposing the service key. |
| [SUPABASE_UI_REVIEW.md](SUPABASE_UI_REVIEW.md) | Map of Supabase API calls to UI actions and error handling. |
| [TESTING.md](TESTING.md) | Unit tests (auth, storage, error utils), manual/E2E ideas, log monitoring. |

---

## 5. Common maintenance tasks

### Apply or update schema

- **One-off:** Open Supabase Dashboard → **SQL Editor** → paste and run the contents of **`supabase/schema.postgres.sql`** (or the part you changed).
- **With CLI:** If using Supabase CLI and migrations, run `supabase db push` from the project root (after linking the project).

### Add or change a bucket

1. Define the bucket and its RLS policies in **`supabase/schema.postgres.sql`** (see existing `storage.buckets` and `storage.objects` policies in [SUPABASE_STORAGE.md](SUPABASE_STORAGE.md)).
2. Run the SQL. In the app, use `SupabaseStorageService` or `SupabaseMultiBucketService` with the new bucket name and the correct path convention (e.g. `org_id/...` for org-scoped).

### Enable Realtime for a new table

1. Add the table to the publication (SQL Editor or Replication UI):
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;
   ```
2. In the app, use `useSupabaseRealtime(['your_table'], callback)` where you need live updates. See [SUPABASE_REALTIME.md](SUPABASE_REALTIME.md).

### Rotate keys (anon or service_role)

1. In Supabase: **Settings → API** → regenerate the key you need.
2. Update **`.env`** (frontend: `VITE_SUPABASE_ANON_KEY`) or **`server/.env`** (server: `SUPABASE_SERVICE_ROLE_KEY`).
3. Restart the dev server and/or backend. No code change required.

### Debug “permission denied” or empty data

- Confirm **RLS** is enabled and policies match the current role (see [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)).
- Confirm the user has a **membership** and the resource’s `org_id` matches (for org-scoped tables).
- For storage: confirm path convention (e.g. first segment = `auth.uid()` or `org_id`) and bucket name.

### Check what the frontend sends

- Use browser DevTools → **Network**: filter by your Supabase URL to see REST calls and payloads.
- All client access uses the **anon** key; RLS and Postgres permissions determine what succeeds.

---

## 6. Checklist for a new developer / new machine

- [ ] **UI & UX:** Loading states (no blank screens); errors in the UI (toast/inline); designed empty states for “no data yet” (message + CTA); mobile responsive tested; all buttons clickable and functioning; no “undefined” or broken UI strings; dashboard layout clean and focused—see **`docs/SUPABASE_INTEGRATION_CHECKLIST.md`** (UI & UX Readiness).
- [ ] Clone repo, run `npm install` (and `npm install` in `server/` if using the backend).
- [ ] Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project.
- [ ] If using the server: copy `server/.env.example` to `server/.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Ensure the Supabase project has the schema applied (`supabase/schema.postgres.sql`).
- [ ] Run `npm run dev` and open the app; sign in or sign up to verify auth and data load.

---

_Last updated: 2026-02-19_
