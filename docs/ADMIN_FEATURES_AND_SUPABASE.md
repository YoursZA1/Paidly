# Admin Features and Supabase Setup (Future Maintenance)

This document describes **admin features** and how they use **Supabase**, and summarizes **Supabase setup** so future maintainers can onboard and change things safely.

---

## 1. Admin features overview

All admin routes are protected by **RequireAuth** with `roles={["admin"]}`. Admin identity comes from Supabase Auth JWT **`app_metadata.role === 'admin'`** (or server bypass in dev). RLS policies grant admins full access to application tables and storage buckets where configured.

### 1.1 Admin routes and Supabase usage

| Route(s) | Page / feature | Supabase usage |
|----------|----------------|----------------|
| `/admin`, `/admin/admin-control`, `/AdminControl` | Admin Control (landing) | Auth (session/role). No direct DB. |
| `/admin/accounts-management`, `/AdminAccounts` | Accounts management, health, usage | **Sync:** `syncAdminData()` → server `GET /api/admin/sync-data` (Auth + profiles, memberships, orgs, clients, services, invoices, quotes, payments). **Data:** AdminDataService (localStorage cache from sync). |
| `/admin/user-management`, `/AdminUsers`, `/admin/users`, `/UserManagement` | User list, suspend, roles | AdminDataService / UserManagementService; **role update** → `POST /api/admin/roles` (Supabase Auth `updateUserById`); **delete** → `DELETE /api/admin/users/:id` (Supabase Auth `deleteUser`). **Sync** populates list from Supabase. |
| `/admin/invoices-quotes`, `/AdminInvoicesQuotes` | List all invoices & quotes | **Direct Supabase:** `supabase.from('invoices').select('*')`, `supabase.from('quotes').select('*')`. Edit via EntityManager → `invoices` / `quotes` + items. RLS gives admins all rows. |
| `/admin/document-oversight`, `/AdminDocumentOversight` | Document oversight, reports | AdminDataService + adminDataAggregator (data from sync: users, invoices, quotes). |
| `/admin/subscriptions`, `/AdminSubscriptions` | Subscriptions management | **Direct Supabase:** `supabase.from('subscriptions')`, `supabase.from('users')` (if those tables exist in project). |
| `/admin/platform-settings`, `/PlatformSettings` | System & branding (restricted: founder/super_admin) | **No Supabase:** SystemSettingsService (localStorage). Optional future: store in Supabase table. |
| `/admin/roles-management`, `/AdminRolesManagement` | Admin roles and permissions | Local role list + server `POST /api/admin/roles` for Supabase Auth `app_metadata.role`. |
| `/admin/support-tools`, `/SupportAdminTools` | Support / export tools | AdminDataService, export from sync cache; may call server APIs. |
| `/admin/security-compliance`, `/SecurityCompliance` | Security and compliance info | Docs and role overview; RLS referenced. |
| `/admin/transactions`, `/admin/payouts`, `/admin/fees`, `/admin/billing` | Transactions, Payouts, Fees, Billing | AdminDataService / user services; reporting from sync data. |
| `/admin/plans-management`, `/AdminPlans` | Plans management | PlanManagementService (localStorage). |
| `/admin/document-activity`, `/DocumentActivity` | Document activity | AdminDataService / aggregator. |
| `/admin/logs-audit-trail`, `/LogsAuditTrail` | Audit trail | AuditLogService (localStorage). |
| Others | ExcelDataCapture, UserAccessControl, SubscriptionsManagement, TaskSettings | Various; some use sync data, some local services. |

### 1.2 Server admin API (Supabase)

The **Node server** (`server/src/index.js`) exposes admin endpoints that use **`supabaseAdmin`** (service role key) so they bypass RLS:

| Endpoint | Purpose | Supabase usage |
|----------|---------|----------------|
| `GET /api/admin/users` | List all auth users | `supabaseAdmin.auth.admin.listUsers()` |
| `GET /api/admin/sync-users` | List users + profiles, memberships, orgs | Auth `listUsers()` + `from('profiles')`, `from('memberships')`, `from('organizations')` |
| `GET /api/admin/sync-data` | Full sync for admin UI | Auth `listUsers()` + profiles, memberships, organizations, clients, services, invoices, quotes, payments, storage list |
| `POST /api/admin/roles` | Set user role | `supabaseAdmin.auth.admin.updateUserById(id, { app_metadata: { role } })` |
| `DELETE /api/admin/users/:userId` | Delete user | `supabaseAdmin.auth.admin.deleteUser(userId)` |

**Auth:** Admin endpoints require a valid Supabase JWT with `app_metadata.role === 'admin'` (or `ADMIN_BYPASS_EMAILS` in dev). See `getAdminFromRequest` in `server/src/index.js`.

---

## 2. Supabase setup summary (maintenance)

### 2.1 Environment

- **Frontend (`.env`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required). Optional: `VITE_SERVER_URL`, `VITE_SUPABASE_STORAGE_BUCKET`. Never put the service role key in a `VITE_*` variable.
- **Server (`server/.env`):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for admin/sync). Optional: `SUPABASE_STORAGE_BUCKET`, `ADMIN_BYPASS_EMAILS`, `ADMIN_BOOTSTRAP_TOKEN`.

See **[SUPABASE_SETUP_AND_MAINTENANCE.md](SUPABASE_SETUP_AND_MAINTENANCE.md)** for step-by-step setup and new environments.

### 2.2 Client and auth

- **Single frontend client:** `src/lib/supabaseClient.js` — `createClient(url, anonKey, { auth: { persistSession, autoRefreshToken, detectSessionInUrl } })`.
- **Auth flows:** `src/services/SupabaseAuthService.js` (signIn, signOut, getSession); `src/components/auth/AuthContext.jsx` (login, logout, session state, `onAuthStateChange`). Admin uses the same login; role comes from JWT `app_metadata.role`.

### 2.3 Database and RLS

- **Schema:** `supabase/schema.postgres.sql` — tables: organizations, profiles, memberships, clients, services, quotes, quote_items, invoices, invoice_items, payments, notifications. Trigger for new user → profile + default org + membership.
- **RLS:** Enabled on all app tables and storage. **`public.is_admin()`** returns true when `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`. Policies: "admin full access" (all operations for admins), plus org-scoped or self-only for non-admins. See **[SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)**.

### 2.4 Storage

- **Buckets:** `paidly`, `profile-logos`, `activities`, `bank-details` (created in schema with size/MIME limits).
- **Policies:** User-owned (path first segment = `auth.uid()`), org-scoped (first segment = `org_id` via membership), and **admin access storage buckets** for full access when `is_admin()`. See schema and **[SUPABASE_INTEGRATION_CHECKLIST.md](SUPABASE_INTEGRATION_CHECKLIST.md)** § Storage.

### 2.5 Realtime

- **Publication:** Tables in **`supabase_realtime`**: invoices, quotes, payments, clients, notifications (added in schema).
- **Usage:** Dashboard uses `useSupabaseRealtime` (invoices, payments, expenses) to refetch KPIs; NotificationBell subscribes to `notifications`. See **[SUPABASE_INTEGRATION_CHECKLIST.md](SUPABASE_INTEGRATION_CHECKLIST.md)** § Realtime and **[SUPABASE_REALTIME.md](SUPABASE_REALTIME.md)**.

### 2.6 Sync and admin data flow

- **Sync:** Client calls `syncAdminData()` → `GET /api/admin/sync-data` with Bearer token. Server reads Auth + all app tables (and optionally storage list), returns JSON. Client merges into localStorage (`breakapi_supabase_*`, `breakapi_users`) and broadcasts so AdminDataService and UI use fresh data.
- **Status:** Last sync result is in localStorage key **`breakapi_supabase_sync_meta`** (`status`, `synced_at`, `error`). Use **`getSyncStatus()`** from `AdminSupabaseSyncService` for debugging or UI.

---

## 3. Documentation index (future maintenance)

| Document | Use when |
|----------|----------|
| **[SUPABASE_SETUP_AND_MAINTENANCE.md](SUPABASE_SETUP_AND_MAINTENANCE.md)** | Env setup, new project, schema apply, buckets, realtime, key rotation, new developer checklist. |
| **[SUPABASE_INTEGRATION_CHECKLIST.md](SUPABASE_INTEGRATION_CHECKLIST.md)** | Verify client setup, auth/RLS, database ops, storage, realtime, admin workflows, final steps. |
| **[SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)** | RLS, anon vs service key, no service key in frontend. |
| **[MONITORING_LOGS_AND_SYNC.md](MONITORING_LOGS_AND_SYNC.md)** | Monitor logs, fix sync/permission issues (server `[admin]` logs, client `[sync]`, localStorage meta). |
| **[ADMIN_FEATURES_AND_SUPABASE.md](ADMIN_FEATURES_AND_SUPABASE.md)** (this file) | Admin features list, Supabase usage per feature, setup summary, doc index. |
| **[SUPABASE_DATA_MODEL.md](SUPABASE_DATA_MODEL.md)** | Table ↔ entity mapping, CRUD. |
| **[SUPABASE_STORAGE.md](SUPABASE_STORAGE.md)** | Buckets, policies, path conventions. |
| **[SUPABASE_REALTIME.md](SUPABASE_REALTIME.md)** | Realtime publication, hooks. |
| **[SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md)** | Access control, compliance, audit. |

---

## 4. Common maintenance tasks

- **Add an admin feature that reads Supabase:** Use frontend `supabase` (anon) for tables the admin can read via RLS, or add a server endpoint that uses `supabaseAdmin` and return safe data.
- **Change admin role source:** Today role is JWT `app_metadata.role`. To add more roles (e.g. super_admin), update `is_admin()` in schema and/or `getAdminFromRequest` on the server and document in this file.
- **Sync failing:** Check server logs (`[admin] GET /api/admin/sync-data 500 - ...`) and client console (`[sync] Failed:`). See **[MONITORING_LOGS_AND_SYNC.md](MONITORING_LOGS_AND_SYNC.md)**.
- **Permission denied on a table:** Ensure table exists, RLS policies include admin (or service role is used on server). See **[SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)**.
- **Apply schema changes:** Run the relevant part of `supabase/schema.postgres.sql` in Supabase SQL Editor (or use migrations). See **[SUPABASE_SETUP_AND_MAINTENANCE.md](SUPABASE_SETUP_AND_MAINTENANCE.md)** § 4.

---

_Last updated: 2026-02-19_
