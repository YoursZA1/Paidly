# Paidly Pay API

Internal contract for the **Paidly Pay** terminal app. Paidly remains the source of truth. This is a signed API bridge into the existing POS and Payment Engine — not a second POS, auth, or payment system.

Public URL prefix: `/api/paidly/*`  
Runtime: existing `api/pos/[[...path]].js` (Vercel Hobby rewrite). No 13th serverless function.

Amounts are **rands** (`numeric(14,2)`), matching `payment_intents.amount` and `pos_sales_events.total_amount`. They are not cents.

## Authentication

Authenticated routes:

```http
Authorization: Bearer <POS_API_KEY>
```

Or a per-company key:

```http
Authorization: Bearer <key_id>.<secret>
```

The server hashes the secret (`SHA-256`) and looks up `paidly_api_keys`. Raw keys are never returned.

MVP bootstrap (server env only — never `VITE_` / `NEXT_PUBLIC_`):

| Variable | Purpose |
|----------|---------|
| `POS_API_KEY` | Shared Bearer secret when no DB key exists |
| `POS_API_ORG_ID` | Organization the env key is bound to |
| `POS_API_COMPANY_ID` | Optional brand (`companies.id`). If set, the key cannot read other brands |
| `POS_WEBHOOK_SECRET` | HMAC secret for `X-POS-Signature` |
| `PAIDLY_PAY_ORIGINS` | Comma-separated allowed CORS origins (never `*`) |
| `PAYMENT_PROVIDER_MODE` | `live` (default in production) or `mock` |
| `ALLOW_MOCK_PAYMENTS` | Must be `1` to use mock in `NODE_ENV=production` |

Company id on the query string is ignored unless it matches the authenticated key’s company.

Recommended scopes:

- `transactions:read`
- `payments:create`
- `payments:read`
- `payments:cancel`
- `payments:refund`
- `devices:manage`

## Security rules

- The client cannot set `amount` or `status` on payment-intent create.
- Paid is applied only after a **verified** HMAC webhook (or existing Ozow Notify path).
- `payment_successful: true` from the phone is ignored.
- Duplicate `provider_event_id` values are acknowledged and do not write a second `pos_sales_events` row.
- CORS never uses `Access-Control-Allow-Origin: *` on authenticated routes.
- Responses never include API keys, webhook secrets, SQL, or stack traces in production.

## Endpoints

### `GET /api/paidly/health`

Public reachability check.

```json
{ "ok": true, "service": "paidly-api", "environment": "production", "version": "1" }
```

### `GET /api/paidly/transactions`

Open POS payment intents for the authenticated org/company.

Query: `status=open`, `limit=50`, `cursor=`, `company_id=` (filter only; cannot escape the key’s tenant).

```json
{
  "transactions": [
    {
      "id": "intent-uuid",
      "reference": "POS-A1B2C3",
      "company_id": "company-uuid",
      "amount": 450.00,
      "currency": "ZAR",
      "status": "open",
      "payment_status": "pending",
      "customer_name": "Walk-in Customer",
      "created_at": "2026-09-15T17:30:00.000Z"
    }
  ],
  "next_cursor": null
}
```

An “open transaction” is an unpaid `payment_intents` row (`source_kind=pos`, no `pos_sale_event_id`). Native checkout creates that row; this API does not invent a second POS ledger.

### `GET /api/paidly/transactions/:id`

Same shape for one intent. Cross-company access returns `403 CROSS_COMPANY_DENIED`. Missing ids return `404`.

### `POST /api/paidly/payment-intents`

```json
{ "pos_transaction_id": "intent-uuid", "payment_method": "tap_to_pay" }
```

Methods: `tap_to_pay`, `qr`, `card`, `cash`, `eft`, `payment_link`.  
`tap_to_pay` / `qr` / `card` map to the existing `card_terminal` rail. Amount is loaded from the database.

```json
{
  "payment_intent_id": "intent-uuid",
  "pos_transaction_id": "intent-uuid",
  "amount": 450.00,
  "currency": "ZAR",
  "status": "pending",
  "payment_method": "tap_to_pay",
  "reference": "PAY-20260915-A1B2C3",
  "next_action": { "type": "tap_to_pay", "display": "TAP CARD" }
}
```

Public statuses: `created`, `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `expired`, `refunded`, `partially_refunded`.  
Internal `payment_intents.status` is unchanged (`pending` / `requires_action` / `processing` / `paid` / …).

### `GET /api/paidly/payment-intents/:id`

Current status. Poll this after presenting TAP CARD / QR PAY.

### `POST /api/paidly/payment-intents/:id/cancel`

Cancels an in-flight intent. Settled (`paid` / `refunded`) intents are not cancellable from the terminal.

### `POST /api/paidly/payment-intents/:id/refund`

```json
{ "amount": 450.00, "reason": "Customer returned product" }
```

Creates a `payment_refunds` row with `status=pending`. The intent is **not** marked `refunded` until a verified `payment.refunded` webhook. MVP is full refund; partial refunds are stored but do not rewrite the original `pos_sales_events` row.

### Devices

`POST /api/paidly/devices` · `GET /api/paidly/devices` · `POST /api/paidly/devices/:id/revoke`

A revoked device (`X-Device-Id`) cannot create payment intents.

## Webhooks

### `POST /api/paidly/webhooks/payment`

```http
X-POS-Signature: <hex HMAC-SHA256 of the raw body>
```

HMAC: `HMAC-SHA256(raw_request_body, POS_WEBHOOK_SECRET)` using the original bytes, not re-serialized JSON. Compare with constant time.

Events:

- `payment.created`
- `payment.pending`
- `payment.processing`
- `payment.succeeded`
- `payment.failed`
- `payment.cancelled`
- `payment.expired`
- `payment.refunded`
- `payment.partially_refunded`

Unknown events are logged and acknowledged (`200`).

Success payload (test / mock):

```json
{
  "event": "payment.succeeded",
  "provider_event_id": "evt_123",
  "payment_intent_id": "intent-uuid"
}
```

On `payment.succeeded` the Payment Engine marks the intent `paid` and the POS settlement adapter writes **one** `pos_sales_events` row (inventory + receipt + audit). Duplicate `provider_event_id` returns `{ "ok": true, "duplicate": true }`.

### `POST /api/paidly/webhooks/pos`

Same HMAC. Body may include `transaction_id` / `company_id` / `amount`, but the server loads the intent from the database and ignores untrusted amount/company fields.

## Mock provider

Set `PAYMENT_PROVIDER_MODE=mock` in development. The terminal still cannot mark a sale paid. Simulate outcomes with signed webhooks (`payment.succeeded`, `payment.failed`, `payment.expired`, `payment.cancelled`, `payment.refunded`). Production stays `live` unless `ALLOW_MOCK_PAYMENTS=1` is set on the server.

## Error format

```json
{
  "error": {
    "code": "PAYMENT_TRANSACTION_ALREADY_PAID",
    "message": "This transaction has already been paid.",
    "request_id": "req_123"
  }
}
```

| Code | When |
|------|------|
| `UNAUTHORIZED` | Missing or invalid API key |
| `MISSING_SIGNATURE` / `INVALID_SIGNATURE` | Webhook HMAC |
| `CROSS_COMPANY_DENIED` | Key/company mismatch |
| `TRANSACTION_NOT_FOUND` | Unknown POS intent |
| `PAYMENT_TRANSACTION_ALREADY_PAID` | Already settled |
| `AMOUNT_OVERRIDE_FORBIDDEN` | Client sent `amount` or `status` |
| `PAYMENT_NOT_CANCELLABLE` | Already settled |
| `PAYMENT_NOT_REFUNDABLE` | Intent is not `paid` |
| `REFUND_AMOUNT_INVALID` | Amount ≤ 0 or greater than paid |
| `DEVICE_REVOKED` | Device cannot charge |

## Flow

1. Merchant checks out on Paidly POS (card / tap).
2. POS creates a `payment_intents` row (`source_kind=pos`, amount from catalog). Sale is **not** written yet.
3. Paidly Pay lists the open intent and shows TAP CARD / QR PAY.
4. Provider (or mock webhook) posts a signed `payment.succeeded`.
5. Intent becomes `paid` → settlement writes `pos_sales_events` → inventory and receipt.
6. A second webhook with the same `provider_event_id` does nothing.
