-- Clicking a notification opens the record it is about.
alter table if exists public.notifications
  add column if not exists link text;

create or replace function public.notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
  target_user_id uuid;
  target_link text;
begin
  target_user_id := null;
  msg := null;
  target_link := null;

  if tg_table_name = 'invoices' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      target_link := '/ViewInvoice?id=' || new.id::text;
      if new.status = 'viewed' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' was viewed by the client.';
      elsif new.status = 'paid' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' has been fully paid.';
      elsif new.status in ('partially_paid', 'partial_paid') then
        msg := 'A payment was received for Invoice #' || coalesce(new.invoice_number, '') || ' (partial).';
      end if;
    end if;
  elsif tg_table_name = 'quotes' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      target_link := '/ViewQuote?id=' || new.id::text;
      if new.status = 'viewed' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was viewed by the client.';
      elsif new.status = 'accepted' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was accepted.';
      end if;
    end if;
  end if;

  if target_user_id is not null and msg is not null then
    begin
      insert into public.notifications (user_id, message, read, link)
      values (target_user_id, msg, false, target_link);
    exception when others then
      raise notice 'notify_activity: failed to insert notification: %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;
