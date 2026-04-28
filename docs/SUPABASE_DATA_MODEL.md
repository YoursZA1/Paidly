# Supabase Database Operations & Data Model

This document describes how the app uses the Supabase client for CRUD and how app data models align with the Supabase schema.

## 1. CRUD via Supabase client

All create, read, update, and delete operations for **core business tables** go through the Supabase client.

### Where CRUD is implemented

- **`src/api/customClient.js`** – `EntityManager` performs all Supabase CRUD for entities that have a matching table:
  - **Client** → `clients`
  - **Service** → `services`
  - **Invoice** → `invoices` (with line items in `invoice_items`)
  - **Quote** → `quotes` (with line items in `quote_items`)
  - **Payment** → `payments`

- **App usage**: Pages and components use the entity API (e.g. `Client.create()`, `Invoice.update()`, `Quote.delete()`). These map to `breakApi.entities.*`, which use `EntityManager` and thus `supabase.from(table).select()`, `.insert()`, `.update()`, `.delete()`.

- **Other Supabase usage**:
  - **Auth & profile**: `profiles`, `organizations`, `memberships` (see `customClient` AuthManager and `ensureUserHasOrganization`).
  - **Admin / optional**: `subscriptions`, `users`, `payments` (admin pages), `notifications` (NotificationBell). These use `supabase.from(...)` directly where needed.

### Entities without a Supabase table

The following entities are backed by **localStorage only** (no Supabase table in the current schema): BankingDetail, Note, Expense, Payroll, Task, Message, TaskAssignmentRule, QuoteTemplate, QuoteReminder, Vendor, Budget, PaymentReminder, RecurringInvoice, Package, InvoiceView, Payslip, Notification. Their CRUD is handled by `EntityManager` with a null `supabaseTable`, so data is stored locally only.

## 2. Data model alignment with Supabase schema

### Table ↔ app field mapping

- **Timestamps**: Supabase uses `created_at` and `updated_at` (snake_case). The app normalizes these for compatibility:
  - Responses: `created_date = row.created_at ?? row.created_date`, `updated_date = row.updated_at ?? row.updated_date`.
  - Writes: the app sends `created_at` / `updated_at` to Supabase; the schema defines these columns and (where applicable) triggers keep `updated_at` in sync.

### Core tables (from `supabase/schema.postgres.sql`)

| Table            | Key columns (summary) | App entity |
|-----------------|----------------------|------------|
| `organizations` | id, name, owner_id, created_at | Used for org/membership |
| `profiles`      | id, full_name, email, company_*, logo_url, currency, timezone, invoice_*, updated_at | User profile |
| `memberships`   | id, org_id, user_id, role, created_at | Org membership |
| `clients`       | id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms*, created_at, updated_at | Client |
| `services`      | id, org_id, name, description, item_type, default_unit, default_rate, is_active, … (see schema), created_at, updated_at | Service |
| `invoices`      | id, org_id, client_id, invoice_number, status, project_*, dates, subtotal, tax_*, total_amount, notes, terms_conditions, created_by, created_at, updated_at | Invoice |
| `invoice_items` | id, invoice_id, service_name, description, quantity, unit_price, total_price | Invoice line items |
| `quotes`        | id, org_id, client_id, status, project_*, valid_until, subtotal, tax_*, total_amount, notes, terms_conditions, created_by, created_at, updated_at | Quote |
| `quote_items`   | id, quote_id, service_name, description, quantity, unit_price, total_price | Quote line items |
| `payments`      | id, org_id, invoice_id, amount, status, paid_at, method, reference, created_at, updated_at | Payment |

### Required / sent fields on write

- **clients**: `org_id`, `name`; optional: email, phone, address, etc.
- **services**: `org_id`, `name`, `item_type`, `default_unit`, `default_rate` (defaults applied in app if missing).
- **invoices / quotes**: `org_id`, `status`; `created_by` set from session; line items written to `invoice_items` / `quote_items` with `service_name`, `description`, `quantity`, `unit_price`, `total_price`.

## 3. Schema changes made for alignment

- **`invoices`**, **`quotes`**, **`payments`**: added `updated_at timestamptz not null default now()` and triggers so updates match what the app sends and the schema stays consistent.

## 4. Running the schema

Apply the Supabase schema (including any new columns/triggers) from the project root:

- **Local / linked project**: `supabase db push` or run `supabase/schema.postgres.sql` in the SQL editor.
- **Existing DB**: The schema includes a `DO $$ ... $$` block that adds `updated_at` to `invoices`, `quotes`, and `payments` if the columns are missing.

## 5. Canonical logo storage contract

- **Authoritative bucket**: `paidly`
- **URL model**: public URLs only via `supabase.storage.from("paidly").getPublicUrl(path)` (no signed URLs for logos)
- **DB persistence rule**: store **path only** in DB fields (`logo_url`, `owner_logo_url`), never full `https://...` URLs
- **Accepted logo path shapes**:
  - profile/company logo: `logo-<uuid>.<ext>`
  - document logo: `document-logos/<user-id>/<uuid>.<ext>`
- **Fallback behavior**: if logo load fails, render branded fallback `/logo.svg`
