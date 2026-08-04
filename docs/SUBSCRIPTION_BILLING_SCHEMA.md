# Subscription billing v2 — database schema

Revenue System SaaS billing. Schema, APIs (`POST /api/subscriptions/create`, status poll, `POST /api/payfast/itn`), checkout UI, and admin dashboards are implemented in-repo; apply migrations before production use.

## Security principles (non-negotiable)

Every billing implementation MUST follow these rules:

1. **Never trust the frontend for payment state.** Client may send `planSlug` + return/cancel URLs only. Reject client `amount`, `status`, tokens, signatures, merchant ids, or “paid/activated” flags. Frontend never sets `subscription.status = "active"` — it only displays backend status.
2. **Verify every ITN server-side with PayFast before changing subscription status.** Order: save raw → signature → source IP (live) → PayFast `/eng/query/validate` VALID → then merchant / amount / currency / subscription correlation.
3. **Treat the database as the single source of truth.** `subscriptions` + `payment_history` are SoR; `profiles.*` is a denormalized cache only.
4. **Log every subscription lifecycle event and every webhook for auditing.** `subscription_events` (Event Timeline), `payfast_itn_logs`, `webhook_logs` — append-only.
5. **Make webhook processing idempotent** to prevent duplicate activations. Unique `payment_history.payfast_payment_id`; early OK on replay; unique races → treat as success.
6. **Protect all sensitive operations with Supabase RLS**; use the **service role only where required** (ITN writes, signing, ledger inserts). Never expose `payfast_itn_logs` to JWT clients.
7. **Never expose merchant credentials, signatures, or verification logic to the client.** Passphrase and merchant key stay server-side; client receives signed form fields only for the browser POST to PayFast.
8. **Validate merchant ID, payment amount, currency, and subscription identifiers before activating.**
9. **Use database transactions where appropriate** so payment history, subscription updates, and event logs commit atomically (or fail closed); idempotent unique keys remain the second line of defense.

## RLS (required on every billing table)

| Rule | Implementation |
| --- | --- |
| Tenant scope | `company_id = current_company_id()` (`organizations.id` / product company_id) |
| Admins | `is_billing_admin()` → `is_admin()` OR `is_platform_admin()` — see all |
| Never expose ITN | `payfast_itn_logs`: RLS on, **no** authenticated grants/policies — service_role only |
| Service-role writes only | `payment_history`, `subscription_events`, `payfast_itn_logs`, `webhook_logs` |

`plans` is a global catalog (active rows readable; admin write). `webhook_logs`: admin SELECT for debugging; members never.

## Tables

| Table | Role |
| --- | --- |
| `plans` | Catalog SoR (`slug`, `billing_cycle`, `amount`, `currency`, `payfast_item_name`, `features`, `active`). **Not hardcoded in React** — load via Supabase/API. Distinct from `packages`. |
| `subscriptions` | Agreement SoR. Core: `company_id`, `plan_id`, PayFast ids, period timestamps, `cancelled_at`, `created_by`. Legacy ITN columns (`user_id`, `email`, `start_date`, `canceled_at`, …) kept for RPC compatibility. |
| `payment_history` | Every SaaS transaction. Append-only (**never delete**). Unique on `payfast_payment_id`. ≠ invoice `payments`. |
| `subscription_events` | Every billing action (allow-listed `event_type` only). Append-only. |
| `payfast_itn_logs` | Raw ITN + verification flags. Save everything; activate only if `verified`. Admin read; no delete. |
| `subscription_invoices` | SaaS invoices after verified payment. Statuses: `draft` \| `paid` \| `void` \| `cancelled`. ≠ Document Engine `invoices`. |
| `webhook_logs` | Debug: provider, headers, body, response, status_code, duration_ms. Admin read; append-only. |
| `subscription_dunning_events` | Existing dunning trail; RLS hardened. |

Migration: `supabase/migrations/20260715170000_subscription_billing_v2_schema.sql`.

### `plans` (Phase 1.1)

```sql
create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  billing_cycle text not null,          -- monthly | annual | …
  amount numeric(10,2) not null,        -- ZAR charge; ITN amount checks against this
  currency text default 'ZAR',
  payfast_item_name text,               -- PayFast item_name (fallback: name)
  features jsonb,
  active boolean default true,
  created_at timestamptz default now()
);
```

Seeded slugs: `individual` (25), `sme` (50), `corporate` (110). RLS: `anon`/`authenticated` select where `active`; writes admin/service_role only.

### `subscriptions` (Phase 1.2 core)

Live table is **extended** (not recreated) to this shape:

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  plan_id uuid references plans(id),
  payfast_token text,
  payfast_subscription_id text,
  payfast_payment_id text,
  status text,                          -- see allowed list below — never invent
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,             -- synced with legacy canceled_at
  expires_at timestamptz,
  next_billing_date timestamptz,
  trial_ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Operational extras (checkout/ITN): `m_payment_id`, `activated_at`, `pending_expires_at`, `plan_slug`.  
`cancelled_at` ↔ `canceled_at` kept in sync so `payfast_itn_replace_user_subscription` keeps working.

**Note:** `company_id` → `public.organizations` (product tenant / `current_company_id()`). `user_id` / `created_by` remain for ITN and profile sync.

## Allowed `subscriptions.status` values

**Never invent statuses.** DB CHECK + `shared/subscriptionStatuses.js` enforce this list only:

| Value | Meaning |
| --- | --- |
| `pending` | Checkout created; awaiting PayFast / ITN |
| `processing` | Payment received or ITN in flight; not yet activated |
| `active` | Verified paid agreement (server-side ITN only) |
| `past_due` | Renewal failed; dunning |
| `failed` | Payment / activation failed |
| `cancelled` | Terminal cancel (canonical spelling; legacy `canceled` / `inactive` mapped here) |
| `expired` | Term ended without renewal |
| `suspended` | Admin/provider suspension (legacy `paused` mapped here) |
| `trialing` | In trial period |

Legacy writers (`inactive`, `canceled`, `paused`, `trial`) are coerced to this list in a BEFORE trigger; unknown values raise.

### `payment_history` (Phase 1.3)

```sql
create table payment_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  company_id uuid references companies(id),
  payfast_payment_id text,
  amount numeric(10,2),
  currency text,
  payment_status text,          -- pending|completed|failed|cancelled|refunded
  payment_method text,
  transaction_date timestamptz,
  raw_itn jsonb,
  created_at timestamptz default now()
);
```

**Never delete rows** (BEFORE DELETE trigger + no DELETE grant).  
`payment_status` allow-list only: `pending` | `completed` | `failed` | `cancelled` | `refunded`  
(PayFast `COMPLETE` → `completed`). Constants: `shared/paymentHistoryStatuses.js`.

### `subscription_events` (Phase 1.4)

```sql
create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  event_type text,
  source text,
  details jsonb,
  created_at timestamptz default now()
);
```

**Allowed `event_type` only** (DB snake_case → label):

| `event_type` | Timeline / label |
| --- | --- |
| `subscription_created` | **Created** |
| `redirected` | **Redirected** (PayFast checkout URL issued) |
| `payment_pending` | Redirected (legacy; same timeline stage) |
| `webhook_received` | **ITN Received** |
| `webhook_verified` | **Verified** |
| `activated` | **Activated** (first successful payment) |
| `payment_verified` | Payment Verified (also fills Activated if `activated` missing) |
| `renewed` | **Renewed** |
| `cancelled` | **Cancelled** |
| `payment_failed` | Payment Failed |
| `webhook_failed` | Webhook Failed |

**Event Timeline order:** Created → Redirected → ITN Received → Verified → Activated → Renewed → Cancelled.

Helper: `log_subscription_event(...)`. Constants: `shared/subscriptionEventTypes.js`. Never invent types; never delete rows.

### `payfast_itn_logs` (Phase 1.5)

```sql
create table payfast_itn_logs (
  id uuid primary key default gen_random_uuid(),
  received_data jsonb,
  verification_response text,
  signature_valid boolean,
  amount_valid boolean,
  merchant_valid boolean,
  verified boolean,
  created_at timestamptz default now()
);
```

**Never trust incoming ITN** — persist the row first, run checks, set flags, then mutate `subscriptions` / `payment_history` only when `verified = true`.  
Helper: `log_payfast_itn(...)`. Append-only (no DELETE). **Never exposed to JWT clients** (service_role only).

### `subscription_invoices` (Phase 1.6)

Document Engine already owns `public.invoices` (client invoices). SaaS billing uses **`subscription_invoices`**:

```sql
create table subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  company_id uuid references companies(id),
  payment_history_id uuid references payment_history(id),
  plan_id uuid references plans(id),
  invoice_number text unique,
  status text,                 -- draft | paid | void | cancelled
  amount numeric(10,2),
  currency text default 'ZAR',
  description text,
  issued_at / paid_at / voided_at / cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  created_at / updated_at timestamptz
);
```

**Allowed `status` only** (never invent):

| Value | Label |
| --- | --- |
| `draft` | Draft |
| `paid` | Paid |
| `void` | Void |
| `cancelled` | Cancelled |

Generated after verified payment (`payment_history.completed`). One invoice per `payment_history_id` (unique). Constants: `shared/subscriptionInvoiceStatuses.js`.

### `webhook_logs` (Phase 1.7)

```sql
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,          -- e.g. payfast
  direction text default 'inbound',-- inbound | outbound
  headers jsonb,
  body jsonb,
  response jsonb,
  status_code integer,
  duration_ms integer,
  path text,
  error text,
  created_at timestamptz default now()
);
```

Useful for debugging provider delivers. Helper: `log_webhook(...)`. Admin SELECT only; append-only. Sanitize secrets from headers before insert. Complements `payfast_itn_logs` (billing verification) with HTTP-level traces.

## Flow (so far: schema only)

```
Select plan → POST create (pending row) → PayFast → ITN
  → payfast_itn_logs (always) → verify signature/amount/merchant/PayFast
  → if verified: payment_history + subscription active + subscription_invoice (paid)
                + subscription_events
  → frontend polls → UI reflects active
```

Do not activate from the client.

## Compatibility

- Keep columns used by `payfast_itn_replace_user_subscription` / `server/src/payfastSubscriptionItn.js`.
- New columns are additive; ITN column list in RPC is unchanged until a co-deployed Node change.
- One `pending` row per `user_id` (partial unique index).

## Backend API (`/api`)

| Method | Path | Auth | Role |
| --- | --- | --- | --- |
| `POST` | `/api/subscriptions/create` | Bearer user | Auth → validate plan → pending row → sign PayFast → `redirectUrl`. **Never** activate, store payment success, or trust client amount/status. |
| `GET` | `/api/subscriptions/status?subscriptionId=` | Bearer user | Poll: `currentPlan`, `currentStatus`, `expiry`, `renewDate` (+ `accessGranted`) |
| `GET` | `/api/subscriptions/current` | Bearer user | Latest agreement for company |
| `POST` | `/api/subscriptions/cancel` | Bearer user | Auth → ownership → PayFast recurring cancel (token) → DB `cancelled` → event |
| `POST` | `/api/payfast/itn` | PayFast ITN | Production pipeline: save raw → signature → IP → POST-back VALID → merchant → amount → subscription → dedupe → update → `payment_history` → events → 200 |
| `POST` | `/api/internal/activate` | `CRON_SECRET` / `INTERNAL_BILLING_SECRET` | Ops recovery if `payment_history` completed |
| `POST` | `/api/internal/expire` | same | Expire stale pending / period end |
| `GET` | `/api/admin/subscriptions` | Admin JWT | List (+ `overview` counts). `?overview=1` returns overview only: Active, Pending, Expired, Cancelled, Trial, Past Due. `?id=` → Subscription Details (Company, Owner, Plan, PayFast ID, Renew Date + History / Logs / Invoices) |
| `GET` | `/api/admin/revenue` | Admin JWT | Completed payments aggregate + `metrics`. `?metrics=1` → MRR, ARR, Today's Revenue, Monthly Revenue, Failed Revenue, Refunds, ARPU |
| `GET` | `/api/admin/failed-payments` | Admin JWT | Failed ledger rows shaped for Admin UI: Company, Date, Reason, Retry Count, Amount |

Handlers: `api/subscriptions/[[...path]].js`, `api/internal/[[...path]].js`, `api/admin-billing-handler.js`, `api/payfast-handler.js` (`__pf=itn`). Logic: `server/src/billing/*`.

Legacy: `/api/payfast/subscription`, `/api/payfast/webhook` still rewrite to the same PayFast handler.

### ITN production pipeline (`POST /api/payfast/itn`)

```
Receive ITN
  → Save raw (`payfast_itn_logs` + `webhook_logs`)
  → Verify signature
  → Verify source IP (enforced live/prod; skip via PAYFAST_ITN_SKIP_IP_CHECK)
  → POST-back to PayFast `/eng/query/validate` (must be VALID)
  → Merchant validation
  → Amount + currency validation (vs pending subscription / plans)
  → Subscription validation (m_payment_id / correlation)
  → Prevent duplicate (unique pf_payment_id) — idempotent
  → Update subscription (active only after verified)
  → Insert payment_history
  → subscription_events (timeline: … → Activated | Renewed)
  → 200 OK
```

Logic: `server/src/billing/payfastItnPipeline.js` + `payfastItnValidate.js`.

## Status / remaining

| Done | Item |
| --- | --- |
| ✓ | Schema migration + RLS (`20260715170000_*`, timeline `20260715180000_*`) |
| ✓ | `POST /api/subscriptions/create` (pending only; server-signed PayFast fields) |
| ✓ | `GET /api/subscriptions/status` poll; frontend never activates |
| ✓ | `POST /api/payfast/itn` production verification pipeline |
| ✓ | Admin: overview, revenue, failed payments, subscription details + Event Timeline |
| Open | Apply migrations to each environment; emit `subscription_invoices` on completed ITN |
| Open | Prefer a single SECURITY DEFINER RPC to commit subscription update + `payment_history` + events atomically |
