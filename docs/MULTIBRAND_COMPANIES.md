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
  - When set, `invoice.company` (name + optional brand logo) is passed into `documentIssuerBrand.js`. When the brand has no logo, the live Business Logo is used. `owner_*` is written at create time and is a fallback, not the default render winner.

Quotes and payslips have **no** `company_id` column. Quotes still write `owner_*` at create and resolve through the same helper. Payslips stay organization-profile scoped and do not use `documentIssuerBrand.js`.

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

## Branding precedence (source of truth)

**Which code decides the issuer name and logo on a commercial document?**

`src/lib/documentIssuerBrand.js`

Invoices, quotes, public invoice/quote pages, PDF capture, and styled previews call `resolveIssuerName` / `resolveIssuerLogoPath`. Do not invent a second priority list in UI or docs.

```
Current Business Brand / live profile
        ↓
documentIssuerBrand.js
        ↓
Document issuer branding
        ↓
Invoice / quote / PDF / public document
```

### Live Business Brand

The live Business Brand is the organization profile in Settings → Company Profile:

- Name: `profiles.company_name`
- Logo: `profiles.logo_url` (via `resolveBusinessLogoUrl` / `resolveProfileLogoUrl`)

It is selected for **logo** whenever there is no compose override and no assigned brand logo. A stale `owner_logo_url` must not override it.

Optional per-brand mark: `companies.logo_url`. Empty means “use the live Business Logo.”

### Logo resolution (`resolveIssuerLogoPath`)

1. Compose override — `document.document_logo_url` (this document only)
2. Assigned brand logo — `company.logo_url` when the invoice has `company_id` and that brand uploaded its own mark
3. **Live Business Logo** — `profiles.logo_url` (latest uploaded / updated official logo)
4. Document snapshot — `document.owner_logo_url` only when the live logo is empty
5. Selected header brand logo — compose-time default only (`selectedBrand`), never applied over a saved document’s assigned brand

### Name resolution (`resolveIssuerName`)

1. Compose override — `document.company_name`
2. Assigned brand name — `company.name`
3. Document snapshot — `document.owner_company_name` (issuer name as written when the document was created)
4. Selected header brand name — compose-time default only
5. Organization profile — `profiles.company_name`

Name still prefers the stored snapshot over the live profile name when no brand is assigned. Logo does **not** — live Business Logo beats a stale snapshot.

### What `owner_logo_url` is

- Written by `snapshotForNewDocument` when an invoice or quote is created (and similarly on edit when a new snapshot is taken).
- A stored path for fallback and for retargeting when the Business Logo file is replaced or removed.
- **Not** the active branding winner when a live Business Logo or brand logo exists.
- POS never reads it. Till branding uses the official Business Logo (`profiles.logo_url`).

### When historical snapshots are used

Keep writing `owner_*`. They are still required for:

- New-document defaults (name, logo path, address, email stamped onto the row)
- Issuer **name** (and address/email) when no brand is assigned
- Logo **only** if the live Business Logo and brand logo are both empty
- Cleanup: replacing the Business Logo retargets rows that still pointed at the old path

They are **not** a generic “snapshot first” render rule for logos. Changing the header brand switcher must not rewrite existing rows.

Document colours (`document_brand_primary` / `document_brand_secondary`) stay on the document / profile. The `companies` table only stores name and logo.

## Permissions

RLS: org members CRUD only their org’s `companies` rows; platform admins have full access. Client queries always `.eq("org_id", orgId)` from the session org (`resolveActiveOrgIdForUser`); the client never supplies another org’s id to create brands.

## Creating and assigning companies

1. Settings → Brands, or insert rows into `companies` (per org): `id`, `org_id`, `name`, `logo_url`.
2. When creating or updating an invoice, set `company_id` to the chosen company’s `id` (or leave null to use the live Business Brand, with `owner_*` as fallback).
3. EntityManager invoice insert/update whitelists include `company_id`.

## One official logo

Settings → Company Profile has **one** Business Logo (`profiles.logo_url`) used on invoices, quotes, payslips, statements, profile chrome, and POS. Changing the document template uses this live logo. Replacing or removing it deletes the previous file from the `paidly` bucket and updates `companies.logo_url` / `owner_logo_url` rows that still pointed at the old path.

- **Brand logo** (`companies.logo_url`) is optional. Use it only when that trading name needs a different mark. Empty = Business Logo.

Helpers: `src/lib/brandingLogos.js` (`resolveBusinessLogoUrl`). Documents use `documentIssuerBrand.js`. `profiles.pos_logo_url` was retired (see `supabase/migrations/20260903180000_drop_profiles_pos_logo_url.sql`).

## POS (register + catalog)

A POS register belongs to a brand (`pos_registers.company_id` → `companies.id`). Native checkout stamps `pos_sales_events.company_id` from **the register only**. The header brand switcher does not decide which products the till can sell. Till **logo** is the official Business Logo (`profiles.logo_url`), not `companies.logo_url`.

Catalog remains `public.services`. Optional `services.company_id`:

- **Null** — org-shared. Visible on every till in the organization.
- **Set** — private to that brand. Company A’s POS cannot sell Company B’s private products.

Till catalog and checkout filter: `org_id` match, `item_type = product`, `is_active`, and `(company_id IS NULL OR company_id = register.company_id)`. A register with no brand sees shared products only. Inventory / catalog editors can assign a brand on a product; leave it shared unless the SKU must stay private.

Migration: `supabase/migrations/20260828240000_pos_multibrand_catalog.sql`.
