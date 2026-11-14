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
  last_error text,
  unique(reminder_id, item_index, is_demo)
);
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
returns boolean language plpgsql set search_path = public as $$
declare v_row public.reminders; v_kit public.kits;
begin
  select * into v_row from public.reminders where confirm_hash = p_hash for update;
  if not found then return false; end if;
  -- An already consumed link never re-enables a later unsubscribe.
  if v_row.confirmed_at is not null and v_row.unsubscribed_at is null then return true; end if;
  if v_row.confirm_expires_at <= now() then return false; end if;
  select * into v_kit from public.kits where id = v_row.kit_id;
  update public.reminders set confirmed_at = now(), unsubscribed_at = null,
    confirm_expires_at = now() where id = v_row.id;
  insert into public.reminder_deliveries(reminder_id, item_index, item_name, due_at)
    select v_row.id, (item.ordinality - 1)::integer,
      item.value #>> '{pick,product,name}',
      v_kit.created_at + ((item.value #>> '{pick,lifespanMonths}')::numeric * 30.4 * interval '1 day')
    from jsonb_array_elements(v_kit.items) with ordinality as item(value, ordinality)
    on conflict (reminder_id, item_index, is_demo) do update set canceled_at = null
      where reminder_deliveries.sent_at is null;
  return true;
end $$;

create function public.unsubscribe_reminder(p_token text)
returns boolean language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  update public.reminders set unsubscribed_at = now(), confirm_expires_at = now()
    where unsubscribe_token = p_token returning id into v_id;
  if v_id is null then return false; end if;
  update public.reminder_deliveries set canceled_at = now() where reminder_id = v_id and sent_at is null;
  return true;
end $$;

create function public.queue_demo_reminders(p_slug text)
returns integer language plpgsql set search_path = public as $$
declare v_count integer;
begin
  insert into public.reminder_deliveries(reminder_id, item_index, item_name, due_at, is_demo)
    select r.id, 0, 'Demo: your first kit item', now(), true from public.reminders r
    join public.kits k on k.id = r.kit_id
    where k.slug = p_slug and r.confirmed_at is not null and r.unsubscribed_at is null
    on conflict do nothing;
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
