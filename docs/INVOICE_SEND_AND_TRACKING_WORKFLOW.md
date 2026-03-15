# Invoice Send & Tracking Workflow

End-to-end flow from creating an invoice to recording sends, opens, and payment in the Messages timeline.

```
Create Invoice
      ↓
Send Email / WhatsApp
      ↓
Message Log Created
      ↓
Client Opens Link
      ↓
Open Event Recorded
      ↓
Client Pays
      ↓
Payment Status Updated
```

---

## 1. Create Invoice

User creates an invoice (draft or sent) and optionally generates a **share link** (`public_share_token` on `invoices`). The share link is required for trackable sends.

- **UI:** Invoices → Create / Edit → Generate share link
- **Data:** `invoices.public_share_token`, `invoices.client_id`, etc.

---

## 2. Send Email / WhatsApp

User sends the invoice via **Email** or **WhatsApp**. Each send uses a **trackable link** and creates a **message log** (see step 3).

- **Email:** InvoiceActions → Send Email → Email preview → Send  
  - Uses `createTrackableInvoiceLink(invoice, 'email', client.email)` → `{ url, trackingToken }`  
  - Email body includes the view URL and (when available) an **open-tracking pixel**:  
    `<img src="https://yourapp.com/api/email-track/{token}" width="1" height="1" alt="" />`
- **WhatsApp:** InvoiceActions or ViewInvoice → Share via WhatsApp  
  - Uses `createTrackableInvoiceLink(invoice, 'whatsapp', client.phone)` → `{ url }`  
  - Copy text: “View your invoice here: {url}”
- **Server send (e.g. Resend):** `POST /api/send-invoice` with PDF + template; trackable link/pixel can be passed when implemented.

---

## 3. Message Log Created

Every send (email or WhatsApp) inserts a row into **`message_logs`** with a unique **`tracking_token`**. The trackable view URL is:  
`{origin}/view/{public_share_token}?token={tracking_token}`

- **Service:** `createTrackableInvoiceLink()` in `src/services/InvoiceSendService.js`  
  - Generates `tracking_token` (UUID), inserts into `MessageLog` with:  
    `document_type`, `document_id`, `client_id`, `channel`, `recipient`, `sent_at`, `tracking_token`
- **Schema:** `supabase/migrations/20250320000001_message_logs.sql`  
  - Table: `message_logs` (org_id, document_type, document_id, client_id, channel, recipient, sent_at, opened_at, viewed, paid, payment_date, tracking_token)
- **Messages UI:** Timeline table (Document, Client, Channel, Sent, Opened, Paid) and Message Detail view are driven by `message_logs` (+ fallback from `document_sends` for older data).

---

## 4. Client Opens Link

The client receives the email or WhatsApp message and clicks the **view invoice** link (or the email client loads the tracking pixel image).

- **Link click:** Opens ` /view/{shareToken}?token={tracking_token}` (public invoice view).
- **Pixel load (email):** Browser or email client requests  
  `GET /api/email-track/{tracking_token}`  
  → server responds with a 1×1 transparent GIF and records the open (step 5).

---

## 5. Open Event Recorded

When the link is opened (via page load with `?token=` or when the tracking pixel is loaded), the app records the open in **`message_logs`**: `viewed = true`, `opened_at = now()`.

- **Public invoice view:** `src/pages/InvoiceView.jsx` (or equivalent) reads `?token=` (or `?tracking=`) and calls  
  `POST /api/track-open` with `{ token }`.
- **Tracking pixel:** `GET /api/email-track/:token` in `server/src/index.js`  
  - Serves 1×1 GIF, updates `message_logs` for that `tracking_token`.
- **Server:** Both paths update `message_logs` with `viewed: true`, `opened_at: now()`.
- **RPC (optional):** `record_message_log_open(p_tracking_token)` in `supabase/migrations/20250320000002_message_log_track_open_rpc.sql` (for direct Supabase calls if needed).

The Messages timeline shows **Opened** (e.g. ✓ / 🟡) and the Message Detail view shows **Opened: &lt;date&gt;** when `viewed` is true.

---

## 6. Client Pays → Payment Status Updated

When the client pays, the invoice status is set to **`paid`**. A trigger updates **`message_logs`** so the same send row shows as paid with a payment date.

- **Trigger:** `message_logs_on_invoice_paid()` in `supabase/migrations/20250320000003_message_logs_track_payment.sql`  
  - Fires `AFTER UPDATE OF status ON invoices` when `new.status = 'paid'`.  
  - Updates `message_logs` set `paid = true`, `payment_date = now()`  
  - where `document_type = 'invoice'` and `document_id = new.id`.

The Messages timeline shows **Paid** (e.g. ✓ / 🟢) and the Message Detail view shows **Paid: &lt;date&gt;** when `paid` is true.

---

## Summary Table

| Step | What happens | Where |
|------|----------------|-------|
| 1. Create Invoice | Invoice + optional share link | Invoices UI, `invoices` table |
| 2. Send Email/WhatsApp | User sends; trackable link (and email pixel) used | InvoiceSendService, EmailPreviewModal, InvoiceActions, ViewInvoice |
| 3. Message Log Created | One row per send with `tracking_token` | `createTrackableInvoiceLink` → `message_logs` |
| 4. Client Opens Link | Client clicks link or email loads pixel | Public `/view/:shareToken?token=`, GET `/api/email-track/:token` |
| 5. Open Event Recorded | `viewed`, `opened_at` set on `message_logs` | POST `/api/track-open`, GET `/api/email-track/:token` |
| 6. Payment Status Updated | `paid`, `payment_date` set when invoice paid | Trigger on `invoices` → `message_logs` |

---

## Related files

- **Migrations:**  
  - `supabase/migrations/20250320000001_message_logs.sql`  
  - `supabase/migrations/20250320000002_message_log_track_open_rpc.sql`  
  - `supabase/migrations/20250320000003_message_logs_track_payment.sql`
- **Service:** `src/services/InvoiceSendService.js` (createTrackableInvoiceLink, getEmailOpenTrackingPixelUrl)
- **Server:** `server/src/index.js` (POST /api/track-open, GET /api/email-track/:token)
- **UI:** `src/pages/Messages.jsx` (timeline + detail), `src/pages/InvoiceView.jsx` (public view + track open), `src/components/invoice/EmailPreviewModal.jsx` (email body + pixel)
