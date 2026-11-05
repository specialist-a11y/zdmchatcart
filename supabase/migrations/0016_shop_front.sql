-- Shop front upgrade (docs/improvements/sections/11b-shop-front.md) and Website results (section 11).
-- Run after 0015. Safe to run more than once.

-- Business: theme, specials strip, announcement bar, delivery zones and time slots ------------------
alter table public.businesses
  add column if not exists shop_theme text check (shop_theme is null or shop_theme in ('warm', 'fresh', 'bold', 'minimal')),
  add column if not exists special_text text check (special_text is null or char_length(special_text) <= 160),
  add column if not exists special_ends_at timestamptz,
  add column if not exists announcement text check (announcement is null or char_length(announcement) <= 160),
  -- [{"id":"a","name":"Zone A (5 km)","fee":10}]
  add column if not exists delivery_zones jsonb not null default '[]' check (jsonb_typeof(delivery_zones) = 'array'),
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists slot_minutes integer not null default 120 check (slot_minutes between 30 and 480);
grant select (shop_theme, special_text, special_ends_at, announcement, delivery_zones, pickup_enabled, slot_minutes)
  on public.businesses to anon, authenticated;

-- Products: more photos, ready days, lead time, a pairing and a badge -------------------------------
alter table public.products
  add column if not exists images text[] not null default '{}' check (cardinality(images) <= 8),
  add column if not exists ready_days text[] not null default '{}'
    check (ready_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  add column if not exists lead_days integer not null default 0 check (lead_days between 0 and 60),
  add column if not exists pairs_with uuid references public.products(id) on delete set null,
  add column if not exists badge text check (badge is null or badge in ('bestseller', 'new', 'preorder', 'none'));

-- Orders: the delivery or pickup slot, zone and address chosen at checkout --------------------------
alter table public.orders
  add column if not exists slot_at timestamptz,
  add column if not exists delivery_zone text check (delivery_zone is null or char_length(delivery_zone) <= 60),
  add column if not exists delivery_address text check (delivery_address is null or char_length(delivery_address) <= 300);

-- Shop visits and carts for the Website results strip --------------------------------------------
create table if not exists public.shop_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('visit', 'cart')),
  source text not null default 'direct' check (source in ('instagram', 'facebook', 'whatsapp', 'google', 'link', 'direct', 'other')),
  ref text check (ref is null or char_length(ref) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists shop_events_business on public.shop_events (business_id, created_at desc);
alter table public.shop_events enable row level security;
drop policy if exists "members read shop events" on public.shop_events;
create policy "members read shop events" on public.shop_events for select using (private.is_member(business_id) or private.is_staff());

-- The public shop page records a visit or a cart start. One function, no table access for anon.
create or replace function public.track_shop_event(p_slug text, p_kind text, p_source text default 'direct', p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  if p_kind not in ('visit', 'cart') then return; end if;
  select id into bid from public.businesses where slug = p_slug;
  if bid is null then return; end if;
  insert into public.shop_events (business_id, kind, source, ref)
  values (bid, p_kind,
    case when p_source in ('instagram', 'facebook', 'whatsapp', 'google', 'link', 'direct', 'other') then p_source else 'other' end,
    nullif(left(coalesce(p_ref, ''), 60), ''));
end $$;
revoke execute on function public.track_shop_event(text, text, text, text) from public;
grant execute on function public.track_shop_event(text, text, text, text) to anon, authenticated;
