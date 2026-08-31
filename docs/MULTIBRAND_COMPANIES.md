# Multi-brand companies (document identity)

Paidly distinguishes **organization / account** (the tenant using Paidly), **company / brand** (a trading identity on documents), and **team / membership** (people with access to the organization).

`CompanyContext.companyId` is the **organization id**. It is not `public.companies.id`. Billing `subscriptions.company_id` is also the tenant org id.

## Database structure

- **companies**
  - `id` (uuid, PK)
  - `org_id` (uuid, FK → organizations)
  - `name` (text)
  - `logo_url` (text)
  - `created_at`, `updated_at`

- **invoices**
  - `company_id` (uuid, nullable, FK → companies, `ON DELETE SET NULL`)
  - When set, the invoice uses that company’s branding; when null, it uses the existing `owner_company_name` / `owner_logo_url` snapshot (then the organization profile).

Quotes and payslips have **no** `company_id` column. Quotes store issuer name/logo on `owner_*`. Payslips stay organization-profile scoped.

## Migration

```bash
supabase db push
```

Migration file: `supabase/migrations/20250318000000_multibrand_companies.sql`.

## Product UI

- **Header brand switcher** — sets the active brand for **new** invoices/quotes. Stored per organization in `localStorage` (`paidly.activeDocumentBrand.<orgId>`). Switching does **not** change existing documents.
- **Settings → Brands** — list, create, edit name/logo, delete. Logo upload uses the existing logo storage path. All org members can view and select; creating/editing requires `MANAGE_COMPANY_SETTINGS`.
- **Create invoice / quote** — Company / brand select defaults from the active brand. The value is written once onto the new document; later header switches do not rewrite an open form after the first default, and never rewrite saved rows.
- **Edit invoice** — uses the invoice’s existing `company_id` unless the user changes the select.

## Loading invoice with company

When you fetch an invoice with `Invoice.get(id)`:

- If `invoice.company_id` is set, the API loads the related row from `companies` and sets **`invoice.company`** with `{ id, name, logo_url }` (also filtered by `org_id` when present).
- If `company_id` is null, `invoice.company` is undefined.

## Branding precedence

1. Document-specific compose override (`company_name` / `document_logo_url` on the compose form)
2. Assigned brand (`invoice.company` from `public.companies`)
3. Document snapshot (`owner_company_name` / `owner_logo_url`)
4. Organization profile (`profiles` / `Company Profile` in Settings)

Document colours (`document_brand_primary` / `document_brand_secondary`) stay on the document / profile. The `companies` table only stores name and logo.

Helpers: `src/lib/documentIssuerBrand.js`.

## Permissions

RLS: org members CRUD only their org’s `companies` rows; platform admins have full access. Client queries always `.eq("org_id", orgId)` from the session org (`resolveActiveOrgIdForUser`); the client never supplies another org’s id to create brands.

## Creating and assigning companies

1. Settings → Brands, or insert rows into `companies` (per org): `id`, `org_id`, `name`, `logo_url`.
2. When creating or updating an invoice, set `company_id` to the chosen company’s `id` (or leave null to keep using the owner snapshot / profile).
3. EntityManager invoice insert/update whitelists include `company_id`.

## POS (register + catalog)

A POS register belongs to a brand (`pos_registers.company_id` → `companies.id`). Native checkout stamps `pos_sales_events.company_id` from **the register only**. The header brand switcher does not decide which products the till can sell.

Catalog remains `public.services`. Optional `services.company_id`:

- **Null** — org-shared. Visible on every till in the organization.
- **Set** — private to that brand. Company A’s POS cannot sell Company B’s private products.

Till catalog and checkout filter: `org_id` match, `item_type = product`, `is_active`, and `(company_id IS NULL OR company_id = register.company_id)`. A register with no brand sees shared products only. Inventory / catalog editors can assign a brand on a product; leave it shared unless the SKU must stay private.

Migration: `supabase/migrations/20260828240000_pos_multibrand_catalog.sql`.
