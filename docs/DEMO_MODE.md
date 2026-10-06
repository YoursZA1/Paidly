# Demo Mode ("Try Live Demo")

Prospects explore a realistic, fully working Paidly business — **Mavela Café**, a Johannesburg café/restaurant — without signing up, and without any access to (or effect on) real customers.

## Architecture: browser sandbox on Try Demo

Try Demo does **not** create a Supabase user, company, subscription, or seed. The SPA installs a session-scoped sandbox (`src/lib/demo/demoSandboxStore.js`, dataset in `src/lib/demo/demoSandboxSeed.js`):

1. `startLiveDemo()` writes a non-JWT marker (`paidly-demo-sandbox`) into this tab and a profile-ready user into the auth store. No `POST /api/auth/demo`, no `setSession`.
2. While that flag is set **and** this browser has no real Supabase access token, `supabase.from` / `supabase.rpc` / `getSession` answer from the sandbox. Dashboard bootstrap and `/api/subscriptions/current` return the same dataset without a network call. POS (`/api/pos/*` used by the till) is handled in `src/lib/demo/demoPosSandbox.js`. Payroll reports, the payroll overview, leave, the workforce summary, the employee directory, and the organisation chart (`src/lib/demo/demoPayrollSandbox.js`) are built from the seeded staff and payslips in the browser. The sandbox marker is never sent as `Authorization`, because it is not a JWT.
3. Mutations stay in `sessionStorage`. Reset clones the original dataset. End demo deletes that storage only.
4. A real sign-in clears the flag before any Supabase auth call. If a real `paidly-auth` JWT is already stored, the sandbox stays off. The marker is not a JWT, so a stray request cannot pass production RLS or the API.
5. Production auth, RLS, payment validation, and the Payment Engine are unchanged. The server workspace below is no longer on the visitor path.

## Server workspace (not used by Try Demo)

One private database workspace per visitor still exists for maintenance and older sessions. New visitors do not enter it.

| Piece | Where |
|---|---|
| Schema, guards, seed, provision / reset / purge | `supabase/migrations/20261001120000_demo_mode.sql` |
| Session lifecycle API (no new Vercel function) | `server/src/demo/demoSessionApi.js` via `api/auth/[route].js` → `POST /api/auth/demo`, `/api/auth/demo-reset`, `/api/auth/demo-end` |
| Server guard helpers | `server/src/demo/demoMode.js` |
| Simulated payment contract (server + SPA) | `shared/demo/demoPayments.js` |
| Cleanup cron | `api/cron.js?job=demo-cleanup` (`/api/cron/demo-cleanup`, daily 02:30 UTC) + a small sweep on every demo start |
| SPA | `src/pages/DemoLanding.jsx` (`/demo`), `src/hooks/useDemoMode.js`, `src/lib/demo/*`, `src/components/demo/*` |

1. This path is not called by Try Demo. `POST /api/auth/demo` (IP rate-limited, capacity-capped) prefers a **prepared workspace** from a small server-side pool (`claim_pooled_demo_workspace`, service role only). The claim rotates that user's password and signs in; the browser receives only `access_token` / `refresh_token` and applies them with `supabase.auth.setSession`. The visitor's TTL starts at claim. If the pool is empty, the same request creates a dedicated auth user (`demo-<random>@example.com` — RFC 2606, undeliverable; random 32-byte password used once server-side and discarded; `app_metadata.paidly_demo = true`) and calls `provision_demo_workspace()` (service role only). That creates an organization with `is_demo = true`, the owner membership, a **demo entitlement** (`subscriptions.subscription_source = 'demo'`, Growth, trialing until the demo expires, amount 0, provider `demo`) and seeds the dataset. Historical POS sales are inserted as a set, not one database call per sale. Expired-demo cleanup and pool refill run after the response (`waitUntil`, so the visitor is not waiting), and again on the daily `demo-cleanup` cron. The SPA then navigates to the dashboard in place — it does not reload the document — after one profile read. Customers, invoices and POS history are not fetched during login.
2. Because the visitor owns exactly one org, **isolation is the normal per-org RLS** that separates real customers. Nothing in Demo Mode widens a policy.
3. Reset (`reset_demo_workspace`) keeps the org id, purges every org-scoped row (`demo_purge_org_data`: every table with an `ON DELETE CASCADE` FK to `organizations`, multi-pass for FK ordering) and re-runs the same seed. Deterministic content; dates are relative to "now" so the dashboard always looks current.
4. Expiry (default 120 min, `PAIDLY_DEMO_TTL_MINUTES`): the demo entitlement ends → writes stop (plan guard), reads continue, the banner says the demo ended. The sweep purges the workspace and deletes the auth user (plus uploaded files). "End demo" does the same immediately.

## What is enforced where

**Database (every caller, including server routes):**
- `organizations.is_demo` / `demo_expires_at` can only be set by the service role; a demo user cannot create another business; `is_internal` cannot be flipped on a demo org.
- A demo org can never hold `company_invites`, `paidly_api_keys`, `paidly_devices`, `pos_custom_providers`, `pos_oauth_states`, or a non-`paidly` POS connection.
- Memberships in a demo org may only reference no user (fictional staff) or its demo owner; a demo user can never be linked into a real business.
- Demo orgs / demo users never get a non-demo subscription; a `demo` subscription only exists for a demo org + demo user.
- `demo_sessions` is readable only by its own user and writable only by the service role.
- Append-only audit tables (`document_events`, `client_relationship_events`, closed POS shifts, converted quotes, locked payroll) allow deletes **only** inside `demo_purge_org_data()` for **that demo org** (`paidly.demo_purge` transaction GUC + `is_demo` check). Real orgs are unchanged — verified by test.

**Server:**
- Outbound communication is suppressed for demo users/orgs and returns `{ demo: true, sent: false, message: "Demo Mode — message not sent.", preview }`: `/api/send-email`, `/api/send-invoice`, the `send-invoice-email` edge function, POS receipts, payment reminders (manual + cron), quote follow-ups, leave notifications, payroll admin notices, people reminders, payslip email (403), portal / team invites (403), welcome email (skipped). A static test fails if a new sender is added without a demo guard.
- Billing: subscription create / change / cancel / abandon → 403 `DEMO_MODE_RESTRICTED`. POS provider connections (Square OAuth, Yoco key, connection edits) → 403. Account self-delete → 403 (use End demo).
- Admin: demo users have no admin role (`app_metadata.role` is server-set); admin routes refuse them like any customer.

**SPA (presentation only — never the security boundary):** persistent Demo Mode banner (app shell + till) with Reset demo / End demo / Create your Paidly account; one-time welcome; Settings → My Account, Team, Integrations, Subscription and the Billing page show a "needs a real Paidly account" panel.

## Payments: DEMO_PAYMENT

In a demo workspace every non-cash tender is a simulated payment — **no provider, bank, PayFast or Ozow is ever called**:

- Till "EFT / Digital" and table bills: the Payment Engine creates a `card_terminal` intent flagged `demo_simulated` (instead of resolving an online provider). The till shows **Demo Payment Successful / Failed / Pending**; the choice goes through `POST /api/payment-intents/:id { action: "mock" }` → `applyVerifiedProviderEvent`, i.e. the same settlement pipeline as a verified webhook, so the sale, stock, transactions and reports are real. The mock action is accepted only for a demo org's own `demo_simulated` intents; everything else keeps the existing rule (mock only outside production).
- Invoice "Pay now": the server returns `{ demo: true, simulated: true }` instead of a redirect; a successful outcome is recorded through the normal offline-receipt path (`recordOfflineDocumentPayment`, method `mobile_payment`, note "DEMO_PAYMENT"). Failed / pending record nothing.
- Cash works exactly as in production (till settlement, no provider).

## Dataset (Mavela Café)

15 customers · 20 invoices (8 paid, 1 partially paid, 3 sent, 2 viewed, 4 overdue, 2 draft; 15 % VAT, consistent line items and payments; INV-1001…1020, numbering continues at 1021) · 8 quotes (1 converted → INV-1009, 2 accepted, 2 sent, 1 viewed, 1 declined, 1 expired) · 18 menu products + 4 catering services with SKU, price, cost, VAT category, stock and low-stock thresholds (4 items low) · stock movements that explain every stock level · 6 suppliers · 24 expenses over three months · 7 staff (manager, barista, cashier, 2 waiters, 2 kitchen) with payroll profiles · native POS: register, closed shift yesterday + open shift today, ~180 historical sales (cash and simulated card) with paid payment intents · 2 floors, 10 tables showing Available, Ordering, Kitchen, Ready, Bill requested, Payment pending, Seated and Cleaning · open dine-in and takeaway orders with kitchen tickets, closed and cancelled orders · owner notifications.

## Configuration

| Env (server) | Default | Meaning |
|---|---|---|
| `PAIDLY_DEMO_ENABLED` | on | `false` turns `/api/auth/demo` off (503, friendly copy). |
| `PAIDLY_DEMO_TTL_MINUTES` | 120 | Demo lifetime (15–1440). |
| `PAIDLY_DEMO_MAX_ACTIVE` | 200 | Concurrent live demo workspaces. |
| `PAIDLY_DEMO_START_PER_IP_MAX` | 6 | Demo starts per IP per hour. |
| `PAIDLY_DEMO_RESET_PER_HOUR_MAX` | 12 | Resets per demo per hour. |
| `PAIDLY_DEMO_EMAIL_DOMAIN` | `example.com` | Placeholder mailbox domain for demo accounts. |
| `PAIDLY_DEMO_POOL_SIZE` | `2` | Prepared workspaces kept ready so a click does not seed the café. `0` seeds on the request. |
| `PAIDLY_DEMO_HASH_SALT` | — | Salt for the hashed client IP stored on `demo_sessions`. |

Requires the existing `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `CRON_SECRET`. Nothing new reaches the browser.

## Deploying

1. Apply `20261001120000_demo_mode.sql`.
2. Redeploy the `send-invoice-email` edge function (it now refuses demo users).
3. Deploy the app (vercel.json adds the `demo-cleanup` rewrite and daily cron).

## Tests

`tests/unit/demoMode.db.test.js` (real replayed schema: provisioning, dataset, isolation, DB guards, reset, purge, cleanup) · `tests/unit/demoMode.server.test.js` (session API, identity from token only, rate limit / capacity, simulated payments, email suppression, static sender check) · `tests/unit/demoMode.ui.test.jsx` · `tests/unit/demoMode.send.test.js`.
