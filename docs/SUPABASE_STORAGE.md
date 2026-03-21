# Supabase Storage (Buckets)

This app uses Supabase Storage for file uploads and downloads (logos, invoices, receipts, bank files). All buckets are **private**; access is via **signed URLs** or (when applicable) RLS-based read.

## Buckets

| Bucket | Public | Use case | Path convention | Size limit |
|--------|--------|----------|-----------------|------------|
| **paidly** | No | General files, branding, invoices, PDFs | `org_id/folder/filename` or `user_id/logo.*` | 50 MB |
| **profile-logos** | No | User/company logos | `user_id/logo.{ext}` | 5 MB |
| **activities** | No | Receipts, attachments, exports | `org_id/...` (e.g. `org_id/receipts/...`) | 50 MB |
| **bank-details** | No | Bank statements, import files | `org_id/...` (e.g. `org_id/imports/...`) | 50 MB |

- **Private** means files are not reachable by unauthenticated users. Use `createSignedUrl()` for time-limited download links, or ensure the client is authenticated when reading.
- Path conventions matter: RLS policies allow access when the first path segment is either `auth.uid()` (user-owned) or the user’s `org_id` (org-owned).

## Bucket policies (RLS)

Defined in `supabase/schema.postgres.sql` on `storage.objects`:

1. **User-owned (logos)**  
   - **Insert / Select**: `bucket_id IN ('paidly', 'profile-logos')` and first path segment = `auth.uid()::text`.  
   - **Update / Delete**: Same buckets and path rule so users can replace or remove their own logos.

2. **Org-scoped (assets, activities, bank-details)**  
   - **All** (select, insert, update, delete): `bucket_id IN ('paidly', 'profile-logos', 'activities', 'bank-details')` and first path segment = `org_id` for a membership of the current user.  
   - Use paths like `org_id/activities/...` or `org_id/bank-details/...` so org members can access.

3. **Admin**  
   - **All**: Full access to the same four buckets when `public.is_admin()` is true.

## App integration

- **Logos**: `SupabaseStorageService.uploadProfileLogo(file, userId)` → uploads to `profile-logos` (or `paidly`) at `userId/logo.{ext}`, returns a signed URL. Used by Settings, SetupWizard, onboarding.
- **General uploads (branding, private)**: `breakApi.integrations.Core.UploadFile({ file })` uses `paidly` with path `orgId/branding/...` or `orgId/private/...` (see `customClient.js` IntegrationManager).
- **Activities / bank-details**: `uploadToBucket(file, 'activities', path)` and `uploadToBucket(file, 'bank-details', path)` from `SupabaseMultiBucketService`. Use **org_id** as the first path segment (e.g. `orgId/receipts/filename`) so RLS allows access.
- **Download**: Use `supabase.storage.from(bucket).createSignedUrl(path, expiresIn)` for private buckets, or `getPublicUrl(path)` only if the bucket were public (current buckets are private).

## Applying bucket and policy changes

Run the Supabase schema so buckets and policies exist:

- From project root: run `supabase/schema.postgres.sql` in the Supabase SQL Editor, or use `supabase db push` if you use Supabase CLI and migrations.

New buckets and policy updates (e.g. adding `activities`, `bank-details`, or user update/delete) are included in that schema.
