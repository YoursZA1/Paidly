# App Logic

Centralized business rules for the Paidly app. Use this layer so that invoice editability, payment validation, and status rules stay consistent across pages and components.

## What lives here

| Module         | Purpose |
|----------------|--------|
| `invoiceLogic.js` | Invoice editability, payment recording rules, display status, payment amount validation, remaining balance |

## Usage

```js
import {
  canEditInvoice,
  canRecordPayment,
  getInvoiceDisplayStatus,
  validatePaymentAmount,
  getInvoiceRemainingBalance,
} from '@/logic';
```

- **`canEditInvoice(invoice)`** – `true` when invoice can be edited (draft, sent, viewed, overdue). `false` for paid, partial_paid, cancelled.
- **`canRecordPayment(invoice)`** – `true` when a new payment can be recorded. `false` for paid or cancelled.
- **`getInvoiceDisplayStatus(invoice, options)`** – Status to show (derived from payments and due date). Options: `{ markViewed, now }`.
- **`validatePaymentAmount(invoice, payments, amount)`** – Returns `{ valid, error?, remainingBalance }`. Use before calling Payment.create.
- **`getInvoiceRemainingBalance(invoice, payments)`** – Returns `{ total, totalPaid, remaining }`.

## Related docs

- **Invoice sync (catalog → line items):** `/INVOICE_SYNC_LOGIC.md`
- **Partial payments (schedules, progress, status):** `/PARTIAL_PAYMENTS_LOGIC.md`
- **Status derivation and auto-update:** `src/utils/invoiceStatus.js`
- **Payment recording hook:** `src/hooks/usePaymentActions.js`

## Adding new rules

Add new helpers in `invoiceLogic.js` (or a new file under `logic/`) and re-export from `index.js`. Keep logic pure and testable; call into existing utils (e.g. `invoiceStatus`, `invoiceHistory`) where possible.
