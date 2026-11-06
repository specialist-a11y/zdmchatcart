-- SEO: a readable web address for every product, and Google title, description and verification per shop.
-- Run after 0016. Safe to run more than once.

alter table public.businesses
  add column if not exists seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  add column if not exists seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  add column if not exists google_verification text check (google_verification is null or google_verification ~ '^[A-Za-z0-9_-]{10,100}$');
grant select (seo_title, seo_description, google_verification) on public.businesses to anon, authenticated;

alter table public.products add column if not exists slug text check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,69}$');
create unique index if not exists products_business_slug on public.products (business_id, slug) where slug is not null;

-- "Black Cake (8 inch)" -> "black-cake-8-inch", made unique inside the shop with -2, -3...
create or replace function private.product_slug(p_business uuid, p_name text, p_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare base text; candidate text; n integer := 1;
begin
  base := trim(both '-' from left(regexp_replace(lower(replace(coalesce(p_name, ''), '&', ' and ')), '[^a-z0-9]+', '-', 'g'), 60));
  if base = '' then base := 'item'; end if;
  candidate := base;
  while exists (select 1 from public.products where business_id = p_business and slug = candidate and id <> p_id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- New products get a slug automatically. Renaming keeps the old one, so links and Google results don't break.
create or replace function private.products_set_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then new.slug := private.product_slug(new.business_id, new.name, new.id); end if;
  return new;
end $$;
drop trigger if exists products_set_slug on public.products;
create trigger products_set_slug before insert or update of slug on public.products
  for each row execute function private.products_set_slug();

-- Give existing products a slug.
do $$
declare r record;
begin
  for r in select id, business_id, name from public.products where slug is null order by created_at loop
    update public.products set slug = private.product_slug(r.business_id, r.name, r.id) where id = r.id;
  end loop;
end $$;

-- A shop's live custom domain (for canonical links), and every live domain (for sitemaps). Domains are public in DNS anyway.
create or replace function public.domain_for_shop(p_slug text)
returns text language sql stable security definer set search_path = '' as $$
  select d.domain from public.business_domains d join public.businesses b on b.id = d.business_id
  where b.slug = p_slug and d.status = 'active' order by d.created_at limit 1;
$$;
create or replace function public.active_shop_domains()
returns table (slug text, domain text) language sql stable security definer set search_path = '' as $$
  select distinct on (b.slug) b.slug, d.domain from public.business_domains d join public.businesses b on b.id = d.business_id
  where d.status = 'active' order by b.slug, d.created_at;
$$;
revoke execute on function public.domain_for_shop(text) from public;
revoke execute on function public.active_shop_domains() from public;
grant execute on function public.domain_for_shop(text) to anon, authenticated;
grant execute on function public.active_shop_domains() to anon, authenticated;
