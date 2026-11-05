-- Website templates, product/service options, and product photo uploads. Run after 0011. Safe to run twice.

-- Website template and cover photo ------------------------------------------------------------
alter table public.businesses
  add column if not exists site_template text not null default 'classic'
    check (site_template in ('classic', 'caterer', 'artist', 'beauty', 'trades')),
  add column if not exists hero_image_url text check (hero_image_url is null or hero_image_url ~ '^https://');
-- Shop pages read businesses with the public key, so the new public columns need granting (see 0003).
grant select (site_template, hero_image_url) on public.businesses to anon, authenticated;

-- Products and services -----------------------------------------------------------------------
-- variants: [{ "id": "a1b2c3", "name": "8 inch", "price": 65, "available": true }, ...]
-- When a product has variants, the shopper must pick one and its price is used.
alter table public.products
  add column if not exists kind text not null default 'product' check (kind in ('product', 'service')),
  add column if not exists category text check (category is null or char_length(category) <= 40),
  add column if not exists price_note text check (price_note is null or char_length(price_note) <= 30),
  add column if not exists variants jsonb not null default '[]'
    check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) <= 30);
create index if not exists products_business_category_idx on public.products (business_id, category, sort_order);

-- Product photos: public (they're on the shop page), one folder per business --------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "members add product photos" on storage.objects;
create policy "members add product photos" on storage.objects for insert
  with check (bucket_id = 'product-images'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));

drop policy if exists "members change product photos" on storage.objects;
create policy "members change product photos" on storage.objects for update
  using (bucket_id = 'product-images'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));

drop policy if exists "members remove product photos" on storage.objects;
create policy "members remove product photos" on storage.objects for delete
  using (bucket_id = 'product-images'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));

-- Owners and admins can remove a product (order history keeps the name and price).
drop policy if exists "admins delete products" on public.products;
create policy "admins delete products" on public.products for delete using (private.is_admin(business_id));
