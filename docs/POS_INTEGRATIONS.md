# POS integrations — setup and deployment

Paidly ingests completed POS sales via **`/api/pos/*`** (Vercel serverless + optional Express). Sales land in `pos_sales_events`; inventory decrements when line items match catalog **SKU** or **barcode**.

**Native till:** sidebar **POS** (`/POS`) is a Paidly checkout surface on the same catalog, customers, and sales table. It is not a separate database. Apply `supabase/migrations/20260828160000_native_pos_checkout.sql` so `provider = paidly` connections and receipt/return columns exist.

**Native till tenders (not a fake card machine):** Pay is **Cash | Card | Digital Payment**. Cash is counted on the till (trusted cashier workflow). Card (`card_terminal`) never becomes `paid` from a cashier click — there is no physical Paidly terminal SDK and no click-to-paid permission. Digital Payment (`ozow`) completes only after Ozow confirms. Yoco/Square **webhook** sales are a different path: the external reader already confirmed the payment before Paidly records `pos_sales_events`. Do not POST `manual_complete`, `force_paid`, or `mark_paid` to `/api/pos/checkout`.

**Native till inventory:** adding to cart, opening Pay, or creating a `payment_intents` row does **not** decrement `services.stock_quantity`. After verified cash/digital/card settlement, checkout writes `pos_sales_events` then calls `adjust_inventory_stock` (`source = pos`, `reference_id` = the sale event). Returns restock only when that original sale already applied inventory.

**Native till receipts:** A completed sale opens a receipt (brand, sale number, time, staff, lines, discount, tax, total, tender, change). Print, download PDF, or email (`POST /api/pos/receipt/email`). This is not an invoice and does not use `/api/send-invoice`.

**Product surface:** **POS** (till) · Settings → **Integrations** (Yoco/Square/generic) · Dashboard **POS sales today** card.

---

## Environment variables

Set these on **Vercel** (Project → Settings → Environment Variables) and in **`server/.env`** for local `npm run server`. They are **server-only** — never prefix with `VITE_`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `POS_CREDENTIALS_ENCRYPTION_KEY` | Recommended | AES key material for stored Square tokens / Yoco API keys (32+ random chars). Falls back to hashing `SUPABASE_SERVICE_ROLE_KEY` if unset — set explicitly in production. |
| `SQUARE_APPLICATION_ID` | Square OAuth | Application ID from Square Developer Console → OAuth. |
| `SQUARE_APPLICATION_SECRET` | Square OAuth | Application secret (server only). |
| `SQUARE_ENVIRONMENT` | Square OAuth | `sandbox` (dev/staging) or `production` (live). |
| `SQUARE_PERSONAL_ACCESS_TOKEN` | Square webhooks | App **personal access token** — used once to ensure the application webhook subscription exists. Not the per-seller OAuth token. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square webhooks | Signature key from Developer Console → Webhooks — verifies `x-square-hmacsha256-signature`. |

**Yoco** does not need Paidly env vars: merchants paste their **secret API key** (`sk_test_` / `sk_live_`) in Settings; Paidly registers the webhook via Yoco’s API.

**Also required (existing):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIENT_ORIGIN` / `VITE_APP_URL` (for OAuth redirect and webhook URLs).

Templates: `server/.env.example`, `server/.env.development.example`, `server/.env.production.example`.

---

## Database migrations

Apply in Supabase **SQL Editor** (paste and run **`scripts/apply-pos-integrations.sql`**), or use CLI: `supabase link` then `supabase db push`.

1. `supabase/migrations/20260709180000_pos_integrations.sql` — `pos_connections`, `pos_sales_events` (members SELECT; company admins/owners write via `is_company_admin_for_org`)
2. `supabase/migrations/20260709183000_pos_oauth_states.sql` — OAuth CSRF state (service_role only)
4. `supabase/migrations/20260828160000_native_pos_checkout.sql` — native till (`provider = paidly`), receipt numbers, returns
5. `supabase/migrations/20260828180000_payment_intents.sql` — customer payment intents (cash / ozow)
6. `supabase/migrations/20260828190000_payment_intents_card_terminal.sql` — allow `card_terminal` on POS intents (not click-to-paid)

---

## API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/pos/oauth/square/start` | Bearer session | Returns `{ authorize_url }` |
| `GET /api/pos/oauth/callback/square` | Public (OAuth redirect) | Exchanges code, stores connection, redirects to Settings |
| `POST /api/pos/oauth/yoco/connect` | Bearer session | Validates API key, registers Yoco webhook |
| `GET /api/pos/oauth/status` | Bearer session | Whether Square OAuth is configured |
| `GET/POST/PATCH/DELETE /api/pos/connections` | Bearer + company admin (`MANAGE_COMPANY_SETTINGS`) | Manage connections; RLS matches admin write |
| `GET /api/pos/sales` | Bearer session | Dashboard + till today read model |
| `GET /api/pos/catalog` | Bearer session | Active physical products for the till |
| `POST /api/pos/checkout` | Bearer + inventory plan | Native sale; stock out |
| `POST /api/pos/return` | Bearer + inventory plan | Native return; stock in |
| `POST /api/pos/receipt/email` | Bearer + inventory plan | Email till receipt (not an invoice) |
| `POST /api/pos/webhook/:token` | Webhook secret / provider signature | Per-connection ingress (generic, Yoco) |
| `POST /api/pos/webhook/provider/square` | Square HMAC | App-level Square events (routed by `merchant_id`) |

Implementation: `server/src/pos/`, Vercel handler `api/pos/[[...path]].js`.

---

## Square — production setup

1. [Square Developer Console](https://developer.squareup.com/apps) → create application.
2. **OAuth** → add redirect URL:
   ```
   https://www.paidly.co.za/api/pos/oauth/callback/square
   ```
   Use your real app origin (`CLIENT_ORIGIN` / `VITE_APP_URL`) for staging.
3. Copy **Application ID** and **Application secret** → `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`.
4. **Credentials** → create **Personal access token** with webhook permissions → `SQUARE_PERSONAL_ACCESS_TOKEN`.
5. **Webhooks** → note **Signature key** → `SQUARE_WEBHOOK_SIGNATURE_KEY`.
6. Set `SQUARE_ENVIRONMENT=production` on production deploy.
7. In Paidly: **Settings → Integrations → Square → Connect with Square**.

On first successful OAuth, Paidly calls Square’s Webhook Subscriptions API to register:

```
POST https://connect.squareup.com/v2/webhooks/subscriptions
notification_url: {origin}/api/pos/webhook/provider/square
event_types: payment.created, payment.updated, order.updated
```

Square sends events for **all sellers who OAuth’d your app**; Paidly matches `merchant_id` to `pos_connections.config.square_merchant_id`.

---

## Square — sandbox testing

Square Sandbox uses different hosts and credentials than production.

| | Sandbox | Production |
|---|---------|------------|
| OAuth base | `https://connect.squareupsandbox.com` | `https://connect.squareup.com` |
| API base | `https://connect.squareupsandbox.com` | `https://connect.squareup.com` |
| Application ID | Sandbox app ID (`sandbox-sq0idb-…`) | Production app ID (`sq0idp-…`) |

### Local / staging checklist

1. Set env:
   ```bash
   SQUARE_ENVIRONMENT=sandbox
   SQUARE_APPLICATION_ID=sandbox-sq0idb-...
   SQUARE_APPLICATION_SECRET=...
   SQUARE_PERSONAL_ACCESS_TOKEN=...   # sandbox PAT
   SQUARE_WEBHOOK_SIGNATURE_KEY=...     # sandbox signature key
   CLIENT_ORIGIN=http://localhost:5173  # or your preview URL
   ```
2. Register redirect URL in the **sandbox** application:
   ```
   http://localhost:5173/api/pos/oauth/callback/square
   ```
   For Vercel preview, use `https://your-preview.vercel.app/api/pos/oauth/callback/square` and set `CLIENT_ORIGIN` to match.

   **Note:** Square requires **HTTPS** for production redirect URLs. Sandbox allows `http://localhost` for testing.

3. Open the **Sandbox Square Dashboard** for a [sandbox test account](https://developer.squareup.com/docs/devtools/sandbox/overview) in one browser tab (Square docs require this before the OAuth authorize page works in sandbox).

4. In Paidly dev: sign in → **Settings → Integrations → Connect with Square**.

5. Complete Square sandbox login and approve scopes (`PAYMENTS_READ`, `ORDERS_READ`, `MERCHANT_PROFILE_READ`).

6. Trigger a sandbox payment in Square; confirm:
   - `pos_sales_events` row inserted
   - Dashboard **POS sales today** updates
   - Inventory decrements when line items include matching SKU/barcode

### Sandbox limitations

- You cannot use production Square credentials with `SQUARE_ENVIRONMENT=sandbox` (or vice versa) — Square returns `AUTHENTICATION_ERROR` / `UNAUTHORIZED`.
- Webhook subscription is **per application**; sandbox and production apps need separate PATs and signature keys.
- If webhooks do not arrive locally, use a tunnel (ngrok, Cloudflare Tunnel) and set `CLIENT_ORIGIN` + Square webhook `notification_url` to the public HTTPS URL, or test on a Vercel preview deployment.

---

## Yoco — connect flow

Yoco’s public Checkout API uses **secret API keys**, not a browser OAuth redirect. Paidly’s **Connect Yoco** flow:

1. Merchant copies **secret key** from [Yoco Developer Hub](https://developer.yoco.com/) (`sk_test_` or `sk_live_`).
2. Paidly validates the key (`GET https://payments.yoco.com/api/webhooks`).
3. Paidly registers webhook (`POST https://payments.yoco.com/api/webhooks`) pointing at the connection’s `/api/pos/webhook/{token}`.
4. Yoco returns `whsec_…` once — stored as `webhook_secret` for Standard Webhooks verification.

No Paidly env vars required for Yoco. Removing a connection deletes the Yoco webhook subscription when possible.

---

## Generic webhook

For other POS systems:

1. **Settings → Integrations → Generic webhook → Create webhook connection**
2. Copy **Webhook URL** and **secret**
3. POST JSON on each completed sale; include line items with `sku` or `barcode`

Example payload:

```json
{
  "id": "sale-12345",
  "status": "completed",
  "total": 150.0,
  "currency": "ZAR",
  "payment_method": "card",
  "occurred_at": "2026-07-09T10:00:00Z",
  "items": [
    { "sku": "SKU-001", "quantity": 2, "unit_price": 75.0, "name": "Example product" }
  ]
}
```

Authenticate with `Authorization: Bearer <secret>` or `X-Paidly-Webhook-Secret: <secret>`.

---

## Deployment checklist

- [ ] Migrations applied (`pos_connections`, `pos_sales_events`, `pos_oauth_states`)
- [ ] `POS_CREDENTIALS_ENCRYPTION_KEY` set in production
- [ ] Square OAuth redirect URL registered for production origin
- [ ] `SQUARE_ENVIRONMENT=production` on production (not `sandbox`)
- [ ] `SQUARE_PERSONAL_ACCESS_TOKEN` and `SQUARE_WEBHOOK_SIGNATURE_KEY` set
- [ ] `CLIENT_ORIGIN` / `VITE_APP_URL` matches the public app URL used in redirects
- [ ] Test connect in Settings → Integrations
- [ ] Confirm one sale syncs and inventory updates for a known SKU

---

## Related docs

- `docs/Paidly-Application-Blueprint.md` — Revenue System / POS boundary
- `docs/API_DEPLOYMENT_MODEL.md` — Vercel vs Express for `/api`
- `docs/SECRETS_AND_ENV.md` — secret handling policy
