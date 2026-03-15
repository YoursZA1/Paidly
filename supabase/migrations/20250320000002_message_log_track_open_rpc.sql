-- Allow public (anon) to record that a trackable link was opened; used from /view/:shareToken?tracking=:tracking_token
create or replace function public.record_message_log_open(p_tracking_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tracking_token is null or length(trim(p_tracking_token)) = 0 then
    return;
  end if;
  update public.message_logs
  set opened_at = now(),
      viewed = true
  where tracking_token = p_tracking_token;
end;
$$;

grant execute on function public.record_message_log_open(text) to anon;
grant execute on function public.record_message_log_open(text) to authenticated;

comment on function public.record_message_log_open(text) is 'Record that a trackable link was opened (called from public invoice view with ?tracking= token)';
