-- Customer journey foundations and CRM quick wins (docs/improvements/PRIORITIES.md). Run after 0013.
-- Safe to run more than once.

-- STOP handling and per-customer consent -------------------------------------------
alter table public.customers
  add column if not exists opted_out_at timestamptz,          -- set when the customer sends STOP
  add column if not exists quiet_at timestamptz;              -- when the nightly job moved them to Quiet

-- Order follow-ups ------------------------------------------------------------------
alter table public.orders
  add column if not exists ready_notified_at timestamptz,     -- "your order is ready" sent
  add column if not exists reminder_sent_at timestamptz,      -- unpaid cart reminder sent
  add column if not exists abandoned_at timestamptz;

-- Products: featured items show first on the shop ---------------------------------
alter table public.products add column if not exists featured boolean not null default false;

-- Nightly stage job. Unpaid orders older than 48 hours become abandoned.
-- Paid customers quiet for 45 days, and Repeat customers quiet for 60 days, become Quiet.
-- "Quiet" means no order and no message since then. Server only.
create or replace function public.run_stage_job()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_abandoned integer; n_quiet integer;
begin
  update public.orders set status = 'abandoned', abandoned_at = now()
  where status in ('awaiting_confirmation', 'awaiting_payment') and created_at < now() - interval '48 hours';
  get diagnostics n_abandoned = row_count;

  with activity as (
    select c.id, c.stage,
      greatest(
        coalesce(c.last_seen_at, c.created_at),
        coalesce((select max(o.created_at) from public.orders o where o.customer_id = c.id), c.created_at),
        coalesce((select max(m.created_at) from public.messages m where m.customer_id = c.id), c.created_at)
      ) as last_active
    from public.customers c
    where c.stage in ('paid', 'repeat')
  )
  update public.customers c set stage = 'quiet', quiet_at = now()
  from activity a
  where a.id = c.id
    and ((a.stage = 'paid' and a.last_active < now() - interval '45 days')
      or (a.stage = 'repeat' and a.last_active < now() - interval '60 days'));
  get diagnostics n_quiet = row_count;

  return jsonb_build_object('abandoned', n_abandoned, 'quiet', n_quiet);
end $$;
revoke execute on function public.run_stage_job() from public, anon, authenticated;

-- A paid order brings a Quiet customer back: Repeat if they had bought before.
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
      quiet_at = null,
      last_seen_at = now()
    where c.id = o.customer_id;
  end if;
  return true;
end $$;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- WhatsApp message templates, with Meta approval status per business ----------------
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purpose text not null check (purpose in ('cart_reminder', 'win_back', 'order_ready', 'broadcast', 'other')),
  name text not null check (name ~ '^[a-z0-9_]{1,512}$'),     -- the name approved in Meta
  language text not null default 'en' check (char_length(language) between 2 and 10),
  body text not null check (char_length(body) between 1 and 1024), -- with {{1}}, {{2}} placeholders
  params text[] not null default '{}',                          -- what fills each placeholder: name, code, total, link, shop
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  rejected_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, name, language)
);
create index if not exists message_templates_purpose on public.message_templates (business_id, purpose, status);

-- Inbox quick replies ---------------------------------------------------------------
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quick_replies_business on public.quick_replies (business_id, sort_order);

-- Owner alerts sent on WhatsApp (low wallet, Instagram disconnected, expiring keys). One per key. --
create table if not exists public.owner_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('wallet_low', 'instagram_down', 'expiring', 'other')),
  key text not null,                     -- e.g. wallet_low:2026-11, so each alert goes out once
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now(),
  unique (business_id, key)
);
create index if not exists owner_alerts_business on public.owner_alerts (business_id, created_at desc);

-- Support attachments ----------------------------------------------------------------
alter table public.ticket_messages add column if not exists attachments jsonb not null default '[]'
  check (jsonb_typeof(attachments) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-files', 'support-files', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "members add support files" on storage.objects;
create policy "members add support files" on storage.objects for insert
  with check (bucket_id = 'support-files'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));
drop policy if exists "members read support files" on storage.objects;
create policy "members read support files" on storage.objects for select
  using (bucket_id = 'support-files'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));

-- RLS: members read, writes go through server actions with an owner/admin check ------
alter table public.message_templates enable row level security;
alter table public.quick_replies enable row level security;
alter table public.owner_alerts enable row level security;
drop policy if exists "members read templates" on public.message_templates;
create policy "members read templates" on public.message_templates for select using (private.is_member(business_id) or private.is_staff());
drop policy if exists "members read quick replies" on public.quick_replies;
create policy "members read quick replies" on public.quick_replies for select using (private.is_member(business_id) or private.is_staff());
drop policy if exists "members read owner alerts" on public.owner_alerts;
create policy "members read owner alerts" on public.owner_alerts for select using (private.is_member(business_id) or private.is_staff());

-- The shop reads featured from products (products are already readable when active).

-- Owners and admins may also write these directly (server actions fall back to the signed-in client
-- when no service key is set). Staff accounts of the business can read but not change them.
drop policy if exists "admins manage templates" on public.message_templates;
create policy "admins manage templates" on public.message_templates for all
  using (private.is_admin(business_id) or private.is_staff()) with check (private.is_admin(business_id) or private.is_staff());
drop policy if exists "admins manage quick replies" on public.quick_replies;
create policy "admins manage quick replies" on public.quick_replies for all
  using (private.is_admin(business_id) or private.is_staff()) with check (private.is_admin(business_id) or private.is_staff());
