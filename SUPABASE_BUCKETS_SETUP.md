# Supabase Buckets Setup (deprecated wishlist)

**Do not create the extra buckets listed in older versions of this file.**  
Those names (`invoices`, `customers`, `products-services`, `quotes`, `payroll`) are not used by the app.

Canonical storage lives in `supabase/schema.postgres.sql` and is documented in [docs/SUPABASE_STORAGE.md](docs/SUPABASE_STORAGE.md).

## What production uses

| Bucket | Public | Paths / access |
|---|---|---|
| **paidly** | Yes | `logo-{uuid}.{ext}`, `document-logos/{userId}/…`, `inventory/{userId}/…`, plus org-scoped branding (`{org_id}/…`). Public URL for invoices/quotes/PDFs. Settings previews may use a signed URL first. |
| **receipts** | No | `{org_id}/…` — signed URL |
| **bank-details** | No | `{org_id}/…` — signed URL |
| **activities** | No | `{org_id}/…` — signed URL |
| **profile-logos** | No | Legacy `{userId}/logo.{ext}` only. No new uploads. |

Upload logos with `src/lib/logoUpload.js` (`uploadLogo`). Do not use `SupabaseStorageService` (removed). Do not require `paidly` object names to start with `auth.uid()`.

Apply buckets and RLS by running `supabase/schema.postgres.sql` or `supabase db push`. Do not run `CREATE_BUCKET_NOW.sql` or `VERIFY_BUCKET_SETUP.sql` policy-create sections.
