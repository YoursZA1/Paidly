# Purge user storage after account deletion

Public data (profiles, orgs, invoices, etc.) is handled by Postgres FKs and the trigger `purge_public_user_data_before_auth_delete` (see `supabase/migrations/20260404120000_auth_user_delete_purge_public_data.sql`). **Storage objects** (logos) are not removed by SQL alone.

## When storage is purged automatically

- **Node API** `DELETE /api/admin/users/:userId` and **POST /api/account/delete** call `purgeUserStorageAssets` before `auth.admin.deleteUser`.

## When you need this guide

- A user was deleted in **Supabase Dashboard → Authentication → Users**, or via SQL on `auth.users`, **without** going through the Node API.

Then either run the **CLI script** below or wire the **Edge Function** with a webhook.

---

## Option 1: Admin CLI script (quickest)

From the repo root (loads `server/.env` if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not already set):

```bash
node scripts/purge-user-storage.mjs '<USER_UUID>'
```

Or explicitly:

```bash
SUPABASE_URL='https://YOUR_PROJECT.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='your-service-role-jwt' \
node scripts/purge-user-storage.mjs '<USER_UUID>'
```

npm shortcut:

```bash
npm run purge-user-storage -- '<USER_UUID>'
```

---

## Option 2: Edge Function `purge-user-storage`

### 1. Deploy

```bash
npx supabase functions deploy purge-user-storage --project-ref YOUR_PROJECT_REF
```

### 2. Set secrets

In **Dashboard → Edge Functions → purge-user-storage → Secrets** (or CLI):

```bash
npx supabase secrets set PURGE_USER_STORAGE_SECRET='a-long-random-string' --project-ref YOUR_PROJECT_REF
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for Edge Functions.

### 3. Call manually (test)

```bash
curl -sS -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/purge-user-storage" \
  -H "Authorization: Bearer YOUR_PURGE_USER_STORAGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_UUID_HERE"}'
```

### 4. Invoke on user delete (webhook)

Supabase products evolve; use whichever applies to your project:

1. **Database Webhooks** (Dashboard → **Database** → **Webhooks**): if you can target `auth.users` **DELETE**, add a webhook that **HTTP POST**s to  
   `https://YOUR_PROJECT.supabase.co/functions/v1/purge-user-storage`  
   with headers:
   - `Authorization: Bearer <PURGE_USER_STORAGE_SECRET>`
   - `Content-Type: application/json`  
   and a JSON body that includes the deleted user’s id.  
   If the webhook payload uses a different shape, add a small **Supabase Function** wrapper that maps the payload to `{ "userId": "..." }` and forwards to this function.

2. **Auth hooks** (if your plan exposes a “user deleted” hook): point it at the same URL and secret, mapping the event payload to `{ "userId": "<deleted_user_id>" }`.

3. **`pg_net` from Postgres** (advanced): enable `pg_net` and schedule `net.http_post` from an `AFTER DELETE` trigger on `auth.users` to the function URL with the shared secret. Prefer Dashboard webhooks when available so URLs and secrets are not hard-coded in migrations.

---

## Security

- Treat `PURGE_USER_STORAGE_SECRET` like a password; anyone with it can ask the function to delete storage paths for any UUID.
- Do **not** expose this secret in the browser or commit it to git.
