-- Fix: "control reached end of trigger procedure without RETURN"
-- Ensures all Invoices table trigger functions return a value in every execution path.
-- Run this in Supabase SQL Editor.

-- 1. update_updated_at_column (BEFORE UPDATE) - must return NEW
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. notify_activity (AFTER UPDATE) - must return NEW; wrap insert in exception so failures don't prevent return
create or replace function public.notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
  target_user_id uuid;
begin
  target_user_id := null;
  msg := null;

  if tg_table_name = 'invoices' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      if new.status = 'viewed' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' was viewed by the client.';
      elsif new.status = 'paid' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' has been fully paid.';
      elsif new.status = 'partial_paid' then
        msg := 'A payment was received for Invoice #' || coalesce(new.invoice_number, '') || ' (partial).';
      end if;
    end if;
  elsif tg_table_name = 'quotes' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      if new.status = 'viewed' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was viewed by the client.';
      elsif new.status = 'accepted' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was accepted.';
      end if;
    end if;
  end if;

  if target_user_id is not null and msg is not null then
    begin
      insert into public.notifications (user_id, message, read)
      values (target_user_id, msg, false);
    exception when others then
      raise notice 'notify_activity: failed to insert notification: %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;

-- Verify triggers exist
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_table = 'invoices';
