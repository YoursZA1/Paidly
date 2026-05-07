-- Optional profiles columns for persisting reminder configuration per user.
-- Run in Supabase SQL Editor if Payment / quote reminder settings should survive reload and sync across devices.

alter table public.profiles
  add column if not exists reminder_settings jsonb;

alter table public.profiles
  add column if not exists quote_reminder_settings jsonb;
