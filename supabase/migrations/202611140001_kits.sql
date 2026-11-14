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
