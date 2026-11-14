-- The catalog/click migrations from PR #2 are prerequisites. Count real rows.
create function public.retention_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'kitsCreated', (select count(*) from kits),
    'clicks', (select count(*) from public.clicks),
    'clickTrackingAvailable', true,
    'reminderSignups', (select count(*) from reminders),
    'confirmedReminders', (select count(*) from reminders where confirmed_at is not null and unsubscribed_at is null),
    'proConversions', (select count(distinct email) from subscriptions where activated_at is not null),
    'activePro', (select count(distinct email) from subscriptions where status in ('active', 'trialing') and current_period_end > now()),
    'stripeMode', 'test'
  );
end $$;
revoke all on function public.retention_stats() from public, anon, authenticated;
grant execute on function public.retention_stats() to service_role;
