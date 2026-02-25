# Supabase Realtime

This app uses **Supabase Realtime** (postgres_changes) for live updates so the UI stays in sync when data changes (e.g. invoice status, new payments, quote updates).

## How it works

- **Postgres Changes**: We subscribe to `INSERT`, `UPDATE`, and `DELETE` on specific tables. Supabase broadcasts these events to connected clients. **RLS applies**: you only receive events for rows you are allowed to select.
- **Tables in publication**: The following tables are added to the `supabase_realtime` publication (in `supabase/schema.postgres.sql`) so they emit events:
  - `invoices`
  - `quotes`
  - `payments`
  - `clients`
  - `notifications`
  - `profiles` (for profile and logo auto-update when settings change in another tab or from admin)

If a table is not in the publication, subscriptions for that table will not receive events. You can add more in the Supabase Dashboard under **Database → Replication** or via SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;
```

## App usage

### Hook: `useSupabaseRealtime`

- **Location**: `src/hooks/useSupabaseRealtime.js`
- **Usage**: Pass an array of table names and a callback. The callback is invoked with `{ table, eventType, new, old }` on any change.

```js
useSupabaseRealtime(
  ["invoices", "payments"],
  (payload) => {
    // payload: { table, eventType: 'INSERT'|'UPDATE'|'DELETE', new, old }
    refetch();
  },
  { channelName: "my-page" } // optional; default "realtime-db-changes"
);
```

### Where it’s used

- **Invoices page** (`src/pages/Invoices.jsx`): Subscribes to `invoices` and `payments`. On any change, the list is refetched so status changes and new payments appear without a manual refresh.
- **Quotes page** (`src/pages/Quotes.jsx`): Subscribes to `quotes`. List updates when quotes are created, updated, or deleted.
- **NotificationBell** (`src/components/notifications/NotificationBell.jsx`): Subscribes to `notifications` for live notification updates (table must be in the realtime publication if you use it).
- **AuthContext** (`src/components/auth/AuthContext.jsx`): Subscribes to `profiles` when the user is logged in. On any change to the current user’s profile row (e.g. logo upload, company name), it calls `refreshUser()` so the app’s user state and UI (header logo, Settings form, PDFs) auto-update without a full reload.

## Enabling Realtime for a new table

1. Add the table to the publication (schema or SQL Editor):

   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;
   ```

2. In your page or component, use the hook:

   ```js
   useSupabaseRealtime(["your_table"], () => refetch(), { channelName: "your-channel" });
   ```

## Limits and behavior

- One subscription can listen to multiple tables on the same channel; use a unique `channelName` per page/feature to avoid conflicts.
- If the channel reports `CHANNEL_ERROR`, check that the table is in the `supabase_realtime` publication and that Realtime is enabled for the project.
- High churn on large tables can mean many events; prefer refetch or targeted merge in the callback to keep the UI responsive.
