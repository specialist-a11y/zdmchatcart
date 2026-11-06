-- Import products from a business's existing website (CSV export or a link to the site).
-- Run after 0019_plan_features.sql.

alter table public.products
  add column if not exists sku text,
  add column if not exists import_key text,      -- id on the old site, so importing again updates instead of duplicating
  add column if not exists imported_at timestamptz;
create unique index if not exists products_import_key on public.products (business_id, import_key) where import_key is not null;

-- A parsed file or site, waiting for the owner to check the preview and import it.
create table if not exists public.product_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null,                 -- Shopify, WooCommerce, Wix, Square, Spreadsheet, or the site address
  items jsonb not null default '[]',
  warnings text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  result text
);
create index if not exists product_imports_business on public.product_imports (business_id, created_at desc);
alter table public.product_imports enable row level security;
drop policy if exists "members read imports" on public.product_imports;
create policy "members read imports" on public.product_imports for select using (private.is_member(business_id) or private.is_staff());
-- Written on the server with the service role after checking the user is a member.
