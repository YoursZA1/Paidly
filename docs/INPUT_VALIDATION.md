# Input validation inventory

This document lists where user-controlled data enters Paidly (HTTP APIs, uploads, in-app forms, URLs) and what validation exists today. It is a **living inventory** for defense-in-depth work alongside **Supabase RLS** and **parameterized queries** (which already mitigate most SQL injection).

Shared helpers live in **`server/src/inputValidation.js`**. The Node API applies them in **`server/src/index.js`**.

---

## 1. Node API (`server/src/index.js`)

Global JSON body limit: **`express.json({ limit: "15mb" })`** (large PDF payloads for send-invoice).

| Route | Method | Inputs | Validation / sanitization (summary) |
|-------|--------|--------|-------------------------------------|
| `/api/health` | GET | — | None |
| `/api/auth/sign-in` | POST | `email`, `password` | `isValidEmail`, `isReasonablePasswordLength`; rate limiting elsewhere |
| `/api/auth/sign-up` | POST | `email`, `password`, `data` (profile) | Same + `sanitizeSignUpUserMetadata` |
| `/api/track-open` | POST | `token` | `isValidTrackingToken` |
| `/api/email-track/:token` | GET | `token` param | `isValidTrackingToken` before DB update; always returns pixel |
| `/api/send-invoice` | POST | `base64PDF`, `clientEmail`, `invoiceNum`, optional template fields | Bearer auth; `validateBase64Pdf`; `isValidEmail`; `sanitizeOneLine` on strings |
| `/api/send-email` | POST | `to`, `subject`, `body` | Bearer auth; `isValidEmail`; `sanitizeOneLine` (subject); `sanitizeEmailHtmlBody`; sender name sanitized |
| `/api/payfast/subscription` | POST | subscription payload | `isValidSubscriptionId`, `isValidEmail`, `assertFiniteAmount`, optional `userId` → `isValidUuid`, billing cycle whitelist, currency pattern, `isSafeHttpUrl` on return/cancel when set, sanitized display strings |
| `/api/payfast/once` | POST | invoice payment payload | `isValidUuid` (invoice id), `isValidEmail`, `assertFiniteAmount`, `isSafeHttpUrl` on URLs, sanitized client name |
| `/api/payfast/itn` | POST | PayFast form body | Signature verification; parsed invoice id → `isValidUuid` before DB |
| `/api/admin/roles` | POST | `userId`, `role` | Admin auth; `isValidUuid`; role enum |
| `/api/admin/invite-user` | POST | `email`, metadata, `redirect_to` | Admin auth; `isValidEmail`; `isSafeHttpUrl` for redirect when provided; `sanitizeInviteMetadata` |
| `/api/admin/bootstrap` | POST | `email`, `password`, `role` | `x-bootstrap-token`; `isValidEmail`; `isReasonablePasswordLength`; role enum |
| `/api/admin/users` | GET | — | Admin auth |
| `/api/admin/users/:userId` | DELETE | `userId` | Admin auth; `isValidUuid` |
| `/api/admin/sync-users` | GET | — | Admin auth |
| `/api/admin/sync-data` | GET | `limit` (query) | Admin auth; integer **1–5000** |

---

## 2. Client → Node API (call sites)

These features call the same routes as above from the browser (or build-time origin in dev via proxy):

| Call site | Endpoint | Notes |
|-----------|----------|--------|
| `src/services/SupabaseAuthService.js` | `POST /api/auth/sign-in`, `POST /api/auth/sign-up` | Credentials |
| `src/pages/InvoiceView.jsx` | `POST /api/track-open` | `token` from public invoice URL query |
| `src/components/invoice/InvoicePreview.jsx` | `POST /api/send-invoice` | Base64 PDF + recipient meta |
| `src/api/customClient.js` (`SendEmail`) | `POST /api/send-email` | Composer email |
| `src/services/PayfastService.js` | `POST /api/payfast/once`, `POST /api/payfast/subscription` | Payment initiation |
| `src/components/auth/AuthContext.jsx` | `POST /api/admin/invite-user` | Admin invite |
| `src/api/syncSupabaseUsers.js` | `GET /api/admin/sync-users` | Admin |
| `src/services/AdminSupabaseSyncService.js` | `GET /api/admin/sync-data?limit=` | Admin; query param validated server-side |

---

## 3. Client uploads (files)

| Path | Constraint |
|------|----------------|
| `src/utils/fileUploadValidation.js` | Used by **`src/api/customClient.js`**: `uploadToStorage` (by folder: branding, activities, bank-details, private, default) and **`UploadToReceipts`**. Size caps and MIME allowlists; extension fallback when `file.type` is empty. |
| `src/lib/logoUpload.js` | **`validateLogoFile` / `uploadLogo`**: PNG/SVG only, **500KB** max; used from Settings / onboarding. |

Storage paths sanitize filenames (e.g. `customClient.js` `buildUploadPath`). **RLS** on Supabase Storage remains the authority for who may write where.

---

## 4. In-app forms and client-side state (high level)

Most CRUD goes through **`src/api/entities.js`** / **`customClient.js`** → **Supabase client** (not the Node server). Inputs are **not** centrally validated in one module today; reliance is on:

- **Postgres + RLS**
- **Typed columns** and app logic
- **Occasional** component-level checks (e.g. password policy on signup, logo validation)

Representative areas (non-exhaustive): invoices/quotes/clients (`CreateInvoice`, `EditInvoice`, `CreateQuote`, …), settings (`Settings.jsx`), banking (`BankingForm`), expenses/receipts (`ExpenseForm`, `ReceiptScanner`), payroll (`CreatePayslip`), tasks (`TaskForm`), messages (`MessageComposer`), admin screens (`PlatformSettings`, user management).

**Follow-up:** per-entity allowlists (length, numeric ranges, enums) and shared client validators mirroring server rules where duplicated.

---

## 5. URL query parameters and public links

React Router pages commonly read **`?id=`** or similar (e.g. `ViewInvoice`, `InvoicePDF`, `PublicInvoice`, `InvoiceView`). Values are passed to Supabase `.eq('id', …)` or similar; **UUID shape** should be validated client-side before queries where feasible to avoid noisy errors and log injection.

Public invoice/quote views may include **tracking tokens** in the query string; server handling for tracking is covered under **`/api/track-open`** and **`/api/email-track/:token`**.

---

## 6. Other HTTP entry points (separate from `server/src/index.js`)

| Location | Role | Validation status |
|----------|------|-------------------|
| **`api/send-email.js`** (Vercel) | Serverless email | **Not** using `inputValidation.js`; should be reviewed and aligned with `/api/send-email` rules if still in use. |
| **`api/og.js`** | OG image route | Query-driven; review if exposed. |
| **`src/api/currencyProfiles.js`** | Calls `/api/business/...`, `/api/exchange-rates`, etc. | Endpoints may live on another service; **audit separately** if deployed. |
| **Supabase Edge Functions** (e.g. `send-invoice-email` referenced from `InvoiceActions.jsx`) | Alternate send path | **Separate** from Node API; validate and authorize like the Node handler. |

---

## 7. Helper reference (`server/src/inputValidation.js`)

| Export | Purpose |
|--------|---------|
| `isValidUuid` | UUID v1–v5 string shape |
| `isValidEmail` | Length, basic shape, no control chars |
| `isValidTrackingToken` | UUID or safe opaque slug `16–128` chars |
| `sanitizeOneLine` | Strip nulls/control chars, trim, max length |
| `sanitizeEmailHtmlBody` | Strip script/on* handlers, neutralize `javascript:` |
| `validateBase64Pdf` | Size cap, base64 decode, `%PDF-` magic |
| `assertFiniteAmount` | Bounded numeric amount |
| `isSafeHttpUrl` | `http`/`https` only; optional host allowlist |
| `isReasonablePasswordLength` | Non-empty, max byte cap |
| `sanitizeInviteMetadata` | Bounded invite `user_metadata` strings |
| `sanitizePayfastCustomField` | Printable ASCII, bounded (for PayFast fields if used) |
| `sanitizeSignUpUserMetadata` | Shallow string-safe sign-up metadata |
| `isValidSubscriptionId` | Alphanumeric + `_-`, max length |

---

## 8. Suggested follow-ups

1. **Align** `api/send-email.js` (and any other serverless routes) with the same rules as `POST /api/send-email` in `server/src/index.js`.
2. **Audit** Edge Functions and currency/business HTTP APIs for input validation and auth.
3. **Client:** shared validators for UUIDs in query params and for high-risk form fields (amounts, emails, rich text).
4. **Uploads:** extend allowlists if legitimate file types are blocked in the field; keep **executable** types disallowed.
5. **Documentation:** re-run this inventory when new routes or upload paths are added.
