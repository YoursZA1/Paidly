# PayFast subscription billing (Paidly)

Canonical Custom Integration docs: [https://developers.payfast.co.za/documentation/](https://developers.payfast.co.za/documentation/)

## Architecture

```
SPA (plan slug only)
  → POST /api/subscriptions/create   (Bearer JWT)
  → pending row in public.subscriptions (server amount from public.plans)
  → signed checkout fields (server-only passphrase)
  → browser POST hidden form to PayFast (sandbox or live)
  → PayFast ITN POST /api/payfast/itn
  → signature + VALID post-back + merchant + amount
  → apply_verified_payfast_payment / upsert
  → subscriptions.status = active + payment_history
  → SPA polls GET /api/subscriptions/status  (never activates itself)
```

Do **not** point PayFast’s notify URL at `supabase/functions/payfast-itn`. Use `/api/payfast/itn`.

## Signature (checkout)

Custom Integration checkout signatures are **not** the REST API signature.

1. Non-blank fields only, in PayFast **attribute order** (`PAYFAST_CHECKOUT_FIELD_ORDER` in `server/src/payfastCustomSignature.js`).
2. PHP `urlencode` (spaces → `+`, uppercase percent-hex).
3. Join with `&`.
4. Append `&passphrase=` + encoded salt passphrase.
5. MD5 (lowercase hex) as `signature`.

Subscriptions **require** a passphrase (sandbox and live).

REST cancel/pause uses a **different** alphabetical API signature (`generatePayfastApiSignature`).

## Environment

| Variable | Role |
| --- | --- |
| `PAYFAST_MODE` | `sandbox` or `live` |
| `PAYFAST_SANDBOX_MERCHANT_ID` / `PAYFAST_SANDBOX_MERCHANT_KEY` | Sandbox merchant |
| `PAYFAST_LIVE_MERCHANT_ID` / `PAYFAST_LIVE_MERCHANT_KEY` | Live merchant |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` | Fallback if mode-specific vars unset |
| `PAYFAST_PASSPHRASE` | Salt passphrase — **must match** the PayFast dashboard for that environment. Never `VITE_*`. |
| `PAYFAST_SANDBOX_PASSPHRASE` / `PAYFAST_LIVE_PASSPHRASE` | Optional per-mode override of `PAYFAST_PASSPHRASE` |
| `PAYFAST_SUBSCRIPTION_NOTIFY_URL` | Public HTTPS ITN URL (`https://<host>/api/payfast/itn`). **Wins over** client `notifyUrl`. |
| `PAYFAST_NOTIFY_URL` | Fallback notify URL |
| `PAYFAST_PUBLIC_SITE_URL` | Used to derive notify/return when env notify is unset |
| `PAYFAST_RETURN_URL` / `PAYFAST_CANCEL_URL` | Optional server overrides |
| `PAYFAST_SIGNATURE_DEBUG` | `true` in sandbox only — logs redacted param string |
| `PAYFAST_DIAGNOSTIC` | Force-enable/disable `POST /api/subscriptions/payfast-diagnose` |
| `PAYFAST_ALLOW_LOCALHOST_NOTIFY` | Sandbox only; ITNs still will not arrive |
| `PAYFAST_ITN_SKIP_IP_CHECK` / `PAYFAST_ITN_REQUIRE_IP` | ITN source IP policy |
| `PAYFAST_ITN_ALLOW_NO_PASSPHRASE` | Local only; never production |

Do not mix sandbox merchant IDs with `PAYFAST_MODE=live`.

### Sandbox setup

1. Log into [https://sandbox.payfast.co.za](https://sandbox.payfast.co.za).
2. Settings → Salt Passphrase — set a passphrase and copy it to `PAYFAST_PASSPHRASE`.
3. Copy sandbox merchant id/key into `PAYFAST_SANDBOX_*`.
4. Set `PAYFAST_MODE=sandbox`.
5. Set `PAYFAST_SUBSCRIPTION_NOTIFY_URL` to a **public** HTTPS URL (Vercel preview or ngrok), not localhost.
6. Pay with a **different email** than the merchant account (PayFast rejects same-account payments).

### Production

`PAYFAST_MODE=live`, live merchant credentials, HTTPS return/cancel/notify, passphrase matching the live dashboard.

## ITN

`POST /api/payfast/itn` (aliases: `/api/payfast/webhook`, `/api/payfast/subscription/itn`).

Order: save raw → ITN signature (received field order) → IP (live) → PayFast `/eng/query/validate` VALID → merchant id → amount/currency vs pending snapshot → correlate `m_payment_id` → idempotent `payment_history.payfast_payment_id` → activate.

The `/success` page only polls. It does not write `active`.

## Cancellation

`POST /api/subscriptions/cancel` cancels the PayFast token via the Recurring Billing API, then sets DB status `cancelled`. Payment history is never deleted.

## Troubleshooting signature mismatch

PayFast: **Generated signature does not match submitted signature.**

| Check | Detail |
| --- | --- |
| Passphrase | Must match dashboard Salt Passphrase for **this** merchant (sandbox vs live). Required for subscriptions. |
| Encoding | Spaces must be `+`, not `%20`. |
| Field order | Attribute-description order, **not** alphabetical. |
| Blank fields | Must be omitted from both the signature and the HTML form. |
| Double encoding | Do not pre-encode URLs in field values. |
| Form order | Frontend posts `fieldOrder` from the server so the form matches the signed string. |

Admin sandbox diagnostic (disabled in production): `POST /api/subscriptions/payfast-diagnose` with Bearer admin JWT and `{ "planSlug": "starter_monthly" }`. Returns included fields, redacted param string, and signature — never the passphrase.

## Database

SoR: `plans`, `subscriptions`, `payment_history`, `subscription_events`, `payfast_itn_logs`. Profiles are a cache (`plan_family`). Service role only for ITN writes. See `docs/SUBSCRIPTION_BILLING_SCHEMA.md`.
