-- Ads, part 2: structured audiences, a prepaid ad wallet for clients whose card Meta won't take,
-- and the Meta Pixel + Conversions API so retargeting works. Run after 0004_ads.sql.

-- Audience fields on each campaign --------------------------------------------------------
alter table public.ad_campaigns
  add column if not exists area text not null default 'barbados' check (area in ('barbados', 'parishes', 'radius')),
  add column if not exists parishes text[] not null default '{}',
  add column if not exists radius_km integer check (radius_km is null or radius_km between 1 and 80),
  add column if not exists age_min integer not null default 18 check (age_min between 18 and 65),
  add column if not exists age_max integer not null default 65 check (age_max between 18 and 65),
  add column if not exists gender text not null default 'all' check (gender in ('all', 'women', 'men')),
  add column if not exists interests text[] not null default '{}',
  add column if not exists warm text[] not null default '{}'
    check (warm <@ array['shop_visitors', 'cart_abandoners', 'whatsapp_chatters', 'instagram_engagers', 'past_customers']),
  add column if not exists placements text[] not null default array['instagram', 'facebook']
    check (placements <@ array['instagram', 'facebook'] and cardinality(placements) > 0),
  add constraint ad_age_order check (age_max >= age_min);

-- How each client pays for ad spend, and their Meta Pixel ---------------------------------
alter table public.businesses
  add column if not exists ad_billing text not null default 'own_account' check (ad_billing in ('own_account', 'wallet')),
  add column if not exists meta_pixel_id text check (meta_pixel_id is null or meta_pixel_id ~ '^[0-9]{8,20}$');
grant select (ad_billing, meta_pixel_id) on public.businesses to anon, authenticated;

-- Marketing consent: only these customers may be uploaded to Meta as a "past customers" audience.
alter table public.customers add column if not exists marketing_opt_in boolean not null default false;

-- Meta click id from the ad, for the Conversions API purchase event.
alter table public.orders add column if not exists meta_fbc text check (meta_fbc is null or length(meta_fbc) <= 300);

-- Conversions API token lives with the other secrets.
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in ('fygaro', 'whatsapp', 'instagram', 'meta'));

-- Prepaid ad wallet -----------------------------------------------------------------------
alter table public.invoices add column if not exists kind text not null default 'subscription' check (kind in ('subscription', 'ad_topup', 'other'));

create table public.ad_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('topup', 'spend', 'adjust')),
  amount numeric(10,2) not null,                       -- + money in, - money spent
  invoice_id uuid unique references public.invoices(id) on delete set null,
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  day date,
  note text,
  created_at timestamptz not null default now(),
  check ((kind = 'topup' and amount > 0) or (kind = 'spend' and amount <= 0) or kind = 'adjust')
);
create unique index ad_wallet_spend_once on public.ad_wallet_entries (campaign_id, day) where kind = 'spend';
create index on public.ad_wallet_entries (business_id, created_at desc);

alter table public.ad_wallet_entries enable row level security;
create policy "members read wallet" on public.ad_wallet_entries for select using (private.is_member(business_id) or private.is_staff());
create policy "staff manage wallet" on public.ad_wallet_entries for all using (private.is_staff()) with check (private.is_staff());
