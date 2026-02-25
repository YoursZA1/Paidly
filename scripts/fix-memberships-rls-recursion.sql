-- Fix: infinite recursion in RLS policy for relation "memberships"
-- Cause: "memberships org access" queried public.memberships inside its USING clause,
-- so evaluating the policy triggered the same policy again.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query), then run.

drop policy if exists "memberships org access" on public.memberships;

-- Non-recursive: allow SELECT if the row is the current user's membership,
-- or if the current user is the org owner (via organizations only, no memberships read).
create policy "memberships org access" on public.memberships
  for select
  using (
    memberships.user_id = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = memberships.org_id and o.owner_id = auth.uid()
    )
  );
