-- Client account: business info the owner edits, billing details, and a privacy fix.
-- Run after 0002_admin.sql.

-- Public business info (shown on the shop page) -----------------------------------------
alter table public.businesses
  add column if not exists description text check (description is null or length(description) <= 600),
  add column if not exists address text,
  add column if not exists opening_hours text,
  add column if not exists delivery_info text,
  add column if not exists public_email text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists website_url text,
  -- Private: who ZDMINC bills
  add column if not exists billing_name text,
  add column if not exists billing_email text,
  add column if not exists billing_address text;

-- Privacy: shop pages read businesses with the public key, so only the public columns may be selected.
-- Owner contact and billing details are read on the server after checking the user is an owner/admin or ZDMINC staff.
revoke select on public.businesses from anon, authenticated;
grant select (id, name, slug, whatsapp_number, currency, order_prefix, brand_color, logo_url, tagline, created_at,
              description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url)
  on public.businesses to anon, authenticated;

-- Contact allowance: each plan includes 1,000 contacts; more costs extra per started block.
alter table public.plans
  add column if not exists contacts_included integer not null default 1000 check (contacts_included >= 0),
  add column if not exists extra_contacts_block integer not null default 1000 check (extra_contacts_block > 0),
  add column if not exists extra_contacts_price numeric(10,2) not null default 50 check (extra_contacts_price >= 0);
