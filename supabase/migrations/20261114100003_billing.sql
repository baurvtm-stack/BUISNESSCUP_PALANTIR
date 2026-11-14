-- Test-mode billing. Access is bound to a checkout capability, never a claimed email.
create table public.pro_checkouts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  token_hash text not null unique,
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  id text primary key,
  email text not null,
  checkout_id uuid not null references public.pro_checkouts(id),
  customer_id text not null,
  status text not null,
  activated_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  event_created bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_email on public.subscriptions(email);
create index subscriptions_checkout_status on public.subscriptions(checkout_id,status);
create table public.stripe_events (id text primary key, created_at timestamptz not null default now());
create table public.wear_entries (
  checkout_id uuid not null references public.pro_checkouts(id),
  kit_slug text not null references public.kits(slug),
  product_id text not null,
  worn_on date not null,
  hours numeric not null check(hours >= 0 and hours <= 24),
  primary key(checkout_id,kit_slug,product_id,worn_on)
);
create table public.pro_deal_alerts (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.pro_checkouts(id),
  email text not null,
  kit_slug text not null references public.kits(slug),
  enabled boolean not null default true,
  last_notified_at timestamptz,
  last_checked_at timestamptz not null default '1970-01-01',
  created_at timestamptz not null default now(),
  unique(checkout_id,kit_slug)
);
alter table public.pro_checkouts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.wear_entries enable row level security;
alter table public.pro_deal_alerts enable row level security;
revoke all on public.pro_checkouts, public.subscriptions, public.stripe_events, public.wear_entries, public.pro_deal_alerts from anon, authenticated;
grant all on public.pro_checkouts, public.subscriptions, public.stripe_events, public.wear_entries, public.pro_deal_alerts to service_role;

create or replace function public.apply_stripe_subscription(
  p_event_id text, p_event_created bigint, p_subscription_id text, p_checkout_id uuid,
  p_email text, p_status text, p_customer_id text, p_cancel_at_period_end boolean,
  p_current_period_end timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into stripe_events(id) values(p_event_id) on conflict do nothing;
  if not found then return; end if;
  insert into subscriptions(id,email,checkout_id,customer_id,status,event_created,cancel_at_period_end,activated_at,current_period_end)
    values(p_subscription_id,p_email,p_checkout_id,p_customer_id,p_status,p_event_created,p_cancel_at_period_end,
      case when p_status='active' then now() else null end,p_current_period_end)
  on conflict(id) do update set email=excluded.email, status=excluded.status,
    event_created=excluded.event_created, cancel_at_period_end=excluded.cancel_at_period_end, updated_at=now(),
    activated_at=coalesce(subscriptions.activated_at,excluded.activated_at), current_period_end=excluded.current_period_end
  where subscriptions.event_created <= excluded.event_created
    and (subscriptions.status <> 'canceled' or excluded.status = 'canceled');
end;
$$;
revoke all on function public.apply_stripe_subscription(text,bigint,text,uuid,text,text,text,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(text,bigint,text,uuid,text,text,text,boolean,timestamptz) to service_role;

create table public.deal_alert_deliveries (
  alert_id uuid not null references public.pro_deal_alerts(id),
  fingerprint text not null,
  first_attempt_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key(alert_id,fingerprint)
);
alter table public.deal_alert_deliveries enable row level security;
revoke all on public.deal_alert_deliveries from anon, authenticated;
grant all on public.deal_alert_deliveries to service_role;
-- Retry only inside Resend's 24-hour idempotency window. Old ambiguous sends
-- need manual review; never automatically risk duplicating promotional mail.
create or replace function public.claim_deal_delivery(p_alert_id uuid,p_fingerprint text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into deal_alert_deliveries(alert_id,fingerprint) values(p_alert_id,p_fingerprint)
  on conflict(alert_id,fingerprint) do update set claimed_at=now()
    where deal_alert_deliveries.sent_at is null
      and deal_alert_deliveries.claimed_at < now()-interval '5 minutes'
      and deal_alert_deliveries.first_attempt_at > now()-interval '23 hours';
  return found;
end;
$$;
revoke all on function public.claim_deal_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_deal_delivery(uuid,text) to service_role;
