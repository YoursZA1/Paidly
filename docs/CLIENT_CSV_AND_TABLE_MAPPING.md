# Client CSV and Table Mapping

Client capture, storage, and export/import are aligned with **Client_export.csv** and the **public.clients** table for user activity and data consistency.

## CSV format (Client_export.csv)

| Column                | Storage / usage |
|-----------------------|-----------------|
| name                  | Required. Maps to `clients.name`. |
| email                 | Maps to `clients.email`. |
| phone                 | Maps to `clients.phone`. |
| address               | Maps to `clients.address`. |
| contact_person         | Maps to `clients.contact_person`. |
| notes                 | Maps to `clients.notes`. |
| currency              | Export/import only (not stored on client row). |
| industry              | Maps to `clients.industry`. |
| segment               | Maps to `clients.segment` (e.g. `new`, `regular`, `vip`, `at_risk`). |
| total_spent           | Maps to `clients.total_spent` (numeric). |
| last_invoice_date     | Maps to `clients.last_invoice_date` (timestamptz). |
| follow_up_enabled     | Maps to `clients.follow_up_enabled` (true/false). |
| portal_access_token   | Export/import only (not stored). |
| id                    | Export: `clients.id`. Import: ignored (new id generated). |
| created_date          | Export: `clients.created_at`. Import: optional. |
| updated_date          | Export: `clients.updated_at`. Import: optional. |
| created_by_id         | Maps to `clients.created_by_id` (user who created the client). |
| is_sample             | Export/import only (not stored). |

## Database table (public.clients)

- **User activity:** `created_by_id` (references `auth.users(id)`) is set on create to the current user; used for “who created this client”.
- **Segment / spend:** `segment`, `total_spent`, `last_invoice_date` are updated by **Update Segments** (ClientFollowUpService) from invoice data and are also writable from the form/API for import or manual edits.
- **Timestamps:** `created_at`, `updated_at` are set/updated by the app and DB.

## App behaviour

- **Capture:** Client form and API use the same fields as above; new clients get `created_by_id` = current user.
- **Export:** **Export CSV** on the Clients page produces a file with the same columns as Client_export.csv (see `src/utils/clientCsvMapping.js`).
- **Import:** **Import CSV** on the Clients page accepts Client_export.csv (or the same column layout), maps rows to client payloads, and creates clients (with current user as `created_by_id` if not provided or invalid).

## Migration

If your Supabase project was created before these columns existed, run in SQL Editor:

```sql
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_spent numeric(12,2) DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_invoice_date timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
```

Or run **scripts/ensure-clients-schema.sql** for a full sync.

---

## Banking details (BankingDetail_export.csv)

Banking/payment methods are stored in **public.banking_details** and aligned with **BankingDetail_export.csv** for user activity and import/export.

### CSV columns

| Column           | Storage / usage |
|------------------|-----------------|
| bank_name        | Required. Maps to `banking_details.bank_name`. |
| account_name     | Maps to `banking_details.account_name`. |
| account_number   | Maps to `banking_details.account_number`. |
| routing_number   | Maps to `banking_details.routing_number`. |
| swift_code       | Maps to `banking_details.swift_code`. |
| payment_method   | Maps to `banking_details.payment_method` (e.g. bank_transfer, paypal, stripe, check). |
| additional_info  | Maps to `banking_details.additional_info`. |
| is_default       | Maps to `banking_details.is_default`. |
| id               | Export: `banking_details.id`. Import: ignored. |
| created_date     | Export: `banking_details.created_at`. |
| updated_date     | Export: `banking_details.updated_at`. |
| created_by_id    | Maps to `banking_details.created_by_id` (user who created the record). |
| is_sample        | Export/import only (not stored). |

### Table and RLS

- **public.banking_details**: org_id, created_by_id (user activity), and the fields above. RLS: org members can select/insert/update/delete their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-banking-details-schema.sql** in Supabase SQL Editor if the table does not exist.

---

## Invoices (Invoice_export.csv)

Invoices are stored in **public.invoices** (with **public.invoice_items** and **public.payments**). Export/import is aligned with **Invoice_export.csv** for user activity and data consistency.

### CSV columns

| Column                 | Storage / usage |
|------------------------|-----------------|
| invoice_number         | Maps to `invoices.invoice_number`. |
| client_id              | Maps to `invoices.client_id` (UUID). |
| project_title          | Maps to `invoices.project_title`. |
| project_description    | Maps to `invoices.project_description`. |
| delivery_address       | Maps to `invoices.delivery_address`. |
| items                  | JSON array of line items → **invoice_items** (service_name, description, quantity, unit_price, total_price). |
| subtotal, tax_rate, tax_amount, total_amount | Maps to `invoices.*`. |
| upfront_payment, milestone_payment, final_payment | Maps to `invoices.*`. |
| delivery_date, milestone_date, final_date | Maps to `invoices.*`. |
| banking_detail_id      | Maps to `invoices.banking_detail_id`. |
| status                 | Maps to `invoices.status` (draft, sent, viewed, partial_paid, paid, etc.). |
| payments               | JSON array of payments → **payments** (amount, date, method, notes). |
| pdf_url, notes         | Maps to `invoices.*`. |
| recurring_invoice_id, public_share_token, sent_to_email | Maps to `invoices.*`. |
| owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency | Snapshot fields on `invoices`. |
| id                     | Export: `invoices.id`. Import: ignored. |
| created_date, updated_date | Export: `invoices.created_at`, `invoices.updated_at`. |
| created_by_id          | Export: `invoices.created_by` (user who created the invoice). Import: optional. |
| is_sample              | Export/import only (not stored). |

### Table and RLS

- **public.invoices**: org_id, created_by (user activity), and the fields above. RLS: org members can select/insert/update/delete their org’s rows; admins have full access.
- **public.invoice_items**: line items linked by `invoice_id`; created on Invoice.create/update from payload.items.
- **public.payments**: payments linked by `invoice_id`; import creates Payment records after each imported invoice.
- **Migration:** Run **scripts/ensure-invoices-schema.sql** to add any missing columns (e.g. banking_detail_id, upfront_payment, owner_*, etc.).

---

## Services / catalog (Service_export.csv)

Catalog items (services, products, labor, materials, expenses) are stored in **public.services**. Export/import is aligned with **Service_export.csv** for user activity and data consistency.

### CSV columns

| Column             | Storage / usage |
|--------------------|-----------------|
| name               | Required. Maps to `services.name`. |
| description        | Maps to `services.description`. |
| unit_price         | Maps to `services.unit_price` and `services.default_rate`. |
| category           | Maps to `services.category`. |
| service_type       | Maps to `services.service_type` (e.g. fixed, per_item, hourly). |
| unit_of_measure    | Maps to `services.unit_of_measure` and `services.default_unit`. |
| min_quantity       | Maps to `services.min_quantity`. |
| is_active          | Maps to `services.is_active`. |
| tags               | JSON array → `services.tags`. |
| estimated_duration | Maps to `services.estimated_duration`. |
| requirements       | Maps to `services.requirements`. |
| id                 | Export: `services.id`. Import: ignored. |
| created_date       | Export: `services.created_at`. |
| updated_date       | Export: `services.updated_at`. |
| created_by_id      | Maps to `services.created_by_id` (user who created the item). |
| is_sample          | Export/import only (not stored). |

### Table and RLS

- **public.services**: org_id, created_by_id (user activity), and the fields above. RLS: org members can select/insert/update/delete their org’s rows; admins have full access.
- **Import:** Rows are created as `item_type = 'service'` with default_unit from unit_of_measure (or `"unit"`). Run **scripts/ensure-services-schema.sql** to add `created_by_id` if missing.

---

## Quotes (Quote_export.csv)

Quotes are stored in **public.quotes** (with **public.quote_items**). Export/import is aligned with **Quote_export.csv** for user activity and data consistency.

### CSV columns

| Column              | Storage / usage |
|---------------------|-----------------|
| quote_number        | Maps to `quotes.quote_number`. |
| client_id           | Maps to `quotes.client_id` (UUID). |
| project_title       | Maps to `quotes.project_title`. |
| project_description | Maps to `quotes.project_description`. |
| items               | JSON array of line items → **quote_items** (service_name, description, quantity, unit_price, total_price). |
| subtotal, tax_rate, tax_amount, total_amount | Maps to `quotes.*`. |
| valid_until         | Maps to `quotes.valid_until` (date). |
| status              | Maps to `quotes.status` (draft, accepted, etc.). |
| notes, terms_conditions | Maps to `quotes.*`. |
| id                  | Export: `quotes.id`. Import: ignored. |
| created_date, updated_date | Export: `quotes.created_at`, `quotes.updated_at`. |
| created_by_id       | Export: `quotes.created_by` (user who created the quote). Import: optional. |
| is_sample            | Export/import only (not stored). |

### Table and RLS

- **public.quotes**: org_id, created_by (user activity), and the fields above. RLS: org members can select/insert/update/delete their org’s rows; admins have full access.
- **public.quote_items**: line items linked by `quote_id`; created on Quote.create/update from payload.items.
- **Migration:** Run **scripts/ensure-quotes-schema.sql** if the quotes table or columns are missing.

---

## Recurring invoices (RecurringInvoice_export.csv)

Recurring invoice templates are stored in **public.recurring_invoices**. Export/import is aligned with **RecurringInvoice_export.csv** for user activity and data consistency.

### CSV columns

| Column                     | Storage / usage |
|----------------------------|-----------------|
| profile_name               | Maps to `recurring_invoices.profile_name` (displayed as template_name in UI). |
| client_id                  | Maps to `recurring_invoices.client_id` (UUID). |
| invoice_template           | JSON object → `recurring_invoices.invoice_template` (project_title, items, tax_rate, banking_detail_id, notes). |
| frequency                  | Maps to `recurring_invoices.frequency` (e.g. monthly, weekly). |
| start_date, end_date       | Maps to `recurring_invoices.*`. |
| next_generation_date       | Maps to `recurring_invoices.next_generation_date`. |
| status                     | Maps to `recurring_invoices.status` (active, paused, ended). |
| last_generated_invoice_id  | Maps to `recurring_invoices.last_generated_invoice_id`. |
| id                         | Export: `recurring_invoices.id`. Import: ignored. |
| created_date, updated_date | Export: `recurring_invoices.created_at`, `updated_at`. |
| created_by_id              | Maps to `recurring_invoices.created_by_id` (user who created the template). |
| is_sample                  | Export/import only (not stored). |

### Table and RLS

- **public.recurring_invoices**: org_id, created_by_id (user activity), and the fields above. RLS: org members can select/insert/update/delete their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-recurring-invoices-schema.sql** in Supabase SQL Editor to create the table and policies.

---

## Packages (Package_export.csv)

Subscription packages are stored in **public.packages**. Export/import is aligned with **Package_export.csv** for user activity and data consistency.

### CSV columns

| Column           | Storage / usage |
|------------------|-----------------|
| name             | Required. Maps to `packages.name`. |
| price            | Maps to `packages.price` (numeric). |
| currency         | Maps to `packages.currency` (e.g. ZAR). |
| frequency        | Maps to `packages.frequency` (e.g. /month). |
| features         | JSON array of strings → `packages.features`. |
| is_recommended   | Maps to `packages.is_recommended` (true/false). |
| website_link     | Maps to `packages.website_link`. |
| id               | Export: `packages.id`. Import: ignored. |
| created_date     | Export: `packages.created_at`. Import: optional. |
| updated_date     | Export: `packages.updated_at`. Import: optional. |
| created_by_id    | Maps to `packages.created_by_id` (user who created the package). |
| is_sample        | Maps to `packages.is_sample` (true/false). |

### Table and RLS

- **public.packages**: org_id (nullable; null = platform-wide package), name, price, currency, frequency, features (jsonb), is_recommended, website_link, created_by_id (user activity), created_at, updated_at, is_sample. RLS: all authenticated users can read packages (platform or their org); admins can do everything; org members can insert/update/delete only when org_id is set and matches their org.
- **Migration:** Run **scripts/ensure-packages-schema.sql** in Supabase SQL Editor to create the table and policies.

### App behaviour

- **Capture:** Package entity create/update sets `created_by_id` on create. Packages can be platform-level (org_id null) or org-scoped.
- **Export:** **Export CSV** on the Subscriptions / Packages area produces a file with the same columns as Package_export.csv (see `src/utils/packageCsvMapping.js`).
- **Import:** **Import CSV** on the same page accepts Package_export.csv (or the same column layout), maps rows to package payloads, and creates packages (with current user as `created_by_id` if not provided).

---

## Invoice views (InvoiceView_export.csv)

Invoice view tracking (who viewed which invoice, when, and from where) is stored in **public.invoice_views**. Export/import is aligned with **InvoiceView_export.csv** for user activity and data consistency.

### CSV columns

| Column           | Storage / usage |
|------------------|-----------------|
| invoice_id       | Required. Maps to `invoice_views.invoice_id` (UUID of the invoice). |
| client_id        | Maps to `invoice_views.client_id` (UUID of the client, optional). |
| viewed_at        | Maps to `invoice_views.viewed_at` (timestamptz). |
| ip_address       | Maps to `invoice_views.ip_address`. |
| user_agent       | Maps to `invoice_views.user_agent`. |
| is_read          | Maps to `invoice_views.is_read` (true/false). |
| id               | Export: `invoice_views.id`. Import: ignored. |
| created_date     | Export: `invoice_views.created_at`. Import: optional. |
| updated_date     | Export: `invoice_views.updated_at`. Import: optional. |
| created_by_id    | Maps to `invoice_views.created_by_id` (user who created the view record). |
| is_sample        | Maps to `invoice_views.is_sample` (true/false). |

### Table and RLS

- **public.invoice_views**: org_id, invoice_id, client_id, viewed_at, ip_address, user_agent, is_read, created_by_id (user activity), created_at, updated_at, is_sample. RLS: org members can select/insert/update/delete only their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-invoice-views-schema.sql** in Supabase SQL Editor to create the table and policies.

### App behaviour

- **Capture:** When invoice view activity is recorded (e.g. viewing an invoice), create uses `created_by_id` and `org_id` from the current user/membership.
- **Export:** **Export views CSV** on the Invoices page produces a file with the same columns as InvoiceView_export.csv (see `src/utils/invoiceViewCsvMapping.js`).
- **Import:** **Import views CSV** on the Invoices page accepts InvoiceView_export.csv (or the same column layout), maps rows to payloads, and creates invoice view records (with current user as `created_by_id` and org from membership). `invoice_id` and `client_id` must be valid UUIDs that exist in the database.

---

## Payslip (Payslip_export.csv)

Payslip capture, storage, and export/import are aligned with **Payslip_export.csv** and the **public.payslips** table. The UI uses the **Payroll** entity, which maps to the **payslips** table in Supabase for capture, export, and import.

### CSV columns

| Column                | Storage / usage |
|-----------------------|-----------------|
| payslip_number        | Maps to `payslips.payslip_number`. |
| employee_name         | Required for import. Maps to `payslips.employee_name`. |
| employee_id           | Maps to `payslips.employee_id`. |
| employee_email        | Maps to `payslips.employee_email`. |
| employee_phone        | Maps to `payslips.employee_phone`. |
| position              | Maps to `payslips.position`. |
| department            | Maps to `payslips.department`. |
| pay_period_start      | Maps to `payslips.pay_period_start` (date). |
| pay_period_end        | Maps to `payslips.pay_period_end` (date). |
| pay_date              | Maps to `payslips.pay_date` (date). |
| basic_salary          | Maps to `payslips.basic_salary`. |
| overtime_hours        | Maps to `payslips.overtime_hours`. |
| overtime_rate         | Maps to `payslips.overtime_rate`. |
| allowances            | JSON array; maps to `payslips.allowances` (jsonb). |
| gross_pay             | Maps to `payslips.gross_pay`. |
| tax_deduction         | Maps to `payslips.tax_deduction`. |
| uif_deduction         | Maps to `payslips.uif_deduction`. |
| pension_deduction     | Maps to `payslips.pension_deduction`. |
| medical_aid_deduction | Maps to `payslips.medical_aid_deduction`. |
| other_deductions      | JSON array; maps to `payslips.other_deductions` (jsonb). |
| total_deductions      | Maps to `payslips.total_deductions`. |
| net_pay               | Maps to `payslips.net_pay`. |
| status                | Maps to `payslips.status` (e.g. draft, sent, paid). |
| id                    | Export: `payslips.id`. Import: ignored. |
| created_date          | Export: `payslips.created_at`. Import: optional. |
| updated_date          | Export: `payslips.updated_at`. Import: optional. |
| created_by_id         | Maps to `payslips.created_by_id` (user who created the payslip). |
| is_sample             | Maps to `payslips.is_sample` (true/false). |

### Table and RLS

- **public.payslips**: org_id, payslip_number, employee_name, employee_id, employee_email, employee_phone, position, department, pay_period_start, pay_period_end, pay_date, basic_salary, overtime_hours, overtime_rate, allowances (jsonb), gross_pay, tax_deduction, uif_deduction, pension_deduction, medical_aid_deduction, other_deductions (jsonb), total_deductions, net_pay, status, public_share_token, created_by_id (user activity), created_at, updated_at, is_sample. RLS: org members can select/insert/update/delete only their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-payslips-schema.sql** in Supabase SQL Editor to create the table and policies.

### App behaviour

- **Capture:** Payslip form and API use the **Payroll** entity; customClient maps Payroll (table name `payrolls`) to Supabase table **payslips**. New payslips get `created_by_id` = current user and `org_id` from membership.
- **Export:** **Export CSV** on the Payslips page produces a file with the same columns as Payslip_export.csv (see `src/utils/payslipCsvMapping.js`).
- **Import:** **Import CSV** on the Payslips page accepts Payslip_export.csv (or the same column layout), maps rows to payslip payloads via `csvRowToPayslipPayload`, and creates payslips with `Payroll.create()` (current user as `created_by_id`, org from membership). Rows without `employee_name` are skipped.

---

## Expense (Expense_export.csv)

Expense capture, storage, and export/import are aligned with **Expense_export.csv** and the **public.expenses** table. The **Expense** entity uses this table for capture, export, and import.

### CSV columns

| Column           | Storage / usage |
|------------------|-----------------|
| expense_number   | Maps to `expenses.expense_number`. |
| category         | Maps to `expenses.category`. |
| description      | Maps to `expenses.description`. |
| amount           | Required. Maps to `expenses.amount`. |
| date             | Maps to `expenses.date` (date). |
| payment_method   | Maps to `expenses.payment_method`. |
| vendor           | Maps to `expenses.vendor`. |
| receipt_url      | Maps to `expenses.receipt_url`. |
| is_claimable     | Maps to `expenses.is_claimable` (true/false). |
| claimed          | Maps to `expenses.claimed` (true/false). |
| notes            | Maps to `expenses.notes`. |
| id               | Export: `expenses.id`. Import: ignored. |
| created_date     | Export: `expenses.created_at`. Import: optional. |
| updated_date     | Export: `expenses.updated_at`. Import: optional. |
| created_by_id    | Maps to `expenses.created_by_id` (user who created the expense). |
| is_sample        | Maps to `expenses.is_sample` (true/false). |

### Table and RLS

- **public.expenses**: org_id, expense_number, category, description, amount, date, payment_method, vendor, receipt_url, is_claimable, claimed, notes, created_by_id (user activity), created_at, updated_at, is_sample. RLS: org members can select/insert/update/delete only their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-expenses-schema.sql** in Supabase SQL Editor to create the table and policies.

### App behaviour

- **Capture:** Expense form and API use the **Expense** entity; customClient maps to Supabase table **expenses**. New expenses get `created_by_id` = current user and `org_id` from membership.
- **Export:** **Export CSV** on the Cash Flow page (Expenses tab) produces a file with the same columns as Expense_export.csv (see `src/utils/expenseCsvMapping.js`).
- **Import:** **Import CSV** on the Cash Flow page (Expenses tab) accepts Expense_export.csv (or the same column layout), maps rows via `csvRowToExpensePayload`, and creates expenses with `Expense.create()` (current user as `created_by_id`, org from membership).

---

## Task (Task_export.csv)

Task capture, storage, and export/import are aligned with **Task_export.csv** and the **public.tasks** table. The **Task** entity uses this table for capture, export, and import.

### CSV columns

| Column        | Storage / usage |
|---------------|-----------------|
| title         | Required for import. Maps to `tasks.title`. |
| description   | Maps to `tasks.description`. |
| client_id     | Maps to `tasks.client_id` (UUID of client). Import: only set when value is a valid UUID. |
| assigned_to   | Maps to `tasks.assigned_to`. |
| due_date      | Maps to `tasks.due_date` (date). |
| priority      | Maps to `tasks.priority` (e.g. low, medium, high). |
| status        | Maps to `tasks.status` (e.g. pending, in_progress, completed, blocked). |
| category      | Maps to `tasks.category`. |
| id            | Export: `tasks.id`. Import: ignored. |
| created_date  | Export: `tasks.created_at`. Import: optional. |
| updated_date  | Export: `tasks.updated_at`. Import: optional. |
| created_by_id | Maps to `tasks.created_by_id` (user who created the task). |
| is_sample     | Maps to `tasks.is_sample` (true/false). |

### Table and RLS

- **public.tasks**: org_id, title, description, client_id (uuid ref clients), assigned_to, due_date, priority, status, category, parent_task_id, depends_on (jsonb), estimated_hours, tags (text[]), created_by_id (user activity), created_at, updated_at, is_sample. RLS: org members can select/insert/update/delete only their org’s rows; admins have full access.
- **Migration:** Run **scripts/ensure-tasks-schema.sql** in Supabase SQL Editor to create the table and policies.

### App behaviour

- **Capture:** Task form and API use the **Task** entity; customClient maps to Supabase table **tasks**. New tasks get `created_by_id` = current user and `org_id` from membership.
- **Export:** **Export CSV** on the Calendar page (Task Management section) produces a file with the same columns as Task_export.csv (see `src/utils/taskCsvMapping.js`).
- **Import:** **Import CSV** on the Calendar page (Task Management section) accepts Task_export.csv (or the same column layout), maps rows via `csvRowToTaskPayload`, and creates tasks with `Task.create()` (current user as `created_by_id`, org from membership). Rows without `title` are skipped. `client_id` is only set when the CSV value is a valid UUID.
