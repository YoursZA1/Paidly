# PAIDLY FUZZ TEST REPORT

| | |
|---|---|
| Date | 2026-10-02 |
| Environment | Local repo + every migration replayed on PGlite (`tests/unit/fixtures/supabaseSchemaReplay.js`), queried as `anon` / `authenticated` exactly like PostgREST. Production checked **read-only** (headers, JS bundle, source maps). No production data was read or written. |
| Commit | `f8e54bc` on `fix/admin-escalation-billing-payroll-hr` (+ uncommitted fixes below) |
| Deployment | https://www.paidly.co.za (Vercel) |
| Baseline tests | 254 files / 2,672 tests pass |
| After fixes | 257 files / 2,736 tests pass, `npm run build` passes (incl. repo security checks) |

## OVERALL RESULT

| Severity | Open | Fixed in repo (not deployed) |
|---|---|---|
| CRITICAL | 1 (F-02 portal sign-in has no proof of email) | 1 (F-01, migration authored — must be applied) |
| HIGH | 2 | 2 (F-03, F-04 covered by F-01) |
| MEDIUM | 7 | 1 (F-09 send-email limit) + F-02 wildcard part |
| LOW | 7 | 1 (portal HMAC compare) |

The server handlers themselves are in good shape: tenant (`org_id`) is derived from the session, never the body; POS and invoice totals are server-calculated; PayFast ITN does signature + source IP + post-back + amount + currency + idempotency; Ozow webhooks verify the hash; mock payments are blocked in production; admin roles come only from `app_metadata` / guarded `profiles.role`. **The weaknesses are below the handlers (Postgres function grants, storage policies) and beside them (the client portal).**

---

## FINDINGS

### F-01 — CRITICAL — Server-only SECURITY DEFINER RPCs callable by anyone (payment forgery, free plans)
- **Area:** Payments / Subscriptions / Database
- **Component:** 18 functions in `public`, e.g. `apply_verified_payfast_payment`, `payfast_itn_replace_user_subscription`, `company_access_subscription`, `delete_pos_connection`, `upsert_user_company_role`, `start_owner_system_trial`, `log_*` (full list in the migration).
- **Root cause:** Migrations did `REVOKE ALL ON FUNCTION … FROM PUBLIC`. On Supabase, `anon` and `authenticated` hold their **own explicit** EXECUTE grant (default privileges on schema `public`), so revoking from PUBLIC leaves them callable at `POST /rest/v1/rpc/<name>` with only the public anon key. The functions run as the owner and check nothing about the caller.
- **Attack / evidence (replayed schema, as PostgREST roles):**
  - `anon`: `apply_verified_payfast_payment(<any subscription id>, 'pf-fake', 999, 'ZAR', 'COMPLETE', '{}', now()+'10 years', 'active')` → subscription `expired → active` until 2036, forged `payment_history` row R999.
  - any signed-in user: `payfast_itn_replace_user_subscription(<self>, {"plan":"growth","status":"active",…})` → active Growth plan without paying; with another user's id → all of that user's subscriptions set `inactive`.
  - `anon`: `company_access_subscription(<org id>, null)` → full `subscriptions` row of any company (email, amounts, PayFast token).
  - `anon`: `delete_pos_connection(<org>, <conn>)` → another business's POS connection deleted.
- **Expected:** 401/403 (42501). **Actual:** 200 + state change.
- **Fix (done, NOT applied):** `supabase/migrations/20261002120000_revoke_client_execute_internal_rpcs.sql` revokes EXECUTE from `PUBLIC, anon, authenticated` and grants `service_role`. Every legitimate caller is the server's service-role client or another SECURITY DEFINER function (verified: no RLS policy, SECURITY INVOKER function or SPA code calls them).
- **Regression test:** `tests/unit/internalRpcExecute.db.test.js` — 28 pass after; with `PAIDLY_REPLAY_BEFORE=20261002120000` 24 fail (all exploit/grant cases), the 4 legitimate-flow cases (sign-up, plan mirror, plan gate, service-role payment) pass both ways.
- **Production status: UNVERIFIED.** `20260925120000` notes that EXECUTE grants were changed in production outside migrations, so production may differ from the repo. Run in the Supabase SQL editor (read-only):
  ```sql
  select p.proname,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and p.proname in ('apply_verified_payfast_payment','payfast_itn_replace_user_subscription',
      'company_access_subscription','delete_pos_connection','upsert_user_company_role',
      'start_owner_system_trial','mark_company_invite_accepted','sync_saas_user_roles',
      'mirror_company_plan_to_profiles','admin_delete_orphan_profiles','expire_all_overdue_trials',
      'log_payfast_itn','log_subscription_event','log_webhook','record_message_log_open',
      'paidly_company_plan','paidly_user_company_id')
  order by 1;
  ```
  Any `true` = exploitable in production now. Also check `payment_history` for `payfast_payment_id` values with no matching `payfast_itn_logs.received_data->>'pf_payment_id'`.

### F-02 — CRITICAL — Client portal signs in with an email address alone (cross-tenant)
- **Area:** Authentication / Multi-tenant isolation
- **Endpoint:** `POST /api/client-portal/login` (`api/client-portal/[path].js:38`, shared by Express `server/src/clientPortalApi.js`); live route `/ClientPortal`.
- **Attack:** Anyone who knows (or guesses) a customer's email gets a 7-day portal token. That token returns the customer record (incl. the business's internal `notes`, `tax_id`), up to 100 invoices with line items, payments and `public_share_token`s, quotes, and can edit the customer's phone/address and post messages into the business's inbox. CORS is `*`.
  - Worse (fixed): the email went into `.ilike("email", input)` unescaped, so `%@victim-client.co.za` (or `a%`) signed in as any customer whose address matched, on **any business on the platform**.
- **Expected:** proof of control of the mailbox (one-time code / magic link). **Actual:** none.
- **Fixed now (safe):** exact, case-insensitive match with `%`/`_`/`\` escaped + exact post-filter; email format + type check (an array `["a@b.co"]` was being coerced to a valid address); DB error text no longer returned; constant-time token signature compare. Test: `tests/unit/clientPortalLogin.test.js` (28 pass; 13 fail on the old code).
- **NOT fixed — needs your decision (authentication change):** add a one-time code / magic link step (send to the client's email via Resend, verify server-side, then issue the token), or disable `/api/client-portal/login` until that exists. Also: stop falling back to `SUPABASE_SERVICE_ROLE_KEY` as the portal signing secret (`api/client-portal/_shared.js:19`) — set `CLIENT_PORTAL_JWT_SECRET`; drop `notes` from portal responses.

### F-03 — HIGH — Anyone can read any company's subscription record
Covered by F-01 (`company_access_subscription`, `paidly_company_plan`, `paidly_user_company_id`).

### F-04 — HIGH — Anyone can delete another business's POS connection
Covered by F-01 (`delete_pos_connection`).

### F-05 — HIGH — Removed / disabled employees keep access to company storage (bank-details, activities, logos)
- **Area:** Employee portal / revoked access / Storage
- **Component:** `storage.objects` policies `org members access assets` (FOR ALL) and `org members {select,insert,update,delete} {activities,bank-details}` (`supabase/schema.postgres.sql`).
- **Evidence:** member with `disabled_at` set: `select … from storage.objects where bucket_id='bank-details'` → returns the file; `delete` → deletes it. The same user sees 0 invoices (tables have the RESTRICTIVE `inactive members have no org access` policy; storage does not).
- **Also (in-tenant, MEDIUM):** these policies are bare-membership — a POS cashier can read/replace the company's bank-detail documents.
- **Fix (RLS — not applied, needs review):** drop the catch-all for `activities`/`bank-details` and scope them like receipts (`can_access_receipt_object`): owner/admin (and finance) only, and require an active membership (`disabled_at is null and portal_revoked_at is null`). Test with the PGlite harness (`grant … on storage.objects to authenticated`).

### F-06 — HIGH — Login rate limit is bypassable
`/api/auth/sign-in` limits per IP, but the browser can call Supabase Auth directly (`<project>.supabase.co/auth/v1/token?grant_type=password`) with the public anon key, skipping it. Only Supabase's own Auth rate limits apply. **Fix:** check and tighten Auth rate limits / enable CAPTCHA in the Supabase dashboard; consider Supabase Auth hooks. (Configuration, not code.)

### F-07 — MEDIUM — `upsert_user_company_role`, `mark_company_invite_accepted`, `sync_saas_user_roles`, `log_*` writable by anon
Covered by F-01. Impact: forged audit/ITN/webhook logs, tampered onboarding role rows for arbitrary users.

### F-08 — MEDIUM — Raw internal error text returned to clients
~80 handlers return `error: err.message` (e.g. `api/_publicQuoteShared.js:170,272`, unauthenticated). Postgres/PostgREST messages (constraint, column, relation names) reach the browser. **Fix:** log server-side, return a fixed message (the `sendUnexpectedError` helper already exists).

### F-09 — MEDIUM — `/api/send-email` had no rate limit on Vercel — FIXED
The limiter in `server/src/apiAbuseLimiter.js` only runs in Express; the Vercel function never ran it. Any trial account could send unlimited HTML email to any address from Paidly's domain (display name taken from user-editable `user_metadata.company_name`). **Fix:** persisted per-user budget 60/hour → 429 + `Retry-After` (`server/src/sendEmailApi.js`). Test: `tests/unit/sendEmailRateLimit.test.js`.

### F-10 — MEDIUM — In-tenant bare-membership policies
`document_attachments`, `document_comments`, `document_links`, `document_templates`, `tasks` (FOR ALL) and POS restaurant tables (SELECT) allow any active member, including POS-only cashiers. Not cross-tenant (RESTRICTIVE guard applies). Decide per table whether employees should write these.

### F-11 — MEDIUM — Quotes can be accepted after `valid_until`
`api/_publicQuoteShared.js:220` checks the status transition but not expiry.

### F-12 — MEDIUM — CSP allows `'unsafe-inline' 'unsafe-eval'` for scripts (`vercel.json`)
Weakens XSS defence. Move inline bootstrap scripts to files / hashes, then drop both.

### F-13 — LOW — Company admin can demote the owner's membership row / attach any user id as a member
`memberships` UPDATE/INSERT policies allow it. `organizations.owner_id` is trigger-protected (verified), so ownership is not lost; owner still resolves as admin.

### F-14 — LOW — Non-constant-time secret compares
`api/cron.js:15` (`auth !== expected`). Portal token compare fixed (F-02).

### F-15 — LOW — Public `paidly` bucket accepts `image/svg+xml`
Uploaded SVG is served from the Supabase origin (not paidly.co.za), so impact is limited.

### F-16 — LOW — `ADMIN_BYPASS_AUTH` + `ADMIN_BYPASS_EMAILS` grants admin by email
`server/src/adminRouteAccess.js`. Ensure it is unset in production.

### F-17 — LOW — Client portal CORS `*`
Token is a bearer header (not a cookie), so no CSRF; tighten once F-02 is fixed.

---

## PASSED (attacked, held)

| Area | What was tried | Result |
|---|---|---|
| Multi-tenant RLS (tables) | 280 policies introspected; no `USING (true)` except waitlist insert; no RLS-less tables reachable by browser roles (`api_rate_limit_buckets` grants revoked) | PASS |
| Org ownership | admin `update organizations set owner_id = self` | 42501 — trigger blocks |
| Membership hijack | admin moves own membership into another org | RLS denies |
| Self-promotion | manager `update memberships set role='admin'` on self | 0 rows |
| Disabled member, tables | invoices / payments | 0 rows (RESTRICTIVE guard) |
| PayFast ITN | signature, IP allow-list, post-back VALID, merchant id, amount vs DB, currency, `pf_payment_id` idempotency | PASS |
| PayFast checkout | legacy client-priced `/api/payfast/subscription` | 410 Gone; server-priced catalog only |
| POS checkout | client `unit_price`, totals, negative/zero/9999+ qty, discount > subtotal, intent amount ≠ sale | server prices from catalog, clamps discount, `AMOUNT_MISMATCH` |
| Payment intents | `amount`/`status` override on action; document intent from raw amount | 422 |
| Ozow webhook | unsigned / wrong site | hash + SiteCode verified; amount re-checked |
| Mock payments | `action=mock` in production | 403 |
| Admin API | `user_metadata.role=admin` | ignored (app_metadata / guarded profile only) |
| Tenant from body | `org_id`/`company_id` in bodies across server/ | session-derived; body ids re-checked against org |
| Receipt upload | MIME, size (4 MB img / 10 MB PDF), `%PDF-` magic, server-chosen path | PASS |
| Secrets in bundle | service-role JWT, Resend/Stripe/Anthropic keys, PayFast passphrase, private keys | none; only the anon key |
| Source maps | `/assets/*.js.map` | not served |
| Headers | HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, CSP, frame-ancestors none | present (see F-12) |

## Not covered (needs a live test tenant or your decision)
- Live black-box fuzzing of production endpoints (blocked: no dedicated test tenant / credentials; I did not create accounts or write to production).
- The non-mutating production grant probe for F-01 was declined by the session's permission policy — use the SQL above.
- Concurrency / double-submit races were reviewed in code (idempotency keys, unique `pf_payment_id`, intent ↔ sale link) but not load-tested.
- HawkScan DAST: not run (no `HAWK_API_KEY`).

## Changes made (uncommitted)
| File | Change |
|---|---|
| `supabase/migrations/20261002120000_revoke_client_execute_internal_rpcs.sql` | new — revoke browser EXECUTE on 18 server-only functions (**not applied**) |
| `api/client-portal/_shared.js` | exact-match email lookup (wildcards escaped, type/format check), no DB error text, constant-time token compare |
| `server/src/sendEmailApi.js` | per-user 60/hour budget → 429 |
| `tests/unit/internalRpcExecute.db.test.js` | new, 28 tests |
| `tests/unit/clientPortalLogin.test.js` | new, 28 tests |
| `tests/unit/sendEmailRateLimit.test.js` | new, 8 tests |
