-- ChatCart core schema: one app, many businesses, each walled off by RLS.

create extension if not exists pgcrypto;

-- Businesses (tenants) ------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  whatsapp_number text,                       -- digits only, international format, e.g. 12465551234
  currency text not null default 'BBD',
  order_prefix text not null default 'CC' check (order_prefix ~ '^[A-Z]{1,4}$'),
  next_order_number integer not null default 1001,
  brand_color text not null default '#0F7C7E',
  logo_url text,
  tagline text,
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'staff');

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

-- Membership helpers (security definer so RLS policies can call them without recursion)
create or replace function public.is_member(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m where m.business_id = bid and m.user_id = auth.uid());
$$;

create or replace function public.is_admin(bid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members m
                 where m.business_id = bid and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

-- Catalog -------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  stock integer check (stock is null or stock >= 0),   -- null = not tracked
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.products (business_id, active, sort_order);

-- CRM -----------------------------------------------------------------------
create type public.customer_stage as enum ('new', 'ordered', 'paid', 'repeat', 'quiet');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text,
  name text,
  email text,
  instagram_id text,
  stage public.customer_stage not null default 'new',
  total_spent numeric(12,2) not null default 0,
  order_count integer not null default 0,
  tags text[] not null default '{}',
  notes text,
  whatsapp_opt_in boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

-- Orders (a cart becomes an order the moment it gets a code) ----------------
create type public.order_status as enum
  ('awaiting_confirmation', 'awaiting_payment', 'paid', 'ready', 'fulfilled', 'cancelled', 'abandoned');
create type public.order_source as enum ('web', 'whatsapp', 'instagram', 'manual');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.order_status not null default 'awaiting_confirmation',
  source public.order_source not null default 'web',
  fulfillment text check (fulfillment in ('pickup', 'delivery')),
  note text,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'BBD',
  payment_url text,
  fygaro_transaction_id text,
  attribution text,                          -- post or ad code that brought the buyer
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (business_id, code)
);
create index on public.orders (business_id, status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);
create index on public.order_items (order_id);

-- Conversations ---------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'instagram')),
  direction text not null check (direction in ('in', 'out')),
  body text,
  external_id text,
  created_at timestamptz not null default now()
);
create index on public.messages (business_id, customer_id, created_at desc);

-- Integrations: public config readable by the business, secrets server-only -------
create table public.integrations (
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('fygaro', 'whatsapp', 'instagram')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  config jsonb not null default '{}',        -- e.g. fygaro button_url + key id, whatsapp phone_number_id
  updated_at timestamptz not null default now(),
  primary key (business_id, provider)
);
create index on public.integrations ((config->>'phone_number_id'));
create index on public.integrations ((config->>'key_id'));

create table public.integration_secrets (
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null,
  secret text not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, provider)
);

create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  business_id uuid references public.businesses(id) on delete set null,
  external_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, external_id)
);

-- Functions -------------------------------------------------------------------
-- Create a business and make the caller its owner.
create or replace function public.create_business(p_name text, p_slug text, p_prefix text, p_whatsapp text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.businesses (name, slug, order_prefix, whatsapp_number)
  values (p_name, lower(p_slug), upper(p_prefix), nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''))
  returning id into bid;
  insert into public.business_members (business_id, user_id, role) values (bid, auth.uid(), 'owner');
  return bid;
end $$;

-- Atomically hand out the next order code, e.g. ZB-1042. Server only.
create or replace function public.next_order_code(bid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare n integer; p text;
begin
  update public.businesses set next_order_number = next_order_number + 1
  where id = bid returning next_order_number - 1, order_prefix into n, p;
  if n is null then raise exception 'unknown business'; end if;
  return p || '-' || n;
end $$;

-- Mark an order paid and update the customer's CRM record. Idempotent. Server only.
create or replace function public.mark_order_paid(p_order uuid, p_txn text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  update public.orders set status = 'paid', paid_at = now(), fygaro_transaction_id = p_txn
  where id = p_order and status in ('awaiting_confirmation', 'awaiting_payment', 'abandoned')
  returning * into o;
  if not found then return false; end if;
  update public.products p set stock = greatest(p.stock - i.quantity, 0)
  from public.order_items i where i.order_id = o.id and i.product_id = p.id and p.stock is not null;
  if o.customer_id is not null then
    update public.customers c set
      total_spent = c.total_spent + o.total,
      order_count = c.order_count + 1,
      stage = case when c.order_count >= 1 then 'repeat'::public.customer_stage else 'paid'::public.customer_stage end,
      last_seen_at = now()
    where c.id = o.customer_id;
  end if;
  return true;
end $$;

revoke execute on function public.next_order_code(uuid) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.create_business(text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text) to authenticated;

-- Row level security ----------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.messages enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;   -- no policies: service role only
alter table public.webhook_events enable row level security;        -- no policies: service role only

-- Shop pages are public: anyone can read a business profile and its active products.
create policy "public read businesses" on public.businesses for select using (true);
create policy "admins update business" on public.businesses for update
  using (public.is_admin(id)) with check (public.is_admin(id));

create policy "members see their team" on public.business_members for select
  using (user_id = auth.uid() or public.is_member(business_id));

create policy "public read active products" on public.products for select
  using (active or public.is_member(business_id));
create policy "members insert products" on public.products for insert with check (public.is_member(business_id));
create policy "members update products" on public.products for update
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy "admins delete products" on public.products for delete using (public.is_admin(business_id));

create policy "members read customers" on public.customers for select using (public.is_member(business_id));
create policy "members write customers" on public.customers for insert with check (public.is_member(business_id));
create policy "members update customers" on public.customers for update
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "members read orders" on public.orders for select using (public.is_member(business_id));
create policy "members update orders" on public.orders for update
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy "members read order items" on public.order_items for select using (public.is_member(business_id));

create policy "members read messages" on public.messages for select using (public.is_member(business_id));

create policy "admins read integrations" on public.integrations for select using (public.is_admin(business_id));

-- Keep RLS helpers out of the public API schema.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.is_member(uuid) set schema private;
alter function public.is_admin(uuid) set schema private;
