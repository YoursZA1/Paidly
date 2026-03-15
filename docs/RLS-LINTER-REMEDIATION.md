# Supabase RLS Linter Remediation

This doc summarizes the Database Linter warnings for Row Level Security (RLS) and what was done to fix them.

## 1. Auth RLS InitPlan (PERFORMANCE)

**Issue:** Policies that call `auth.uid()`, `auth.jwt()`, or `current_setting()` directly are re-evaluated **per row**, which hurts performance at scale.

**Fix:** Use a scalar subquery so Postgres evaluates once per query (InitPlan):

- `auth.uid()` → `(select auth.uid())`
- `auth.jwt()` → `(select auth.jwt())`
- `current_setting('...')` → `(select current_setting('...'))`

**References:**

- [Supabase: Call functions with SELECT](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
- [Linter remediation 0003](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)

**What we did:**

- **`public.is_admin()`** – Updated to use `(select auth.jwt())` inside the function so all admin policies that call `is_admin()` benefit.
- **`supabase/schema.postgres.sql`** – Every RLS policy expression that used `auth.uid()` was changed to `(select auth.uid())`.
- **Migration** – `supabase/migrations/20250308000000_rls_auth_initplan_fix.sql` updates `is_admin()` for existing databases. For existing policies, re-apply the policy section of `schema.postgres.sql` (or re-run the schema) so all policies use the `(select auth.uid())` form.

**Tables affected (from linter):**  
admin_users, organizations, memberships, clients, services, profiles, quotes, quote_items, invoices, invoice_items, payments, banking_details, recurring_invoices, packages, notifications, invoice_views, expenses, tasks, payslips, notes, business_goals.

---

## 2. Multiple Permissive Policies (PERFORMANCE)

**Issue:** Multiple **permissive** RLS policies for the same role and action (e.g. SELECT) on a table cause the planner to run **all** of them; any one true allows access. That can be slower than a single policy.

**Fix:** Merge into one policy per (table, role, command) where possible, using `OR`:

- Example: instead of policy A “admin full access” and policy B “org members select”, use one policy: `USING (public.is_admin() OR (org member condition))`.

**Reference:**  
[Linter remediation 0006](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

**Current design:**  
We keep separate “admin full access” and “org members …” policies on purpose (clearer to read and to change). Consolidating would mean one larger policy per table/action with `is_admin() OR …`.  

**Optional follow-up:**  
If you want to clear the “multiple permissive policies” warnings and are okay merging admin + org logic, add a migration per table that:

1. Drops the “admin full access …” and “org members …” policies for that table/action.
2. Creates a single policy whose `USING` / `WITH CHECK` is `public.is_admin() OR (existing org member expression)`.

---

## Applying the fixes

- **New projects / fresh DB:** Use `supabase/schema.postgres.sql` as-is; it already includes the InitPlan fixes.
- **Existing project:** Run the migration `20250308000000_rls_auth_initplan_fix.sql` to fix `is_admin()`. To fix existing policies that still use bare `auth.uid()`, re-apply the CREATE POLICY statements from `schema.postgres.sql` (the policy section) in the Supabase SQL Editor or via a follow-up migration that drops and recreates those policies with `(select auth.uid())`.
