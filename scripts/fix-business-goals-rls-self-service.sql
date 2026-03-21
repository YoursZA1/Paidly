-- Allow any signed-in user to manage their own business_goals row (not only org owner).
-- Fixes "Could not save goal" / RLS for members and legacy accounts without owner membership shape.
-- Run in Supabase SQL Editor after ensure-business-goals-schema.sql.

drop policy if exists "owner insert business_goals" on public.business_goals;
drop policy if exists "owner update business_goals" on public.business_goals;
drop policy if exists "owner delete business_goals" on public.business_goals;

create policy "users insert own business_goals" on public.business_goals
  for insert
  with check (user_id = (select auth.uid()));

create policy "users update own business_goals" on public.business_goals
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete own business_goals" on public.business_goals
  for delete
  using (user_id = (select auth.uid()));
