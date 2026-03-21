# Security & Compliance

This document describes how the application **enforces access restrictions** and **compliance policies**, and how **Supabase Row Level Security (RLS)** is used for data protection.

---

## 1. Access restrictions

### 1.1 Frontend (UI)

- **Authenticated vs unauthenticated**  
  All app pages except Login, Signup, and public routes (e.g. PublicInvoice, PublicQuote) are wrapped in **`RequireAuth`**. Unauthenticated users are redirected to Login.

- **Role-based access (admin)**  
  Admin-only pages use **`RequireAuth`** with **`roles={["admin"]}`**. If the current user’s role is not `admin`, they see an “Access restricted” message instead of the page.

- **Where roles come from**  
  The user’s role is set in **Supabase Auth** `app_metadata.role` (e.g. `admin` or `user`). It is loaded in the session and exposed by the auth context. RLS and the backend also rely on this for admin checks.

- **Admin routes**  
  All admin UI routes (e.g. `/AdminControl`, `/AdminAccounts`, `/UserManagement`, `/admin/*`, `/SecurityCompliance`, etc.) are defined with `RequireAuth roles={["admin"]}` in the router. No admin page is reachable without an admin role.

### 1.2 Backend (API)

- **Admin API**  
  All `/api/admin/*` endpoints that depend on the current user must verify that the caller is an admin. The server uses **`getAdminFromRequest(req, res)`**, which:
  - Resolves the user from the request (e.g. JWT/session).
  - Checks `app_metadata.role === 'admin'` (or an allowed bypass list in dev).
  - Returns 401 if not authenticated, 403 if not admin.

- **Bootstrap**  
  `/api/admin/bootstrap` is protected by a shared secret (`x-bootstrap-token`), not by user role. It is used to create the first admin user and must be kept secret and disabled or restricted in production.

- **Compliance rule**  
  Any new endpoint that reads or writes sensitive or org-scoped data must either:
  - Use **`getAdminFromRequest`** for admin-only endpoints, or  
  - Use a normal auth check that ensures the user can only access their own or their org’s data (consistent with RLS).

---

## 2. Compliance policies (summary)

- **Data isolation**  
  Users may only access data belonging to organizations they belong to. This is enforced by **Supabase RLS** (see below). The app does not expose other orgs’ data to the client.

- **Admin scope**  
  Only users with role `admin` may access admin UI and admin API endpoints. Admins can manage platform-wide data (e.g. user list, sync) via the backend, which uses the service role key server-side only.

- **Secrets**  
  The **service role key** is never used in the frontend or in any `VITE_*` env variable. Only the **anon key** is used in the browser. See [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md). Full allowlist of env vars and anti-patterns: **[SECRETS_AND_ENV.md](SECRETS_AND_ENV.md)**. Run **`npm run scan-secrets`** in CI or before release.

- **Deployment & monitoring**  
  HTTPS, security headers, structured auth/API security logs, and DB exposure guidance: **[DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md)**.

- **Abuse & bots**  
  Tiered API rate limits, proxied sign-up, and client throttles: **[ABUSE_PROTECTION.md](ABUSE_PROTECTION.md)**.

- **Audit**  
  Sensitive actions (e.g. user updates, role changes, admin actions) should be logged (e.g. via `AuditLogService` or server logs). The Security & Compliance UI and Logs/Audit Trail surfaces audit data for admins.

- **New tables**  
  Any new table that holds user or org data must have **RLS enabled** and policies that restrict access by `auth.uid()` and/or org membership (and admin where appropriate).

---

## 3. Supabase Row Level Security (RLS) for data protection

RLS is the primary mechanism for **data protection** in the database: even if the client or API sends a request for another org’s (or user’s) data, Postgres will not return or modify rows that do not match the policies.

### 3.1 Where RLS is documented

- Full details (tables, policies, storage, admin role) are in **[SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)**.
- Schema and policy definitions live in **`supabase/schema.postgres.sql`**.

### 3.2 Summary

- **Tables with RLS enabled**  
  `organizations`, `profiles`, `memberships`, `clients`, `services`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`. Storage buckets use RLS on `storage.objects`.

- **Org-scoped tables**  
  For `clients`, `services`, `invoices`, `quotes`, `payments` (and their item tables), users can **select** and **write** only rows where they have a membership in the same `org_id`. This enforces “see and edit only my org’s data”.

- **Profiles**  
  Users can read/update only their own profile (`id = auth.uid()`).

- **Admins**  
  A function **`public.is_admin()`** (based on `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`) is used in policies so that admin users have full access to the listed tables and storage where configured.

- **Storage**  
  Policies restrict upload/read/update/delete by path (e.g. user-owned by `auth.uid()`, org-scoped by `org_id`). Admins have full access to the configured buckets.

### 3.3 Applying and verifying RLS

- **Apply**  
  Run **`supabase/schema.postgres.sql`** (e.g. via Supabase SQL Editor or migrations) so that RLS and all policies are in place.

- **Verify**  
  - In Supabase Dashboard: Database → Tables → select a table → check “RLS” is enabled and policies are listed.  
  - As a non-admin user, try to select another org’s row (e.g. via API or SQL); the query should return no rows or deny access.  
  - As an admin, the same query should succeed where policies allow full access.

- **New tables**  
  If you add a new table that stores user/org data, add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and create policies that mirror the pattern (org membership and/or `is_admin()`). Do not leave new app tables without RLS.

---

## 4. Checklist (enforce access and compliance)

Use this list to confirm that access restrictions and RLS are in place:

- [ ] All admin UI routes use `RequireAuth roles={["admin"]}`.
- [ ] All admin API routes that require an admin user call `getAdminFromRequest(req, res)` (or equivalent) and do not proceed if it returns null.
- [ ] Frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no service role key in frontend or in any `VITE_*` variable.
- [ ] RLS is enabled on all application tables that hold user or org data (see [SUPABASE_SECURITY.md](SUPABASE_SECURITY.md)).
- [ ] Storage buckets used by the app have RLS policies on `storage.objects`.
- [ ] Admin role is set in Supabase Auth `app_metadata.role` (e.g. via bootstrap or role update API) so `is_admin()` works correctly.
- [ ] Sensitive admin actions are logged (audit log or server log) for compliance and debugging.

---

_Last updated: 2026-02-19_
