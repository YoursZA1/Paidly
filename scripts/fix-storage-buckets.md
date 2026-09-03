# DEPRECATED: Storage bucket setup scripts retired

This guide has been replaced by the canonical storage configuration in:
- `supabase/schema.postgres.sql`
- `supabase/migrations/` (for additional RLS/policy setup)

NEVER paste or execute `scripts/create-storage-buckets.sql` on production.

## Final visibility contract
- `paidly` bucket: **PUBLIC** (`public = true`) — public URLs must work (logos, public invoice/previews).
- `receipts` and `bank-details`: **PRIVATE** (`public = false`) — must be accessed via signed URLs.

## Verify in Supabase SQL Editor
```sql
SELECT id, public
FROM storage.buckets
WHERE id IN ('paidly', 'receipts', 'bank-details');
```

Then verify any required RLS policies are present (see `supabase/schema.postgres.sql` and migrations).
