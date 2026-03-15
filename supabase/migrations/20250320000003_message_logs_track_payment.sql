-- When an invoice is marked paid, update message_logs so Sent documents / Messages can show paid + payment_date
create or replace function public.message_logs_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' then
    update public.message_logs
    set paid = true,
        payment_date = now()
    where document_type = 'invoice'
      and document_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists message_logs_track_payment on public.invoices;
create trigger message_logs_track_payment
  after update of status on public.invoices
  for each row
  when (new.status = 'paid')
  execute function public.message_logs_on_invoice_paid();

comment on function public.message_logs_on_invoice_paid() is 'Set message_logs.paid and payment_date when invoice status becomes paid';
