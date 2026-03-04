-- Activity notifications: notify document owner when invoice/quote status changes (viewed, paid, accepted).
-- Run this in Supabase SQL Editor after applying the main schema. Requires public.notifications (user_id, message, read).
-- Ensures the bell shows: "Invoice #X was viewed", "Invoice #X has been fully paid", "Quote #X was viewed/accepted", etc.

-- Function: insert notification for a user (runs with definer rights so we can insert for document owner)
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
    insert into public.notifications (user_id, message, read)
    values (target_user_id, msg, false);
  end if;

  return new;
end;
$$;

-- Trigger on invoices
drop trigger if exists activity_notify_invoices on public.invoices;
create trigger activity_notify_invoices
  after update on public.invoices
  for each row
  execute function public.notify_activity();

-- Trigger on quotes
drop trigger if exists activity_notify_quotes on public.quotes;
create trigger activity_notify_quotes
  after update on public.quotes
  for each row
  execute function public.notify_activity();
