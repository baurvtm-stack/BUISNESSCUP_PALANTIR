-- Does not create/alter the click engineer's table. If absent, clicks is null.
create function public.retention_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare click_count bigint := null;
begin
  if to_regclass('public.clicks') is not null then
    execute 'select count(*) from public.clicks' into click_count;
  end if;
  return jsonb_build_object(
    'kitsCreated', (select count(*) from kits),
    'clicks', click_count,
    'clickTrackingAvailable', click_count is not null,
    'reminderSignups', (select count(*) from reminders),
    'confirmedReminders', (select count(*) from reminders where confirmed_at is not null and unsubscribed_at is null),
    'proConversions', (select count(distinct email) from subscriptions where activated_at is not null),
    'activePro', (select count(distinct email) from subscriptions where status = 'active' and current_period_end > now()),
    'stripeMode', 'test'
  );
end $$;
revoke all on function public.retention_stats() from public, anon, authenticated;
grant execute on function public.retention_stats() to service_role;
