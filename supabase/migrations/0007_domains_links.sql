-- Custom domains for shop pages, and short tracked links. Run after 0006.

create table public.business_domains (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  domain text not null unique check (domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'error')),
  last_error text,
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.business_domains (business_id);
alter table public.business_domains enable row level security;
create policy "members read domains" on public.business_domains for select using (private.is_member(business_id) or private.is_staff());
-- Writes go through the server after an owner/admin check.

create table public.short_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  label text not null check (char_length(label) between 1 and 80),
  ref text not null check (ref ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),   -- becomes ?ref= and the order's attribution
  clicks integer not null default 0,
  last_click_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.short_links (business_id, created_at desc);
alter table public.short_links enable row level security;
create policy "members read links" on public.short_links for select using (private.is_member(business_id) or private.is_staff());

-- Public lookups, used without sign-in by the router. They return only what a visitor already sees.
create or replace function public.shop_for_domain(p_domain text)
returns text language sql stable security definer set search_path = '' as $$
  select b.slug from public.business_domains d join public.businesses b on b.id = d.business_id
  where d.domain = lower(p_domain) and d.status = 'active' limit 1;
$$;

create or replace function public.follow_short_link(p_code text)
returns table (slug text, ref text, domain text) language plpgsql security definer set search_path = '' as $$
begin
  return query
  with hit as (
    update public.short_links set clicks = clicks + 1, last_click_at = now()
    where code = lower(p_code) returning business_id, short_links.ref
  )
  select b.slug, hit.ref,
    (select d.domain from public.business_domains d where d.business_id = b.id and d.status = 'active' order by d.created_at limit 1)
  from hit join public.businesses b on b.id = hit.business_id;
end $$;

revoke execute on function public.shop_for_domain(text) from public;
revoke execute on function public.follow_short_link(text) from public;
grant execute on function public.shop_for_domain(text) to anon, authenticated;
grant execute on function public.follow_short_link(text) to anon, authenticated;
