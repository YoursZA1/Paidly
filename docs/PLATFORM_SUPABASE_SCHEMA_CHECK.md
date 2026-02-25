# Platform–Supabase Schema Communication Check

This doc describes how the platform (frontend + EntityManager) communicates with the Supabase schema and how to verify that the **new tables** (payslips, expenses, tasks, and related) work correctly with Supabase data.

---

## 1. Environment

The app talks to Supabase only when these are set:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (Dashboard → Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key (never use service_role in frontend) |

- **Where:** Copy `.env.example` to `.env` and fill values.
- **Check:** If either is missing, `src/lib/supabaseClient.js` throws on load.

---

## 2. Entity → Supabase Table Mapping (New Schema)

EntityManager in **`src/api/customClient.js`** maps entities to Supabase tables. New/CSV-aligned tables:

| App entity | Supabase table | Notes |
|------------|----------------|------|
| Payroll | `payslips` | Entity name "Payroll" → table "payrolls" is remapped to **payslips** |
| Expense | `expenses` | Direct: "Expense" → "expenses" |
| Task | `tasks` | Direct: "Task" → "tasks" |

For all of these:

- **List/Get:** `supabase.from(<table>).select('*').eq('org_id', orgId)` (org from `memberships`).
- **Create:** `org_id` and `created_by_id` (current user) are set by the client before insert.
- **Update/Delete:** Filtered by `org_id` so users only touch their org’s rows.

---

## 3. Tables and RLS (New Schema)

| Table | Purpose | RLS |
|-------|---------|-----|
| `public.payslips` | Payslip_export.csv; Payroll entity | Admin full access; org members select/write |
| `public.expenses` | Expense_export.csv; Expense entity | Admin full access; org members select/write |
| `public.tasks` | Task_export.csv; Task entity | Admin full access; org members select/write |

- **Ensure scripts:** If the main migration was not run, use:
  - **`scripts/ensure-payslips-schema.sql`**
  - **`scripts/ensure-expenses-schema.sql`**
  - **`scripts/ensure-tasks-schema.sql`**
- **Dependencies:** `organizations`, `memberships` must exist. `ensure-tasks-schema` also expects `public.clients` (for `client_id` FK).

---

## 4. Verifying Platform–Schema Communication

### 4.1 Run the verification script

From the project root:

```bash
node scripts/check-entity-manager.js
```

This checks that customClient:

- Gets `org_id` from memberships and filters by it.
- Maps Payroll → payslips and includes payslips, expenses, tasks in the org_id filter list.
- Sets `created_by_id` for payslips, expenses, and tasks on create.

**Expected:** All items show ✅ and the script exits with code 0.

### 4.2 Ensure Supabase schema exists

- Either run the full **`supabase/schema.postgres.sql`** in the Supabase SQL Editor, or
- Run the individual **`scripts/ensure-*-schema.sql`** for payslips, expenses, and tasks.

Then in Supabase Dashboard → Table Editor, confirm:

- `payslips`
- `expenses`
- `tasks`

exist and have the expected columns (see `supabase/schema.postgres.sql` or the ensure scripts).

### 4.3 Test in the app

1. **Login** with a user that has a membership and `org_id`.
2. **Payslips:** Create a payslip (Payslips → Create; or Import CSV). List/export and confirm data appears and is scoped to your org.
3. **Expenses:** Create an expense (Cash Flow → Expenses tab; or Import CSV). List/export and confirm the same.
4. **Tasks:** Create a task (Calendar → Task Management; or Import CSV). List/export and confirm the same.
5. **Cross-org:** With RLS, a second user in a different org should not see the first user’s payslips/expenses/tasks.

---

## 5. Data Flow Summary

| Page / feature | Entity | Supabase table | Create/update path |
|----------------|--------|-----------------|--------------------|
| Payslips | Payroll | payslips | customClient create/update/delete with org_id + created_by_id |
| Create Payslip | Payroll | payslips | Payroll.create() → customClient → supabase.from('payslips').insert() |
| Cash Flow (Expenses) | Expense | expenses | Expense.create/update/delete → customClient → supabase.from('expenses') |
| Calendar (Tasks) | Task | tasks | Task.create/update/delete → customClient → supabase.from('tasks') |
| CSV import/export | Payroll / Expense / Task | payslips / expenses / tasks | Same EntityManager path; CSV mapping in `src/utils/*CsvMapping.js` |

All reads go through EntityManager’s `list()` / `get()`, which call `pullFromSupabase()` and filter by `org_id` for these tables.

---

## 6. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| "Missing Supabase env vars" | Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. |
| "No organization found for user" | User must have a row in `memberships` (and an org in `organizations`). Run the membership fix SQL from CHECK_CLIENT_SAVE_ISSUE.sql if needed. |
| Payslips/expenses/tasks not loading | 1) Run the ensure script for that table. 2) Confirm RLS policies exist. 3) Confirm user is authenticated and has org membership. |
| Insert/update fails (e.g. column does not exist) | customClient whitelists columns (e.g. PAYSLIP_INSERT_COLUMNS). Ensure schema and whitelist in `src/api/customClient.js` match. |
| Other org’s data visible | RLS should prevent this; verify "org members select" (and write) policies exist and that the app uses the anon key (RLS is applied). |

---

## 7. Related docs

- **`docs/CLIENT_CSV_AND_TABLE_MAPPING.md`** – CSV columns and table mapping for clients, banking, invoices, quotes, payslips, expenses, tasks.
- **`docs/SUPABASE_INTEGRATION_CHECKLIST.md`** – Full Supabase integration checklist.
- **`docs/SUPABASE_SETUP_AND_MAINTENANCE.md`** – Setup and maintenance.
