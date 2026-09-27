# Paidly Launch QA Report

## Audit Date

2026-09-26, re-verified 2026-09-27. Branch `fix/admin-escalation-billing-payroll-hr`, base commit `17844a9`; fixes in `790530f` and `6cc6aa1`, deployed to production.

## Overall Status

**PASS WITH CONDITIONS.**

The audit found two production blockers live on https://www.paidly.co.za. Both are fixed, deployed and re-verified on production (2026-09-27).

The conditions are the open P1 (QA-04) and the manual checks at the end of this report. Signed-in flows were not browser-tested.

---

## Executive Summary

**What was audited**
- Repo structure, routes, the 12 Vercel functions and their rewrites.
- Supabase migrations (RLS coverage), env-var boundaries and the client bundle.
- Payment and entitlement gating.
- Live production health, read-only: HTTP probes plus `vercel logs`.
- Real rendered UI on a production build (`vite preview`) at 320, 375 and 1016 px.
- Full unit suite, lint, type-check and production build.

**Blockers found**
- The **POS API** crashes on every request in production.
- The **public-share function** (customer invoice, quote, payslip and leave-approval links, OG images, email tracking) also crashes on every request.

Both come from module-load errors that Vite-based unit tests cannot see. Fixed, with a regression test that loads every function in plain Node.

**Also fixed**
- A customer-visible "Testing" tab that generated real invoices.
- `/HowTo` bouncing guests to the login page.
- One shared title and canonical tag for every route, with no `noindex` on private pages.
- Developer setup text shown in customer error messages.
- Mobile horizontal overflow on landing and sign-up.

**Remains**
- Production functions read gitignored local `.env` files from the deploy bundle, and PayFast's handler lets them override Vercel's values.
- Signed-in flows were not exercised in a browser: no test account, and this audit does not create accounts on production.

---

# Critical Findings

| ID | Severity | Area | Finding | Evidence | Status |
| -- | -------- | ---- | ------- | -------- | ------ |
| QA-01 | P0 | POS | `/api/pos/*` fails on every request: `SyntaxError: Duplicate export of 'salePublicView'`, introduced in `17844a9` | `vercel logs`: `/api/pos/registers`, `/sales`, `/catalog`, `/floor`, `/health` all `FUNCTION_INVOCATION_FAILED`; `node -e "import('./server/src/pos/posNativeCheckout.js')"` → same error | **Fixed and live**: `/api/pos/*` returns JSON (404 on unknown route) |
| QA-02 | P0 | Invoices / Quotes / Payslips / Leave | `api/public-share.js` fails on every request: `SyntaxError: Unexpected token '<'` (JSX in `server/src/vercelOgImage.js`, loaded as native ESM). Customer invoice, quote, payslip and leave-approval links, `/api/og` and `/api/email-track` are all down | `vercel logs` for `/api/public-invoice`, `/public-quote`, `/public-payslip`, `/og`, `/email-track`; curl → 500 | **Fixed and live**: `/api/public-invoice`, `-quote`, `-payslip` → 400 JSON `Invalid token`; `/api/og` → PNG; `/api/email-track` → GIF |
| QA-03 | P1 | Recurring invoices | Customer-facing **Testing** tab: "Run tests" calls `generateInvoiceFromRecurring` and `checkAndGenerateDueInvoices` against the customer's live templates, so it **creates real invoices** | `src/services/RecurringInvoiceAutoGenerationTester.js:133,196` | Fixed (dev builds only; 0 tester strings in `dist/`) |
| QA-04 | P1 | Deployment / secrets | Deploys are CLI uploads from the local folder, so gitignored `server/.env` and `.env.development` ship in function bundles. Production loads them: `injecting env (6) from server/.env`. The 6 `TURNSTILE_*` vars exist **only** there, not in Vercel env. `api/payfast-handler.js:32` loads `server/.env` with `override: true`, so a local file overrides Vercel's production values in the PayFast ITN handler | `vercel logs`; `vercel env ls production` (names only); `.vercelignore` has no `.env` rule | **Open**: manual (see Recommended Next Steps) |
| QA-05 | P1 | Test coverage | 2,058 unit tests passed while two production functions could not load. Vitest runs code through Vite, which accepts JSX in `.js` and duplicate exports | Mutation check: reverting the fixes fails the new test on exactly those two functions | Fixed: `tests/unit/apiFunctionsNativeLoad.test.js` |
| QA-06 | P2 | SEO / public pages | `/HowTo` (in sitemap, allowed by robots.txt) redirected signed-out visitors and crawlers to `/login` | Browser on production: `/HowTo` → `/login` | **Fixed and live**: production `/HowTo` renders for guests |
| QA-07 | P2 | SEO | Every route used the home page title and canonical (`/HowTo` canonicalised to `/`). No `noindex` on private app pages. No Open Graph or Twitter tags on the landing page | `index.html`; no per-route title code | Fixed |

# Fixed During Audit

| ID | Area | Problem | Fix | Verification |
| -- | ---- | ------- | --- | ------------ |
| QA-01 | POS API | Duplicate export crashes module load | Removed redundant `export { salePublicView }` (`server/src/pos/posNativeCheckout.js`) | All 12 functions import in plain Node; new test passes, and fails when reverted |
| QA-02 | Public share | JSX in a `.js` file loaded as native ESM | Rewrote the OG handler with `React.createElement`, same output (`server/src/vercelOgImage.js`) | Handler renders a 1200×630 PNG (21.7 KB) locally; `api/public-share.js` loads |
| QA-03 | Recurring invoices | Test harness creating real invoices in production UI | Testing tab and panel render only when `import.meta.env.DEV` (`src/pages/RecurringInvoices.jsx`) | Production `dist/` has 0 occurrences of tester strings |
| QA-05 | Tests | No native-load coverage for Vercel functions | New test: each `api/**` entry point imported in a child `node` process; also asserts ≤ 12 functions | 13 tests pass; mutation reverted → 2 fail |
| QA-06 | Routing | `/HowTo` required a session | Added `/how-?to` to session-optional paths (`src/utils/sessionGuard.js`) and to the public layout bypass (`src/pages/index.jsx`) | Live on production: `/HowTo` renders for guests, `robots: index, follow`, canonical `/HowTo`; unit test added |
| QA-07 | SEO | One title and canonical for all routes; no noindex; no OG | New `src/lib/routeDocumentMeta.js`: per-route title, description, robots and canonical. Public pages indexable with a self canonical; all others `noindex, nofollow` with no canonical. OG and Twitter tags in `index.html`. Sitemap now lists `/privacy-policy` and `/terms` | Live on production: `/Invoices` → noindex, no canonical; `og:image` present; 3 unit tests |
| QA-09 | Error UX | Customer error text said "Start the API with `npm run server`… set SUPABASE_SERVICE_ROLE_KEY" | Developer hint kept for dev builds; production says what happened and what to do next (`src/services/CompanyTeamService.js`, `src/contexts/AuthContext.impl.jsx`) | Lint clean; suite green |
| QA-10 | Mobile | 8 px horizontal scroll on landing and sign-up at ≤ 375 px: slide-in list items start at `translateX(24px)` | `overflow-x-clip` on the landing root (`src/pages/Home.jsx`); sticky header unaffected | Browser at 320 px: `scrollWidth == clientWidth` on `/`, `/Signup`, `/auth/verified`; header still `position: sticky` |

# Remaining Issues

| ID | Severity | Area | Issue | Recommended Action |
| -- | -------- | ---- | ----- | ------------------ |
| QA-04 | P1 | Secrets / config | Local env files ship in the bundle; Turnstile config lives only there; PayFast handler uses `override: true` | 1) Add the 6 `TURNSTILE_*` vars to Vercel Production (Sensitive). 2) Add `.env*` and `server/.env*` to `.vercelignore`. 3) Remove `override: true` in `api/payfast-handler.js`: every other function already runs on Vercel's values. Flagged, not changed: payment path. 4) Redeploy and confirm logs no longer show `injecting env … from server/.env` |
| QA-08 | P3 | 404 | Signed-out visitors on an unknown URL are redirected to `/login` (soft 404) instead of the branded 404. Signed-in users do get the 404 page | Treat unknown paths as session-optional in `isPathAllowedWithoutSession` (the router already falls through to `NotFoundPage`) |
| QA-11 | P3 | Secrets | `PAYFAST_PASSPHRASE` and `PAYFAST_LIVE_MERCHANT_KEY` are stored as plain **Config**, not Sensitive, in Vercel | Re-add as Sensitive |
| QA-12 | P3 | Performance | `vendor` chunk is 3.58 MB minified; main `index` is 720 KB; `pdf` is 858 KB (lazy) | Split `vendor` (manualChunks) and check what pulls large libraries into the entry |
| QA-13 | P4 | Hygiene | Unguarded `console.log` in production code: `SystemSettingsService` (7), reminder services (invoice and quote numbers), logo and private-upload file names | Wrap in `import.meta.env.DEV` |
| QA-14 | P4 | Hygiene | Demo pages `/BentoDemo` and `/AnimatedIconsDemo` are reachable by any signed-in user | Remove the routes or make them dev-only |
| QA-15 | P4 | Routing | `/PrivacyPolicy`, `/privacy-policy`, `/TermsAndConditions` and `/terms-and-conditions` are defined twice (public and `RequireAuth`). The protected copies are unreachable | Delete the `MAIN_ROUTES` duplicates |
| QA-16 | P4 | Lint | 335 warnings (mostly unused vars), 0 errors | Gradual cleanup |
| QA-17 | P4 | DB | `api_rate_limit_buckets` has no RLS. All privileges are revoked from anon and authenticated, so it's not exposed | Enable RLS for defence in depth |
| QA-18 | P4 | Runtime | `DEP0169 url.parse()` deprecation warning in a production function | Replace with `new URL()` |

---

# Feature Verification

| Feature | Result | Evidence |
| -------------- | ----------------- | -------- |
| Authentication | PARTIAL | Guest pages browser-verified (sign-in, sign-up, verify-link error at 320 px). Unverified-email gating and welcome email covered by unit tests; `/api/auth/welcome` live. Real sign-in not exercised (no test account) |
| Authorization | PARTIAL | Code review: payment intents and POS registers verify `company_id`/`client_id` against the caller's org; workforce ignores `body.org_id`. RLS enabled on 78 of 85 created tables; the other 7 are covered (restaurant tables via a loop; rate-limit table revoked). No live cross-tenant test |
| Dashboard | PARTIAL | Production logs show `/api/dashboard/bootstrap` serving; not browser-verified signed in |
| Customers | PARTIAL | Unit tests only |
| Quotes | PARTIAL | Public quote endpoint live again (QA-02); signed-in flow not browser-tested |
| Invoices | PARTIAL | Public invoice link, OG preview and email tracking live again (QA-02). Real-invoice-generating tester removed (QA-03). Signed-in flow not browser-tested |
| Payments | PARTIAL | Mock outcomes blocked unless `PAYMENT_PROVIDER_MODE=mock` and not production; the card rail is off in production. Engine audited earlier (intents → verified webhook → settlement). No live Ozow transaction |
| POS | PARTIAL | `/api/pos` live again (QA-01). Till flows not exercised. Restaurant migration `20260927100000` application unverified |
| Workforce | PARTIAL | Unit tests; not browser-verified |
| Payroll | PARTIAL | Engine tests (SARS 2026/27, UIF ceiling, SDL, finalisation immutability) pass; calculations not changed in this audit |
| Payslips | PARTIAL | Public payslip endpoint live again (QA-02). Encrypted PDF (ID-number password) covered by tests |
| Admin | PARTIAL | Routes role-gated client-side, and server admin gate present. Analytics code reads real tables; not browser-verified |
| Subscription | PARTIAL | Source of truth is the `subscriptions` table (`server/src/billing/entitlements.js`); 20+ entitlement and plan test files pass. Plan change not live-tested |
| Email | PARTIAL | Template and branding tests pass; real delivery and Supabase dashboard template config unverified |

# UX Verification

| Area | Result | Notes |
| ------------------ | ------ | ----- |
| Loading states | PARTIAL | Route-level `Suspense` fallback and auth bootstrap shell exist; per-page states not audited signed in |
| Empty states | NOT VERIFIED | Needs a signed-in account with empty data |
| Error states | PARTIAL | Expired verify link is specific and actionable; two developer-facing messages fixed (QA-09) |
| Success states | PARTIAL | `DoneState` standard exists (`shared/ux/doneStates.js`); not exercised |
| 404 | PARTIAL | Branded `NotFoundPage` with Back and Home for signed-in users; guests are redirected to `/login` (QA-08) |
| Mobile | PARTIAL | 320 and 375 px verified on `/`, `/Signup`, `/HowTo`, `/auth/verified` (overflow fixed); app pages not verified |
| Tablet | NOT VERIFIED | |
| Desktop | PARTIAL | Landing and sign-in verified at 1016 px |
| Accessibility | PARTIAL | Public pages: one H1 each, no `img` without `alt`, no unnamed buttons, all inputs labelled. No full keyboard or contrast audit |
| Design consistency | NOT VERIFIED | Not audited in depth |

# Technical Verification

| Area | Result | Evidence |
| --------------------- | ------ | -------- |
| Build | PASS | `npm run build`: all guard scripts pass; `vite build` ✓; no source maps emitted |
| Lint | PASS (warnings) | Before: 1 error (QA-01 parse error). After: 0 errors, 335 warnings |
| Typecheck | PASS | `tsc --noEmit` exit 0 |
| Unit tests | PASS | 219 files, **2,075 tests passed** (up from 2,058 before the audit) |
| Integration tests | PASS | PGlite DB tests included in the unit run |
| E2E tests | NOT RUN | Playwright suite needs `.env.e2e` test credentials, which don't exist |
| Console errors | PARTIAL | Public pages clean. The prod-build PWA service worker kept serving the previous build until unregistered, which is expected; users get the "new version" prompt |
| Bundle size | PARTIAL | See QA-12 |
| Source maps | PASS | Not generated without `SENTRY_AUTH_TOKEN`; `/assets/*.map` on production returns the SPA HTML, not a map |
| Environment variables | **FAIL** | Client bundle: only the Supabase anon key (`role=anon`); no secret values. Server: QA-04, QA-11 |
| Security | PARTIAL | No IDOR found in spot checks; RLS coverage good; mock payments production-gated. QA-04 open |
| Database integrity | PARTIAL | Migrations reviewed for RLS only. Production application of `20260925090000`, `20260925130000`, `20260925140000`, `20260926100000`, `20260927100000` unverified |

# Production Blockers

No confirmed production blockers remain.

The two found during this audit, QA-01 (POS API) and QA-02 (public share links), are fixed, deployed and re-probed on production.

This covers only what was tested: signed-in flows, real payments and real email were not exercised (see Manual Testing Required).

# Manual Testing Required

- Signed-in flows end to end: sign up → verify → business setup → create client → quote → accept → invoice → send → pay → status.
- POS on a real till: open register, restaurant tables (open, hold, retrieve, split, move), payment, receipt, close.
- Real Ozow payment and webhook; real PayFast subscription ITN (sandbox then live).
- Real email delivery through Resend and the Supabase custom SMTP templates.
- Payroll pay run → finalise → payslip email → open the encrypted PDF with an ID number.
- Admin console with a platform-admin account: activation, pause, trial length, analytics numbers against the database.
- Supabase production: migrations applied, Auth "Confirm email" ON, redirect URLs, templates.
- Cross-tenant test with two real orgs (IDOR by swapping ids).
- Mobile Safari and a physical tablet.

# Recommended Next Steps

### Before Launch
1. Close QA-04: move `TURNSTILE_*` into Vercel env, add `.env*` to `.vercelignore`, remove `override: true` from the PayFast handler, redeploy, check logs.
2. Mark PayFast secrets as Sensitive (QA-11).
3. Create a dedicated E2E test org and fill in `.env.e2e`, then run `npm run test:e2e`.
4. Run the manual checks above.

### Launch Day
- Tail `vercel logs www.paidly.co.za` for `FUNCTION_INVOCATION_FAILED` and 5xx.
- Watch Sentry and the admin failed-payments page.
- Send one real invoice and one real payslip to an internal address and open both links.

### Post Launch
- QA-08 (guest 404), QA-12 (bundle split), QA-13 to QA-18 (hygiene).
- Add a CI step that runs `tests/unit/apiFunctionsNativeLoad.test.js` before every deploy.
