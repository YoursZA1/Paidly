# Optional: Multi-Brand Support (Advanced SaaS)

If your invoicing platform supports **multiple brands per organization**, you can use the `companies` table and `invoices.company_id` so each invoice can display a different brand (name + logo).

## Database structure

- **companies**  
  - `id` (uuid, PK)  
  - `org_id` (uuid, FK → organizations)  
  - `name` (text)  
  - `logo_url` (text)  
  - `created_at`, `updated_at`

- **invoices**  
  - `company_id` (uuid, nullable, FK → companies)  
  - When set, the invoice uses that company’s branding; when null, it uses the existing `owner_company_name` / `owner_logo_url` snapshot.

## Migration

Run the migration that creates `companies` and adds `company_id` to invoices:

```bash
supabase db push
```

Migration file: `supabase/migrations/20250318000000_multibrand_companies.sql`.

## Loading invoice with company

When you fetch an invoice with `Invoice.get(id)`:

- If `invoice.company_id` is set, the API loads the related row from `companies` and sets **`invoice.company`** with `{ id, name, logo_url }`.
- If `company_id` is null, `invoice.company` is undefined and the app uses `owner_logo_url` / `owner_company_name` as before.

So you can use:

- **Logo:** `invoice.company?.logo_url || invoice.owner_logo_url`
- **Name:** `invoice.company?.name || invoice.owner_company_name`

The UI (InvoiceView, PublicInvoice, InvoicePDF, InvoiceEmailPDF) already prefers `invoice.company` when present.

## Creating and assigning companies

1. Insert rows into `companies` (per org): `id`, `org_id`, `name`, `logo_url`.
2. When creating or updating an invoice, set `company_id` to the chosen company’s `id` (or leave null to keep using the owner snapshot).

RLS allows org members to select/insert/update/delete their org’s companies; admins have full access.
