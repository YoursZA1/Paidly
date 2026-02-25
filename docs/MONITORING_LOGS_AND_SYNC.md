# Monitoring Logs and Fixing Data Sync / Permission Issues

Use this guide to monitor admin and sync behaviour and to fix common data sync and permission issues.

---

## 1. Where to Look

### Server (Node)

- **Stdout/stderr** of the process running `server/src/index.js` (e.g. `node server/src/index.js` or your process manager).
- **Admin API logs** are written with the `[admin]` prefix:
  - `[admin] METHOD path STATUS - detail`
  - Example success: `[admin] GET /api/admin/sync-data 200 - sync ok: 5 users, 12 invoices`
  - Example error: `[admin] GET /api/admin/sync-data 500 - profiles: permission denied for table profiles`
- **Status codes:** `401` = missing/invalid auth, `403` = not admin, `500` = server/Supabase error (often permissions or missing table).

### Client (browser)

- **Console** (DevTools → Console):
  - **Sync:** `[sync] Success: { matched, updated, added, users, invoices, ... }` or `[sync] Failed: <message>`.
  - **Sync errors:** `[sync] Session error: ...`, `[sync] No Supabase session`, `[sync] Server error: 403 ...`.
- **LocalStorage** (DevTools → Application → Local Storage):
  - **Last sync status:** key `breakapi_supabase_sync_meta`. Value is JSON: `{ status, synced_at, error }`. Use this to see if the last run succeeded or failed and when.
- **Programmatic:** Call `getSyncStatus()` from `@/services/AdminSupabaseSyncService` to read the same meta (e.g. in a debug panel or support tool).

---

## 2. Common Issues and Fixes

### Sync fails with 401

- **Cause:** No valid Supabase session (not logged in or token expired).
- **Fix:** User must log in again. Ensure Supabase client has `autoRefreshToken: true` and that the server accepts the Bearer token (see `server/src/supabaseAuth.js`).

### Sync fails with 403 "Admin access required"

- **Cause:** The authenticated user’s JWT does not have `app_metadata.role === 'admin'`. (This is expected for non-admin users; the "Admin access required" issue—admins incorrectly getting 403—is fully resolved when the admin role is set in Auth and the server uses `getAdminFromRequest` consistently.)
- **Fix:** Set the user’s role to admin via the server (e.g. `POST /api/admin/roles` with an existing admin) or Supabase Dashboard (Auth → Users → user → Set role in app_metadata). If using bypass, add the user’s email to `ADMIN_BYPASS_EMAILS` in server `.env`. After changing role, the user may need to log out and log in again so the JWT includes the new role.

### Sync fails with 500 and "permission denied" or "row-level security"

- **Cause:** Server uses `supabaseAdmin` (service role), which bypasses RLS. This usually means the **service role key** is wrong, or the request is not going through the server (e.g. client calling Supabase directly with anon key and RLS blocking).
- **Fix:** Ensure `SUPABASE_SERVICE_ROLE_KEY` in `server/.env` is correct and that admin sync is done via the server (`GET /api/admin/sync-data`), not directly from the client. If the client calls Supabase directly for admin-only data, RLS will block it; use the server API instead.

### Sync fails with 500 and "relation X does not exist"

- **Cause:** A table (e.g. `profiles`, `memberships`, `organizations`, `clients`, `invoices`, `quotes`, `payments`) has not been created in the project.
- **Fix:** Run `supabase/schema.postgres.sql` (or the relevant migrations) in the Supabase SQL Editor so all required tables exist.

### Sync succeeds but admin UI shows stale or empty data

- **Cause:** Client is reading from localStorage cache that wasn’t updated (e.g. sync failed earlier and wasn’t retried, or a different tab didn’t receive the broadcast).
- **Fix:** Run “Sync” again from the admin UI. Check `breakapi_supabase_sync_meta`: if `status === 'success'` and `synced_at` is recent, the cache should be up to date. If not, fix the error shown in `error` and sync again.

### Role update or delete user returns 403/500

- **Cause:** 403 = requester is not admin. 500 = Supabase Auth error (e.g. invalid user id, or service role key missing).
- **Fix:** Confirm the requester is an admin (JWT `app_metadata.role`). For 500, check server logs for the exact message (e.g. `updateUserById: ...` or `deleteUser: ...`) and fix the Auth configuration or user id.

---

## 3. Quick Checks

1. **Server env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set in `server/.env`.
2. **Client env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set; `VITE_SERVER_URL` points to the running server for sync.
3. **Admin role:** In Supabase Dashboard → Authentication → Users → select user → set `app_metadata.role` to `"admin"` (or use server role API).
4. **Tables and RLS:** All tables used by sync exist; RLS is enabled and policies allow the service role (or anon + admin policy) as intended. See `docs/SUPABASE_SECURITY.md` and `supabase/schema.postgres.sql`.

---

## 4. References

- **Checklist:** `docs/SUPABASE_INTEGRATION_CHECKLIST.md` (sections 1–5 and Final Steps).
- **Security:** `docs/SUPABASE_SECURITY.md`, `docs/SECURITY_AND_COMPLIANCE.md`.
- **Server admin routes and logging:** `server/src/index.js` (`logAdminApi`, admin endpoints).
- **Client sync and status:** `src/services/AdminSupabaseSyncService.js` (`syncAdminData`, `getSyncStatus`).
