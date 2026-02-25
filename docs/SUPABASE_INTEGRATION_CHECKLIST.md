# Supabase Integration Checklist

Use this checklist to ensure Supabase is correctly integrated for the admin application.

---

## Supabase Configuration (Critical)

- [ ] **Production uses a production Supabase project.**  
  Do **not** use the dev or local Supabase project for production. Create a dedicated production project in the [Supabase Dashboard](https://app.supabase.com) and point production env vars to it. See **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** (Supabase Configuration section).

- [ ] **`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` correctly set in production.**  
  In your deployment host (Vercel, Netlify, etc.), set these to your **production** Supabase project URL and **anon (public)** key. Never use dev project values in production.

- [ ] **Service role key never exposed on frontend.**  
  The frontend must use only the **anon key** (`VITE_SUPABASE_ANON_KEY`). The **service_role** key must never be in any `VITE_*` variable or frontend code; it bypasses RLS and must live only in server env (e.g. `server/.env` or host secrets).

- [ ] **Database structure: all tables finalized.**  
  Core tables (users/profiles, organizations, memberships, clients, services, invoices, invoice_items, quotes, quote_items, payments, banking_details, recurring_invoices, packages, invoice_views, payslips, expenses, tasks, notifications) are defined in **`supabase/schema.postgres.sql`** and applied to the project. See **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** (Database Structure section).

- [ ] **Proper foreign keys + indexes added.**  
  All tables have foreign keys (e.g. `org_id` → `organizations`, `client_id` → `clients`, `invoice_id` → `invoices`) and indexes for `org_id`, key IDs, status, and date columns. Defined in **`supabase/schema.postgres.sql`** (column `references` and `create index idx_*` at end of file).

- [ ] **No unused columns.**  
  Every column in the schema is used by the app or explicitly reserved for a defined purpose. No legacy or placeholder columns left unused.

- [ ] **Naming consistency: snake_case in database.**  
  All database columns and Supabase API payloads use **snake_case** (e.g. `org_id`, `client_id`, `created_at`). Frontend may use camelCase locally; mapping is at the API layer. Do not introduce camelCase column names in the schema.

---

## Row Level Security (RLS) – NON-NEGOTIABLE

- [ ] **RLS enabled on ALL user-related tables.**  
  RLS is **non-negotiable**. Every table that holds user or org data must have Row Level Security **enabled** and the correct policies in place. This includes: `organizations`, `profiles`, `memberships`, `clients`, `services`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `banking_details`, `recurring_invoices`, `packages`, `invoice_views`, `payslips`, `expenses`, `tasks`, `notifications`, and storage objects. Verify with `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` — all must show `rowsecurity = true`. See **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** (Row Level Security section).

- [ ] **Policies restrict users to only their own data.**  
  RLS policies must ensure non-admin users can only read and write **their own** data: org-scoped tables (e.g. clients, invoices) restrict by `org_id` via membership; user-scoped tables (e.g. profiles, notifications) restrict by `user_id` or `id = auth.uid()`. Admins get full access only via `public.is_admin()`. There must be no way for a normal user to access another org’s or another user’s rows. See **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** (Row Level Security section).

- [ ] **Admin-only policies clearly separated.**  
  Admin access must be implemented as **separate** RLS policies (e.g. named `"admin full access <table>"`) that use **`public.is_admin()`** only. Do not mix admin logic into org-member or user-scoped policies; keep admin bypass in its own policy per table so it is auditable and reviewable. See **`supabase/schema.postgres.sql`** (admin full access policies) and **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** (Row Level Security section).

---

## 1. Supabase Client Setup

- [x] **Initialize Supabase client with project URL and anon/public key.**
  - The frontend client is created in **`src/lib/supabaseClient.js`** using `@supabase/supabase-js` `createClient(url, anonKey, options)`.
  - It uses **project URL** and **anon (public) key** only. The **service role key is never used on the frontend** and must not appear in any `VITE_*` env or client bundle.

- [x] **Store credentials securely using environment variables.**
  - **Required variables** (no defaults):
    - `VITE_SUPABASE_URL` – Supabase project URL (Dashboard → Settings → API → Project URL).
    - `VITE_SUPABASE_ANON_KEY` – Anonymous/public key (Dashboard → Settings → API → Project API keys → `anon` public).
  - **Optional:** `VITE_SUPABASE_STORAGE_BUCKET` – Storage bucket name (default: `invoicebreek`).
  - **Where to set:** Copy `.env.example` to `.env` in the project root and fill in the values. Never commit `.env` (it is in `.gitignore`).
  - **Production:** Use your host’s environment config or a secrets manager; do not hardcode credentials.
  - The client throws on load if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, so misconfiguration fails fast.

**Reference:** `.env.example`, `src/lib/supabaseClient.js`, `docs/SUPABASE_SETUP_AND_MAINTENANCE.md`, `docs/SUPABASE_SECURITY.md`.

---

## 2. Authentication & Authorization

- [x] **Use Supabase Auth for admin login and session management.**
  - **Login:** Admin and regular users sign in via **Supabase Auth** (email/password) in **`src/services/SupabaseAuthService.js`** (`signInWithEmail` → `supabase.auth.signInWithPassword`). The same flow is used for admin login; no separate admin-only auth path.
  - **Session:** The Supabase client in **`src/lib/supabaseClient.js`** is configured with `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. **`src/components/auth/AuthContext.jsx`** uses `SupabaseAuthService.getSession()` on load and `supabase.auth.onAuthStateChange()` to keep session and user in sync (sign in, sign out, token refresh). Session is stored by Supabase (e.g. localStorage) and restored across reloads.
  - **Admin role:** Admin identity is determined by Supabase Auth JWT `app_metadata.role` (e.g. `admin`). The server (e.g. **`server/src/index.js`**) can set this via Supabase Admin API when assigning admin roles. The frontend uses this role for UI (e.g. admin routes) and it is used by RLS for database access.

- [x] **Apply RLS policies to restrict access to admin-only data.**
  - **RLS is enabled** on all application tables in **`supabase/schema.postgres.sql`**: `organizations`, `profiles`, `memberships`, `clients`, `services`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `payslips`, `expenses`, `tasks` (and `banking_details`, `recurring_invoices`, `invoice_views`, etc.). Storage buckets use RLS as well.
  - **Admin bypass:** The function **`public.is_admin()`** returns true when `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`. Policies named **"admin full access ..."** grant full SELECT/INSERT/UPDATE/DELETE on each table when `public.is_admin()` is true, so admins can read and modify all rows regardless of `org_id`.
  - **Non-admin access:** Other users are restricted by org membership (e.g. "org members select/write" policies that check `memberships` and `org_id`) or by own-row access (e.g. profiles: `id = auth.uid()`). So admin-only data (cross-org or sensitive tables) is only accessible when the JWT has the admin role; RLS enforces this at the database layer.

- [ ] **Authentication & Access Control: email verification working.**  
  Confirm that Supabase Auth email confirmation works: enable **Email confirmations** in Supabase Dashboard → Authentication → Providers → Email if required; test sign-up and the “Email not verified” flow in **`src/components/auth/AuthContext.jsx`** (`showVerifyDialog`). Ensure confirmation links use the correct site URL (Authentication → URL Configuration).

- [ ] **Authentication & Access Control: password reset flow tested.**  
  Confirm the password reset flow end-to-end: user requests reset (e.g. via **`sendPasswordReset`** in AuthContext → Supabase `resetPasswordForEmail`), receives email, opens link, and can set a new password on **`/ResetPassword`** (**`src/pages/ResetPassword.jsx`**). Ensure Supabase Email templates and redirect URLs (Authentication → URL Configuration) are correct for your environment.

- [ ] **Authentication & Access Control: session persistence working.**  
  Confirm that the session persists across page reloads and tab switches: the Supabase client uses **`persistSession: true`** (**`src/lib/supabaseClient.js`**), and **`AuthContext`** restores the session on load via **`SupabaseAuthService.getSession()`** and listens to auth state changes. After sign-in, refresh the page or close and reopen the app; the user should remain logged in until they sign out or the token expires.

- [ ] **Authentication & Access Control: logout clears session properly.**  
  Confirm that logout fully clears the session: **`AuthContext`** calls **`SupabaseAuthService.signOut()`** (Supabase `auth.signOut()`), then **`User.logout()`** and clears session state. After logout, the user should see the login screen, protected routes should be inaccessible, and a page reload should not restore a session.

- [ ] **Authentication & Access Control: admin role separated from normal users.**  
  Confirm that admin is determined solely by JWT **`app_metadata.role === 'admin'`**, with **`public.is_admin()`** used in separate RLS policies; normal users are restricted by org/own-row policies. Admin routes use **`RequireAuth roles={["admin"]}`** and the server admin API validates the admin role (e.g. **`getAdminFromRequest`**). Verify that a non-admin user cannot reach admin UI or admin API, and that only users with the admin role get cross-org/full access.

- [ ] **"Admin access required" issue fully resolved.**  
  Confirm that users with **`app_metadata.role === 'admin'`** can access admin UI and admin API (sync, roles, delete user, etc.) without receiving 403 or "Admin access required." That response should only appear for non-admin users. If an admin still sees it, ensure their role is set in Supabase Auth and that they have a valid session (see **`docs/MONITORING_LOGS_AND_SYNC.md`** § Sync fails with 403).

**Reference:** `src/services/SupabaseAuthService.js`, `src/components/auth/AuthContext.jsx`, `src/lib/supabaseClient.js`, `supabase/schema.postgres.sql`, `docs/SUPABASE_SECURITY.md`, `docs/SECURITY_AND_COMPLIANCE.md`.

---

## UI & UX Readiness

- [ ] **Loading states everywhere (no blank screens).**  
  Data-dependent pages show loading indicators (e.g. **`isLoading`** + **`Skeleton`** or spinners) until data is ready, so users never see a blank content area. Examples: **Calendar** (`Calendar.jsx`), **CashFlow** (`CashFlow.jsx`), **Payslips** (`Payslips.jsx`), **Invoices** (`Invoices.jsx` with `InvoiceList`/`InvoiceGrid` `isLoading`), **Quotes**, **Services**, **Clients**, **SubscriptionSettings**, **Dashboard**, and admin list pages. Verify each main view shows a loading state (skeleton or spinner) while fetching, then content; add **`Skeleton`** (from **`@/components/ui/skeleton`**) or equivalent where missing.

- [ ] **Proper error handling (not console errors only).**  
  User-facing errors (e.g. load failures, save failures, API errors) must be shown in the UI—e.g. **toast** (**`useToast`** from **`@/components/ui/use-toast`** with `variant: 'destructive'`), inline error message, or alert—not only logged with `console.error`. The app already uses toasts in **Calendar**, **CashFlow**, and other pages for load/export/import errors. Verify that every catch block for user-triggered or data-fetch flows surfaces a clear message to the user; reserve `console.error` for debugging only, and add toasts or inline errors where errors are currently silent.

- [ ] **Empty states designed (no data yet screens).**  
  When a list or section has no data (e.g. no clients, no invoices, no payment methods), the UI shows a designed empty state—clear copy (e.g. “No clients yet”, “No invoices yet”), optional short description, and a primary action (e.g. “Add client”, “Create invoice”)—rather than a blank table or only “0 results”. Examples in the app: **Clients** (“No clients yet” / “No clients found”), **ClientPortal** (“No invoices yet”, “No quotes yet”), **Settings** (“No payment methods yet”), **Dashboard** (“No transactions yet”, “No invoices yet”), **InvoiceDetails** (“No items added yet”), **ClientDetail** (“No invoices yet for this client”). Verify every list/dashboard section has an empty state with message and CTA where appropriate; add or refine where missing.

- [ ] **Mobile responsive tested.**  
  Layout and key flows work on small viewports (e.g. 375px width, typical phone). The app uses **Tailwind** responsive utilities (`sm:`, `md:`, `lg:`, `grid-cols-1` / `sm:grid-cols-2`, `hidden sm:inline`, etc.) in **Calendar**, **CashFlow**, **Layout**, and elsewhere. Test in DevTools device emulation or on real devices: navigation (sidebar/drawer), lists, forms, tables (horizontal scroll or card layout on small screens), and primary actions (create invoice, add client, login). Fix overflow, tap targets, and readability; document any known mobile limitations.

- [ ] **All buttons clickable and functioning.**  
  Every button and link has a working handler (e.g. `onClick`, `to`, form submit); none are disabled without reason or left as placeholders. Verify primary flows: Save/Cancel, Create/Add, Edit/Delete, Sync, Export/Import, navigation, and dialogs. Fix or remove any non-functional controls; ensure disabled state is used only when appropriate (e.g. loading, validation) and is clearly indicated.

- [ ] **No “undefined” or broken UI strings.**  
  User-visible text never shows the literal “undefined”, “null”, “[object Object]”, or empty labels when data is missing. Use safe display patterns: optional chaining (`?.`), fallbacks (`name ?? '—'`, `user?.email || 'No email'`), and conditional rendering. Audit headers, table cells, badges, tooltips, and empty states; fix any place that renders raw variable values without null/undefined checks.

- [ ] **Dashboard layout clean and focused.**  
  The main **Dashboard** (**`src/pages/Dashboard.jsx`**) has a clear, uncluttered layout: key metrics and actions are easy to find, sections are visually grouped (e.g. cards, grids), and admin vs. regular-user content is appropriately scoped. Verify hierarchy (headings, spacing), consistent card/chart styling, and that the first screen supports the user's primary goals (overview, quick links, recent activity). Remove or collapse secondary content that distracts; keep the dashboard focused.

---

## 3. Database Operations

- [x] **Link all admin actions (user management, invoice updates, reporting) to Supabase database functions.**
  - **User management:** Admin list/update/delete users via the **server API** (Supabase Auth + tables). The frontend calls **`src/api/userManagement.js`** (`fetchSupabaseUsers`, `updateUserRole`, `deleteUser`), which hit **`server/src/index.js`** endpoints. Those use **`supabaseAdmin`** (service role) to talk to Supabase:
    - **List users:** `GET /api/admin/users` → `supabaseAdmin.auth.admin.listUsers()`
    - **Sync users (with profiles/orgs):** `GET /api/admin/sync-users` → `listUsers()` + `supabaseAdmin.from("profiles").select(...)` + `from("memberships")` + `from("organizations")`
    - **Update role:** `POST /api/admin/roles` → `supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { role } })`
    - **Delete user:** `DELETE /api/admin/users/:userId` → `supabaseAdmin.auth.admin.deleteUser(userId)`
  - **Invoice / quote updates:** Admin (and regular users) create/update/delete invoices and quotes through the **EntityManager** in **`src/api/customClient.js`** (e.g. `Invoice.update()`, `Quote.update()`), which performs **`supabase.from("invoices")`** / **`supabase.from("quotes")`** (and **`invoice_items`** / **`quote_items`**) with the anon client. RLS allows admins to see all rows. Admin list views (e.g. **`src/pages/AdminInvoicesQuotes.jsx`**) read directly from Supabase: **`supabase.from("invoices").select("*")`** and **`supabase.from("quotes").select("*")`**.
  - **Reporting:** Admin reporting (e.g. **`src/utils/adminDataAggregator.js`**, **AdminDataService**) uses data that comes from **Supabase** via the sync endpoint **`GET /api/admin/sync-data`**, which reads from **`auth.users`**, **profiles**, **memberships**, **organizations**, **clients**, **services**, **invoices**, **quotes**, **payments**. The sync result is stored in localStorage (e.g. `breakapi_supabase_*` keys) and **AdminDataService** prefers this Supabase-sourced data when present. So reporting is backed by Supabase once sync has run.

- [x] **Ensure CRUD operations are correctly mapped to Supabase tables.**
  - **Entity → Supabase table mapping** (used by **EntityManager** in **`src/api/customClient.js`** and by admin/sync):

  | Entity   | Supabase table(s)     | Create | Read | Update | Delete |
  |----------|------------------------|--------|------|--------|--------|
  | Client   | `clients`              | insert | select (org_id / RLS) | update | delete |
  | Service  | `services`             | insert | select | update | delete |
  | Invoice  | `invoices`, `invoice_items` | insert (+ items) | select | update (+ items replace) | delete |
  | Quote    | `quotes`, `quote_items` | insert (+ items) | select | update (+ items replace) | delete |
  | Payment  | `payments`             | insert | select | update | delete |
  | Payroll  | `payslips`             | insert (org_id, created_by_id) | select (org_id) | update | delete |
  | Expense  | `expenses`             | insert (org_id, created_by_id) | select (org_id) | update | delete |
  | Task     | `tasks`                | insert (org_id, created_by_id) | select (org_id) | update | delete |
  | Profile  | `profiles`             | upsert (on signup/update) | select by id | upsert | — |
  | User (auth) | `auth.users` (via Admin API) | createUser | listUsers | updateUserById (e.g. role) | deleteUser |

  - **Admin-specific reads:** Sync and admin list pages use **`supabaseAdmin`** or frontend **`supabase`** to read from the tables above (and **organizations**, **memberships**). RLS ensures only admins can read across all orgs when using the anon key; the server uses the service role for sync/list/update/delete user.

**Reference:** `server/src/index.js`, `src/api/customClient.js`, `src/api/userManagement.js`, `src/services/AdminSupabaseSyncService.js`, `src/services/AdminDataService.js`, `src/pages/AdminInvoicesQuotes.jsx`, `supabase/schema.postgres.sql`.

---

## 4. Storage Integration

- [x] **Use Supabase Storage for file uploads (e.g., logos, reports).**
  - **Logos:** Profile/company logos are uploaded via **`src/services/SupabaseStorageService.js`** (`uploadProfileLogo`). Files go to the **`profile-logos`** bucket (or fallback **`invoicebreek`**), path **`{userId}/logo.{ext}`**. Used in **Settings** and **SetupWizard** (onboarding). **`LogoImage`** displays logos and refreshes expired signed URLs.
  - **Other uploads:** **`src/api/customClient.js`** **IntegrationManager** uses **Supabase Storage** for:
    - **Branding/assets:** default bucket (e.g. **invoicebreek**), folder `org_id/branding`
    - **Activities:** bucket **`activities`** (receipts, attachments), path `org_id/activities/...`
    - **Bank details:** bucket **`bank-details`** (statements, imports), path `org_id/bank-details/...`
  - **Reports:** Report *exports* (e.g. CSV from **Reports.jsx**) are generated and downloaded in the browser; they are not uploaded to Storage. Any future “save report to Storage” feature would use the same buckets and policies below.

- [x] **Set appropriate bucket policies for admin access.**
  - Buckets and policies are defined in **`supabase/schema.postgres.sql`**:
    - **Buckets:** **`invoicebreek`**, **`profile-logos`**, **`activities`**, **`bank-details`** (with file size and MIME limits).
    - **User-owned objects (logos):** Insert/select/update/delete on **`invoicebreek`** and **`profile-logos`** when path first segment equals **`auth.uid()::text`**.
    - **Org-scoped objects:** Full access when path first segment equals the user’s **`org_id`** (via **memberships**) for all four buckets.
    - **Admin access:** Policy **"admin access storage buckets"** on **`storage.objects`** grants **full access (all operations)** for **authenticated** users where **`public.is_admin()`** is true and **`bucket_id`** is one of **`invoicebreek`**, **`profile-logos`**, **`activities`**, **`bank-details`**. Admins can read, upload, update, and delete any object in these buckets for support and oversight.

**Reference:** `supabase/schema.postgres.sql`, `src/services/SupabaseStorageService.js`, `src/api/customClient.js`, `src/components/shared/LogoImage.jsx`, `docs/SUPABASE_SECURITY.md`.

---

## 5. Realtime Updates

- [x] **Enable Supabase Realtime for live dashboard updates and notifications.**
  - **Realtime mechanism:** The app uses **Supabase Realtime** **postgres_changes** (broadcast when rows in published tables change). Subscriptions use **`supabase.channel(...).on("postgres_changes", { schema, table }, callback).subscribe()`**. RLS applies: clients only receive events for rows they can select.
  - **Live dashboard:** **`src/pages/Dashboard.jsx`** uses the **`useSupabaseRealtime`** hook (**`src/hooks/useSupabaseRealtime.js`**) to subscribe to **`invoices`**, **`payments`**, and **`expenses`**. On any INSERT/UPDATE/DELETE, the dashboard refetches KPIs (`loadUserData` or `loadAdminData`), so revenue, overdue counts, and related metrics update without a full page reload. Tables must be in the **`supabase_realtime`** publication (see schema).
  - **Live notifications:** **`src/components/notifications/NotificationBell.jsx`** subscribes to the **`notifications`** table via a dedicated channel (**"notifications-changes"**). When a row is inserted or updated (e.g. new notification or read state), the component refetches the list and unread count, so the bell badge and list stay in sync. The **`public.notifications`** table exists in the schema with RLS (users see only their own rows; admins have full access) and is added to **`supabase_realtime`** so postgres_changes are broadcast.
  - **Other pages:** **Invoices** and **Quotes** pages can use **useSupabaseRealtime** for their tables so list views update when data changes elsewhere (e.g. status updates).

- **Publication:** In **`supabase/schema.postgres.sql`**, the following tables are added to **`supabase_realtime`** so that Realtime broadcasts changes: **invoices**, **quotes**, **payments**, **clients**, **notifications**. Any new table that should drive live UI must be added to this publication (and have RLS as needed).

**Reference:** `src/hooks/useSupabaseRealtime.js`, `src/pages/Dashboard.jsx`, `src/components/notifications/NotificationBell.jsx`, `supabase/schema.postgres.sql`, [Supabase Realtime docs](https://supabase.com/docs/guides/realtime).

---

## Final Steps: Admin Workflows Review

Review all admin workflows to ensure seamless Supabase integration. Use the table below to verify each area and run a quick test after deployment.

| Admin workflow | Supabase integration | Notes |
|----------------|----------------------|--------|
| **Login & session** | Supabase Auth (`signInWithPassword`, `getSession`, `onAuthStateChange`). Admin role from JWT `app_metadata.role`. | Same flow as regular users; RLS enforces admin access to data. |
| **User / account management** | **Sync:** `syncAdminData()` → `GET /api/admin/sync-data` (server uses `supabaseAdmin` to read auth, profiles, memberships, orgs, clients, services, invoices, quotes, payments). **Role update:** `POST /api/admin/roles` → `updateUserById(..., app_metadata.role)`. **Delete:** `DELETE /api/admin/users/:id` → `deleteUser`. **UI:** AdminAccounts, AdminDocumentOversight, UserManagement, AdminUsers use **AdminDataService** (data from sync) or **UserManagementService**; run **Sync** so lists reflect Supabase. | Run “Sync” on Admin Accounts or after bulk changes so AdminDataService has latest Supabase data. |
| **Invoices & quotes (admin list/edit)** | **AdminInvoicesQuotes:** direct `supabase.from('invoices').select('*')` and `supabase.from('quotes').select('*')`. Edit/update via **EntityManager** (`Invoice.update` / `Quote.update`) → `supabase.from('invoices'|'quotes').update(...)`. | RLS gives admins full access; no sync needed for this page. |
| **Reporting & dashboard** | **Dashboard (admin):** `loadAdminData()` uses AdminDataService (Supabase-sourced after sync). **Realtime:** `useSupabaseRealtime` on invoices, payments (and expenses if table exists) refetches KPIs on change. **Reports/aggregates:** adminDataAggregator and AdminDataService read from sync cache (Supabase). | Sync before viewing reports so metrics match Supabase. |
| **Platform settings** | **PlatformSettings** (System & branding tabs) use **SystemSettingsService** (localStorage). Not persisted in Supabase by design. | For cross-device or server-backed platform config, add a Supabase table and API later. |
| **Storage (logos, files)** | Logos: **SupabaseStorageService.uploadProfileLogo** → `profile-logos` (or `invoicebreek`). Other uploads: **IntegrationManager** → `invoicebreek`, `activities`, `bank-details`. RLS: user/org policies + **admin access storage buckets** for admins. | Buckets and policies in `supabase/schema.postgres.sql`. |
| **Notifications** | **NotificationBell** subscribes to `notifications` via Realtime; table `public.notifications` in schema and in `supabase_realtime` publication. | Insert/update rows in `notifications` (e.g. from server or Edge Function) to drive live bell updates. |
| **Subscriptions / billing (AdminSubscriptions)** | Page uses `supabase.from('subscriptions')` and `supabase.from('users')`. | Ensure `public.subscriptions` and `public.users` (if used) exist in your project and have RLS; add to schema if missing. |

### Verification checklist

- [ ] **Auth:** Log in as admin (JWT `app_metadata.role = 'admin'`); confirm session persists and admin routes are accessible.
- [ ] **Sync:** On Admin Accounts (or equivalent), run “Sync”; confirm users, orgs, invoices, etc. load from Supabase and no console errors.
- [ ] **User management:** Update a user role via UI → confirm `POST /api/admin/roles` succeeds and next sync shows updated role; delete user (if implemented) → confirm `DELETE /api/admin/users/:id` and Supabase Auth reflect it.
- [ ] **Invoices/quotes:** Open Admin Invoices/Quotes; confirm list loads from Supabase; edit an invoice/quote and save → confirm change in DB (and Realtime if subscribed).
- [ ] **Dashboard:** As admin, confirm KPIs load; trigger a change (e.g. new payment) and confirm dashboard refetches (Realtime) or after manual refresh.
- [ ] **Storage:** Upload a logo (Settings or onboarding); confirm file in `profile-logos` (or fallback bucket) and URL displays; as admin, confirm access to buckets per RLS.
- [ ] **Notifications:** If using NotificationBell, insert a row into `notifications`; confirm bell count/list update without refresh.
- [ ] **Platform settings:** Change system or branding settings; confirm save/load from localStorage and no Supabase errors (optional: add backend persistence later).

### Optional improvements

- **Platform settings persistence:** Store system/branding settings in a Supabase table (e.g. `platform_settings`) and add an API so all admins see the same config.
- **Expenses table:** If dashboard or reports use “expenses”, add `public.expenses` (and RLS) and add it to `supabase_realtime` for live updates.
- **Subscriptions/billing schema:** If **AdminSubscriptions** is in use, add `public.subscriptions` (and any `public.users` if different from `auth.users`) to `supabase/schema.postgres.sql` with RLS and document in this checklist.

**Monitor logs and fix issues:** See **`docs/MONITORING_LOGS_AND_SYNC.md`** for where to look (server `[admin]` logs, client `[sync]` console, localStorage `breakapi_supabase_sync_meta`), common data-sync and permission errors, and quick checks.

**Reference:** Sections 1–5 above, `server/src/index.js`, `src/services/AdminSupabaseSyncService.js`, `src/services/AdminDataService.js`, `src/pages/AdminInvoicesQuotes.jsx`, `src/pages/AdminAccounts.jsx`, `docs/SUPABASE_SECURITY.md`, `docs/MONITORING_LOGS_AND_SYNC.md`.
