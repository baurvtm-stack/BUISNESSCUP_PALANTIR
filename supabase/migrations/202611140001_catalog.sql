-- Canonical catalog: server-owned, never writable through a public Supabase key.
create table public.products (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,95}$'),
  brand text not null check (length(brand) between 1 and 100),
  model text not null check (length(model) between 1 and 240),
  category text not null check (category in ('boots','gloves','eyewear','hearing','head','hivis','outerwear','shirt','pants')),
  gender text not null check (gender in ('men','women','unisex')),
  price_usd numeric(10,2) not null check (price_usd > 0 and price_usd <= 10000),
  price_approximate boolean not null default true check (price_approximate),
  last_checked date not null,
  -- GearFit planning estimates at 20, 40 and 60 hours/week, NOT rated PPE expiry dates.
  lifespan_months jsonb not null check (
    jsonb_typeof(lifespan_months) = 'object'
    and lifespan_months ?& array['light','moderate','heavy']
    and jsonb_typeof(lifespan_months->'light') = 'number'
    and jsonb_typeof(lifespan_months->'moderate') = 'number'
    and jsonb_typeof(lifespan_months->'heavy') = 'number'
    and (lifespan_months->>'heavy')::numeric > 0
    and (lifespan_months->>'moderate')::numeric >= (lifespan_months->>'heavy')::numeric
    and (lifespan_months->>'light')::numeric >= (lifespan_months->>'moderate')::numeric
    and (lifespan_months->>'light')::numeric <= 240
  ),
  sizes text[] not null check (cardinality(sizes) between 1 and 250 and array_position(sizes, null) is null),
  climate text[] not null default '{}' check (climate <@ array['hot','mild','cold','wet']::text[] and array_position(climate, null) is null),
  retailer_url text not null check (retailer_url ~ '^https://' and length(retailer_url) <= 2048),
  source_url text not null check (source_url ~ '^https://' and length(source_url) <= 2048),
  standards text[] not null default '{}' check (cardinality(standards) <= 20 and array_position(standards, null) is null),
  quality numeric(3,1) not null check (quality between 1 and 10),
  features text[] not null default '{}' check (
    features <@ array['safety_toe','composite_toe','eh','puncture','slip','waterproof','insulated',
      'impact','welding','chemical','touchscreen','z87plus','anti_fog','tinted','electronic',
      'bluetooth','class_e','type_2','fr','hivis','knee_pads','lightweight','stretch']::text[]
    and array_position(features, null) is null
  ),
  cut_level smallint check (cut_level between 1 and 9),
  nrr numeric(4,1) check (nrr > 0 and nrr <= 40),
  hivis_class smallint check (hivis_class in (2,3)),
  pack text check (length(pack) <= 120),
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index products_category_id_idx on public.products(category, id);
alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
grant select, insert, update, delete on public.products to service_role;

comment on table public.products is 'GearFit catalog; service-role access only. Prices approximate, lifespans estimates.';
