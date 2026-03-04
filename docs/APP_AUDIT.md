# Paidly App – Deep Dive Audit

**Date:** March 2025  
**Scope:** Environment, integrations, data flow, theme consistency, and UX linkage.

---

## 1. Environment & configuration

| Area | Status | Notes |
|------|--------|--------|
| **Vite env** | OK | `envDir: '.'`, only `VITE_*` exposed; `loadEnv` used in vite.config for proxy. |
| **Env files** | OK | `.env.example`, `.env.development.example`, `.env.production.example` document required vars. |
| **Supabase** | OK | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_STORAGE_BUCKET`; anon key only (no service role on frontend). |
| **Backend API** | OK | `VITE_SERVER_URL` (dev default `http://localhost:5179`); proxy `/api` → backend in dev. |
| **Graceful degradation** | OK | `supabaseClient.js` uses fallback URL when not configured; app shows setup message instead of blank screen. |

**Recommendation:** Ensure production `.env.production` (or host env) uses **real** Supabase production URL and anon key. See **Production checklist** below.

---

### Production checklist (no placeholders in deployed env)

| Item | Where to set | Notes |
|------|----------------------|--------|
| **VITE_SUPABASE_URL** | Host env (Vercel, Netlify, etc.) or `.env.production` | Must be your **production** Supabase project URL, e.g. `https://YOUR_REF.supabase.co`. Never deploy with empty or `YOUR_PROJECT_REF` placeholder. |
| **VITE_SUPABASE_ANON_KEY** | Host env or `.env.production` | Must be the **anon (public)** key from that project (Settings → API). Never use service role key on frontend. Never deploy with `your_production_anon_key_here` or similar. |
| **VITE_SERVER_URL** | Host env or `.env.production` | Production backend API URL if you use the separate backend. |
| **VITE_SUPABASE_STORAGE_BUCKET** | Optional | Defaults to `invoicebreek` if unset. |

**File references:**
- **Example (placeholders only):** `.env.production.example` — copy to `.env.production` and replace all placeholders with real values before `npm run build`, or set variables in your host’s dashboard so they are injected at build time.
- **Usage:** `src/lib/supabaseClient.js` reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `src/api/customClient.js` and others use the Supabase client. If URL/key are missing or invalid, auth and data will fail.
- **Docs:** `docs/SUPABASE_SETUP_AND_MAINTENANCE.md` for full Supabase setup and RLS.

**Rule:** Do not commit real keys to git. Use host environment variables for production builds.

---

## 2. Functions & data flow

### 2.1 API layers

- **Entities** (`@/api/entities`): Single entry point; re-exports from `apiClient.js` → `breakApi` (from `customClient.js`). Used app-wide for CRUD (Invoice, Client, User, etc.).
- **customClient**: Uses **Supabase** for auth and entity data (clients, invoices, quotes, payments, banking_details, etc.). No direct use of `VITE_SERVER_URL` for entity CRUD.
- **backendClient**: Axios instance for **backend API** (`/api`): admin sync, health, build logs, etc. In dev uses same origin (Vite proxy); in prod uses `VITE_SERVER_URL`.

So: **Supabase** = main app data + auth; **Backend** = admin/sync/ops. Split is clear and consistent.

### 2.2 Auth

- **AuthContext** uses `User` from entities, `SupabaseAuthService`, and `supabase.auth`. Session restore and `User.me()` are wired; `RequireAuth` redirects to Login when unauthenticated.
- **createPageUrl** / **createAdminPageUrl**: Defined in `@/utils` (index.ts); used consistently for navigation (Layout, ViewInvoice, Login, etc.). Routes in `pages/index.jsx` use PascalCase paths that match `createPageUrl` output.

### 2.3 Routing

- **Router**: React Router; auth routes (Login, Signup, Public*, ClientPortal) and main routes (Dashboard, Clients, Invoices, etc.) defined in `pages/index.jsx`. Admin routes under `/admin/...` via `createAdminPageUrl`.
- **RequireAuth** wraps protected routes; role-based access (e.g. `roles={["admin"]}`) used where needed (e.g. Vendors).

**Verdict:** Environment is intact; functions are linked and integrated as intended. No broken integration points found.

---

## 3. Theme & colour consistency

### 3.1 Design system (defined)

- **docs/DESIGN_TOKENS.md** describes semantic usage: `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `bg-muted`, `border-border`, `bg-primary`, `text-primary-foreground`, status colours (`status-paid`, `status-overdue`, `status-pending`), and auth page class `auth-page-bg`.
- **index.css**: `:root` defines CSS variables (e.g. `--brand-primary`, `--status-paid`, `--background`, `--primary`, sidebar vars). Paidly light theme and optional `.dark` are set up.
- **tailwind.config.js**: Extends with semantic colours (`background`, `foreground`, `card`, `primary`, `border`, `status-paid`, `status-overdue`, `status-pending`, `brand-primary`, etc.) and sidebar theme. Aligned with design tokens.

### 3.2 Inconsistencies

- **Raw palette usage:** DESIGN_TOKENS says to avoid raw classes like `text-slate-600`, `bg-gray-100`, `text-blue-600`, `bg-indigo-600`. A scan shows **many files** (90+ with matches) still use `text-slate-*`, `bg-slate-*`, `text-gray-*`, `bg-gray-*`, and similar. This weakens a single-source-of-truth theme.
- **index.css:** ~~A large commented-out legacy block remained.~~ **Fixed:** Legacy block removed. **Duplicate `@layer base`:** There are **two** `@layer base { ... }` blocks (one for :root/theme vars, one for body/typography/utilities). Merging into one is optional for clarity.
- **Sidebar:** ~~Used hardcoded `#FFFFFF`.~~ **Fixed:** `.sidebar-panel` now uses `var(--bg-card)` so theme stays consistent.

**Recommendation:**  
- Prefer semantic tokens in **new and high-traffic components** (e.g. Dashboard, Invoices, Layout, Login, Settings).  
- Gradually replace raw `slate-*` / `gray-*` with `foreground` / `muted-foreground` / `muted` where it matches intent.  
- Optional: merge the two `@layer base` blocks in `index.css` for clarity.

---

## 4. Summary table

| Category | Status | Action |
|----------|--------|--------|
| Env & config | OK | Production example uses placeholders; see Production checklist above. |
| Supabase integration | OK | No change. |
| Backend API integration | OK | No change. |
| Auth & routing | OK | No change. |
| createPageUrl / navigation | OK | No change. |
| Theme definition (tokens + Tailwind) | OK | No change. |
| Theme application (semantic vs raw) | Partial | Prefer semantic tokens; reduce raw slate/gray/blue. |
| index.css cleanliness | Done | Legacy block removed; optional: merge @layer base. |
| Sidebar theme | Done | Sidebar uses `var(--bg-card)`. |

---

## 5. Files to touch for theme unification (optional)

- **Layout / shell:** `src/pages/Layout.jsx` (nav, sidebar).  
- **Auth:** `src/pages/Login.jsx`, `Signup.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` (use `auth-page-bg`, `text-foreground`, `bg-primary`).  
- **High-traffic:** `Dashboard.jsx`, `Invoices.jsx`, `Clients.jsx`, `Settings.jsx`.  
- **Shared UI:** `src/components/ui/*` (already use semantic variants in many places).  
- **Global CSS:** `src/index.css` (remove commented block; merge @layer base if desired); `src/styles/animations.css` (no theme issues noted).

Overall, the app environment is well set up, functions are correctly linked and integrated, and the theme is **defined** in one place. The main improvement is **applying** the defined theme more consistently and cleaning up global CSS and sidebar tokens.
