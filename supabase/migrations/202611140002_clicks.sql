create table public.clicks (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id),
  kit_id text check (length(kit_id) between 1 and 2000 and kit_id ~ '^[a-zA-Z0-9_-]+$'),
  created_at timestamptz not null default now()
);

create index clicks_product_created_idx on public.clicks(product_id, created_at desc);
create index clicks_created_idx on public.clicks(created_at desc);
create index clicks_kit_idx on public.clicks(kit_id) where kit_id is not null;
alter table public.clicks enable row level security;
revoke all on public.clicks from public, anon, authenticated;
grant select, insert, delete on public.clicks to service_role;

comment on table public.clicks is 'Outbound events, not unique people or purchases. No IP addresses or user-agent data stored.';
