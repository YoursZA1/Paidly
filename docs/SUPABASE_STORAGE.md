# Supabase Storage (Buckets)

This app uses Supabase Storage for file uploads and downloads (logos, invoices, receipts, bank files).

Bucket visibility contract:
- `paidly` is intentionally **PUBLIC** (`public = true`) so public invoices/document previews can load logos via public URLs (no signed URL required).
- `receipts` and `bank-details` are **PRIVATE** (`public = false`) and must be accessed via signed URLs.

Developers must not change `paidly` to private. Storage configuration is controlled by the canonical SQL: `supabase/schema.postgres.sql` (and migrations).

## Final storage model

| Asset | Bucket | Visibility | Access |
|---|---|---|---|
| Logos | `paidly` | Public | Public URL via `AssetService.getLogo(path)` |
| Public invoices / document previews | `paidly` | Public | Public URL |
| Document-specific logo overrides | `paidly` (`document-logos/...`) | Public | Public URL |
| Receipts | `receipts` | Private | Signed URL |
| Bank files | `bank-details` | Private | Signed URL |
| Org activities / attachments | `activities` | Private | Signed URL |

## Logo upload (canonical — only supported path)

**All profile, brand, and onboarding logo uploads use one implementation:**

```text
Settings / SetupWizard / OrgBrandsSettings
  ↓
src/lib/logoUpload.js  →  uploadLogo()
  ↓
paidly bucket
  ↓
logo-{uuid}.{ext}   (e.g. logo-abc123.png)
  ↓
profiles.logo_url / org_brands.logo_url  (filename only, not full URL)
  ↓
AssetService.getLogo(path)  →  public URL
```

Rules:
- **Uploader:** `src/lib/logoUpload.js` (`uploadLogo`, `deleteStoredLogo`, `retargetLogoReferences`).
- **Bucket:** `paidly` only. Do not upload logos to `profile-logos`.
- **Naming:** `logo-{uuid}.{ext}` where `{uuid}` is `crypto.randomUUID()` (or a timestamp fallback).
- **DB:** Store the **filename/path only** in `profiles.logo_url`, `org_brands.logo_url`, etc. Never persist full `https://...` URLs.
- **Replacement:** On Settings save, the previous logo object is deleted via `deleteStoredLogo()` after `retargetLogoReferences()` updates dependent rows.
- **Public access:** `paidly` is public; logos do not require signed URLs for invoice/quote viewers.

Document-only logo overrides (per invoice/quote) use `uploadDocumentLogo()` in the same module:

```text
document-logos/{userId}/{uuid}.{ext}
```

Also stored in the `paidly` bucket.

### Do not use

- `{userId}/logo.{ext}` — **retired upload convention**. Not used by any active uploader.
- `SupabaseStorageService.uploadProfileLogo` — **removed**. Was the old `{userId}/logo.ext` implementation.
- `profile-logos` bucket for **new** logo uploads.

### Legacy logo paths (read-only)

Older records may still reference:
- `logo-{uuid}.{ext}` on `company-logos` (legacy bucket; read via `AssetService`)
- `{userId}/logo.{ext}` on `profile-logos` (pre-standardization; read via `AssetService.signLogoUrl` / `getLogo`)

These paths are **display-only fallbacks**. Re-upload through Settings to migrate to the canonical `paidly` / `logo-{uuid}.{ext}` format. SQL migrations under `supabase/migrations/` normalize stored DB values to filename-only form.

## Bucket reference

| Bucket | Public | Use case | Path convention | Size limit |
|--------|--------|----------|-----------------|------------|
| **paidly** | Yes | Logos, branding, public invoices/document previews | `logo-{uuid}.{ext}`, `document-logos/{userId}/{uuid}.{ext}`, org-scoped assets | 50 MB |
| **profile-logos** | No | Legacy user logos (read-only; no new uploads) | `{userId}/logo.{ext}` | 5 MB |
| **activities** | No | Receipts, attachments, exports | `org_id/...` | 50 MB |
| **receipts** | No | Receipt images (confidential) | `org_id/receipt-...` | 10 MB |
| **bank-details** | No | Bank statements, import files | `org_id/...` | 50 MB |

- **Public bucket**: `paidly` — use `getPublicUrl()` for logos and public document assets.
- **Private buckets**: `receipts`, `bank-details`, `activities` — use `createSignedUrl()`. Never call `getPublicUrl()` for private buckets.

## URL resolution (do not collapse these)

| Surface | How the logo URL is built |
|---|---|
| Public invoice / quote / PDF / anonymous viewer | `AssetService.getLogo` → `getPublicUrl()` only. Never `createSignedUrl()`. |
| Settings / brand editor previews | `LogoImage preferSignedUrl` → `signLogoUrl` first (authenticated resiliency), then public URL. |

Both read the same `paidly` object. Signed-first in Settings is preview-only; it is not a second storage model.

## Bucket policies (RLS)

Defined in **`supabase/schema.postgres.sql`** (mirrored by `supabase/migrations/20260903200000_storage_policies_match_schema.sql`). Pasting an older dump that only has uid/org-path policies **drops or omits** the logo-% / public-read rules and breaks `logo-{uuid}` uploads.

1. **Paidly public read** — `"Public can read paidly assets"`: SELECT for `anon` and `authenticated` when `bucket_id = 'paidly'`.
2. **Paidly writes (current)** — `"Users can upload/update/delete paidly assets"`: `logo-%`, `document-logos/%`, `inventory/{auth.uid()}/%`. Update/delete also require `owner = auth.uid()`.
3. **Legacy profile-logos** — uid-first-segment (`{auth.uid()}/…`) on **`profile-logos` only**. Do not apply this to `paidly`.
4. **Org-scoped** — first path segment = user's `org_id` via `memberships` (`{org_id}/branding`, receipts, bank files, activities).
5. **Admin** — full access when `public.is_admin()` is true.

`paidly` logos are **not** required to start with `auth.uid()` or `org_id`.

## App integration

- **Logo upload:** `src/lib/logoUpload.js` → `paidly` bucket → `logo-{uuid}.{ext}`.
- **Logo display:** `AssetService.getLogo(path)` → `getPublicUrl()` on `paidly` (with legacy fallbacks for `company-logos` and `profile-logos`).
- **Public invoices / PDFs / anonymous viewers:** `LogoImage` uses `getPublicUrl()` only. Never `createSignedUrl()`.
- **Settings previews:** `LogoImage` may set `preferSignedUrl` for authenticated resiliency. Private receipts/bank files stay on signed URLs.
- **Other uploads:** `SupabaseMultiBucketService.uploadToBucket()` and `IntegrationManager` in `customClient.js` for org-scoped files.
- **Receipts (PRIVATE):** `supabase.storage.from('receipts').createSignedUrl(path, expiresIn)`.
- **Bank files (PRIVATE):** `supabase.storage.from('bank-details').createSignedUrl(path, expiresIn)`.

Rule: never call `getPublicUrl()` for `receipts` or `bank-details`.

## Applying bucket and policy changes

Run **`supabase/schema.postgres.sql`** in the SQL Editor, or `supabase db push`. That dump now includes public-read and `logo-%` write policies. Do not run `CREATE_BUCKET_NOW.sql`, `CREATE_POLICIES_ONLY.sql`, `VERIFY_BUCKET_SETUP.sql` (old create section), or `scripts/create-storage-buckets.sql` — those recreate the private/uid-path model and can drop logo policies.
