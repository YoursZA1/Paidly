# Supabase Database Operations & Data Model

This document is the implementation-facing source of truth for:

1. Which layer owns reads/writes per domain.
2. Which entities are canonical in Supabase vs legacy/local fallbacks.
3. The approved client data-access path for new features.

## 1. Approved data-access layering

The approved path for persistent business data is:

`UI -> hooks -> service orchestration -> entity facade -> EntityManager -> Supabase`

### Ownership by layer

- **Auth/profile source of truth**: `AuthContext` (`src/contexts/AuthContext.impl.jsx`).
  - `useUserProfileQuery` is a selector over auth state, not a separate profile fetch owner.
- **Hooks**: query keys, `enabled`, stale times, pagination state.
  - Examples: `useInvoices`, `useInvoiceSideData`, `useDashboardDocumentsQuery`.
- **Services**: bounded reads, retries/timeouts, data shaping, export pipelines.
  - Examples: `InvoiceListService`, `DashboardDataService`, `DocumentExportService`.
- **Entities (`@/api/entities`) + `EntityManager`**: low-level CRUD/table mapping.

### Domain paths (one approved path each)

| Domain | Approved path |
|---|---|
| Auth/profile | `AuthContext` -> `User.restoreFromSupabaseSession`/session stores -> consumers via `useAuth`/`useUserProfileQuery` |
| Invoice lists | `useInvoices` -> `InvoiceListService.fetchInvoiceListPage` -> `Invoice.list` |
| Invoice side data | `useInvoiceSideData` -> `InvoiceListService.fetchInvoiceSideData` |
| Dashboard summaries | `useDashboardInvoicesQuery`/`useDashboardPayslipsQuery` -> `DashboardDataService` |
| Document exports | page action -> `DocumentExportService` -> item-table fetch + CSV mapping |
| Mutations (create/update/delete) | UI action -> entity facade (`Invoice.update`, `Quote.create`, etc.) -> `EntityManager` |

## 2. Entity -> storage status

### Supabase-backed core entities

- **Client** -> `clients`
- **Service** -> `services`
- **Invoice** -> `invoices` (+ `invoice_items`)
- **Quote** -> `quotes` (+ `quote_items`)
- **Payment** -> `payments`
- **Identity/org** -> `profiles`, `organizations`, `memberships`

### Legacy/unmigrated or mixed-path entities

Some entities still run through legacy local-storage paths or mixed transport paths depending on feature surface. Treat these as migration targets, not patterns for new features:

- BankingDetail, Note, Expense, Payroll, Task, Message, TaskAssignmentRule, QuoteTemplate, QuoteReminder, Vendor, Budget, PaymentReminder, RecurringInvoice, Package, InvoiceView, Payslip, Notification.

For these domains, prefer adding a service/hook boundary first, then switching backing store without changing page-level callers.

## 3. Data model alignment with Supabase schema

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

## 4. Schema changes made for alignment

- **`invoices`**, **`quotes`**, **`payments`**: added `updated_at timestamptz not null default now()` and triggers so updates match what the app sends and the schema stays consistent.

## 5. Running the schema

Apply the Supabase schema (including any new columns/triggers) from the project root:

- **Local / linked project**: `supabase db push` or run `supabase/schema.postgres.sql` in the SQL editor.
- **Existing DB**: The schema includes a `DO $$ ... $$` block that adds `updated_at` to `invoices`, `quotes`, and `payments` if the columns are missing.

## 6. Canonical logo storage contract

- **Authoritative bucket**: `paidly`
- **URL model**: public URLs only via `supabase.storage.from("paidly").getPublicUrl(path)` (no signed URLs for logos)
- **DB persistence rule**: store **path only** in DB fields (`logo_url`, `owner_logo_url`), never full `https://...` URLs
- **Accepted logo path shapes**:
  - profile/company logo: `logo-<uuid>.<ext>`
  - document logo: `document-logos/<user-id>/<uuid>.<ext>`
- **Fallback behavior**: if logo load fails, render branded fallback `/logo.svg`
