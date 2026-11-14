-- Apply once, after the catalog/click migrations. No retention migrations may already be applied.
BEGIN;

-- 20261114100001_kits.sql
-- Apply to the SAME Supabase project used by click tracking.
create table public.kits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]{12}$'),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.kits enable row level security;
revoke all on public.kits from anon, authenticated;
grant all on public.kits to service_role;

create table public.retention_rate_limits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
create index retention_rate_expiry on public.retention_rate_limits(expires_at);
alter table public.retention_rate_limits enable row level security;
revoke all on public.retention_rate_limits from anon, authenticated;
grant all on public.retention_rate_limits to service_role;

create function public.retention_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Invalid limit'; end if;
  -- Expired keys are cheap to prune through the expiry index, keeping storage bounded.
  delete from retention_rate_limits where expires_at < now();
  insert into retention_rate_limits(key, hits, expires_at)
    values(p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict(key) do update set hits = least(retention_rate_limits.hits + 1, p_limit + 1)
  returning hits into n;
  return n <= p_limit;
end;
$$;
revoke all on function public.retention_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.retention_rate_limit(text,integer,integer) to service_role;

-- 20261114100002_reminders.sql
-- Run after the core migration in the SAME Supabase project.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kit_id uuid not null references public.kits(id) on delete cascade,
  confirm_hash text not null unique,
  confirm_expires_at timestamptz not null,
  unsubscribe_token text not null unique,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(email, kit_id)
);
create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  item_index integer not null,
  item_name text not null,
  due_at timestamptz not null,
  is_demo boolean not null default false,
  sent_at timestamptz,
  canceled_at timestamptz,
  claim_until timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
-- Real replacement jobs are unique; every deliberate demo gets a fresh ID.
create unique index reminder_deliveries_real_item_idx
  on public.reminder_deliveries(reminder_id, item_index) where is_demo = false;
create index reminder_deliveries_due_idx on public.reminder_deliveries(due_at) where sent_at is null and canceled_at is null;
alter table public.reminders enable row level security;
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminders, public.reminder_deliveries from anon, authenticated;
grant all on public.reminders, public.reminder_deliveries to service_role;

create function public.register_reminder(p_email text, p_slug text, p_confirm_hash text, p_unsubscribe_token text)
returns boolean language plpgsql set search_path = public as $$
declare v_kit uuid; v_row public.reminders;
begin
  select id into v_kit from public.kits where slug = p_slug;
  if v_kit is null then raise exception 'kit_not_found'; end if;
  insert into public.reminders(email, kit_id, confirm_hash, confirm_expires_at, unsubscribe_token)
  values(p_email, v_kit, p_confirm_hash, now() + interval '24 hours', p_unsubscribe_token)
  on conflict(email, kit_id) do nothing;
  select * into v_row from public.reminders where email = p_email and kit_id = v_kit for update;
  if v_row.confirmed_at is not null and v_row.unsubscribed_at is null then return false; end if;
  update public.reminders set confirm_hash = p_confirm_hash, confirm_expires_at = now() + interval '24 hours'
    where id = v_row.id;
  return true;
end $$;

create function public.confirm_reminder(p_hash text)
returns jsonb language plpgsql set search_path = public as $$
declare v_row public.reminders; v_kit public.kits;
begin
  select * into v_row from public.reminders where confirm_hash = p_hash for update;
  if not found then return jsonb_build_object('status', 'invalid', 'slug', null); end if;
  select * into v_kit from public.kits where id = v_row.kit_id;
  -- An already consumed link never re-enables a later unsubscribe.
  if v_row.confirmed_at is not null and v_row.unsubscribed_at is null then
    return jsonb_build_object('status', 'confirmed', 'slug', v_kit.slug);
  end if;
  if v_row.confirm_expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'slug', v_kit.slug);
  end if;
  update public.reminders set confirmed_at = now(), unsubscribed_at = null,
    confirm_expires_at = now() where id = v_row.id;
  insert into public.reminder_deliveries(reminder_id, item_index, item_name, due_at)
    select v_row.id, (item.ordinality - 1)::integer,
      item.value #>> '{pick,product,name}',
      v_kit.created_at + ((item.value #>> '{pick,lifespanMonths}')::numeric * 30.4 * interval '1 day') - interval '7 days'
    from jsonb_array_elements(v_kit.items) with ordinality as item(value, ordinality)
    on conflict (reminder_id, item_index) where is_demo = false do update set canceled_at = null
      where reminder_deliveries.sent_at is null;
  return jsonb_build_object('status', 'confirmed', 'slug', v_kit.slug);
end $$;

create function public.unsubscribe_reminder(p_token text)
returns jsonb language plpgsql set search_path = public as $$
declare v_id uuid; v_kit_id uuid; v_slug text;
begin
  update public.reminders set unsubscribed_at = now(), confirm_expires_at = now()
    where unsubscribe_token = p_token returning id, kit_id into v_id, v_kit_id;
  if v_id is null then return jsonb_build_object('status', 'invalid', 'slug', null); end if;
  select slug into v_slug from public.kits where id = v_kit_id;
  update public.reminder_deliveries set canceled_at = now() where reminder_id = v_id and sent_at is null;
  return jsonb_build_object('status', 'unsubscribed', 'slug', v_slug);
end $$;

create function public.queue_demo_reminders(p_slug text)
returns integer language plpgsql set search_path = public as $$
declare v_count integer;
begin
  insert into public.reminder_deliveries(reminder_id, item_index, item_name, due_at, is_demo)
    select r.id, 0, k.items #>> '{0,pick,product,name}', now(), true from public.reminders r
    join public.kits k on k.id = r.kit_id
    where k.slug = p_slug and r.confirmed_at is not null and r.unsubscribed_at is null
      and jsonb_array_length(k.items) > 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- SKIP LOCKED prevents two cron invocations from sending the same delivery.
-- Ambiguous sends older than Resend's 24h idempotency window are quarantined
-- (first_attempt_at > 23h ago) for operator review rather than duplicated.
create function public.claim_reminder_delivery(p_demo boolean default false, p_slug text default null)
returns table(id uuid, reminder_id uuid, item_name text, email text, kit_slug text, unsubscribe_token text, is_demo boolean)
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  select d.id into v_id from public.reminder_deliveries d
  join public.reminders r on r.id = d.reminder_id join public.kits k on k.id = r.kit_id
  where d.sent_at is null and d.canceled_at is null and d.due_at <= now()
    and d.is_demo = p_demo and (p_slug is null or k.slug = p_slug)
    and r.confirmed_at is not null and r.unsubscribed_at is null
    and (d.claim_until is null or d.claim_until < now())
    and (d.first_attempt_at is null or d.first_attempt_at > now() - interval '23 hours')
  order by d.due_at for update of d skip locked limit 1;
  if v_id is null then return; end if;
  update public.reminder_deliveries d set claim_until = now() + interval '5 minutes',
    first_attempt_at = coalesce(d.first_attempt_at, now()), attempts = attempts + 1 where d.id = v_id;
  return query select d.id, r.id, d.item_name, r.email, k.slug, r.unsubscribe_token, d.is_demo
    from public.reminder_deliveries d join public.reminders r on r.id = d.reminder_id
    join public.kits k on k.id = r.kit_id where d.id = v_id;
end $$;

revoke all on function public.register_reminder(text,text,text,text), public.confirm_reminder(text),
  public.unsubscribe_reminder(text), public.queue_demo_reminders(text), public.claim_reminder_delivery(boolean,text) from public, anon, authenticated;
grant execute on function public.register_reminder(text,text,text,text), public.confirm_reminder(text),
  public.unsubscribe_reminder(text), public.queue_demo_reminders(text), public.claim_reminder_delivery(boolean,text) to service_role;

-- 20261114100003_billing.sql
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
      case when p_status in ('active', 'trialing') then now() else null end,p_current_period_end)
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

-- 20261114100004_stats.sql
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

NOTIFY pgrst, 'reload schema';
COMMIT;
