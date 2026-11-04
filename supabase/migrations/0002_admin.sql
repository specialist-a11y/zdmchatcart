-- ZDMINC admin backend: staff, plans, subscriptions, invoices, plan changes,
-- support tickets, video library and internal notes. Run after 0001_init.sql.

-- Staff (the ZDMINC team) ---------------------------------------------------------
create type public.staff_role as enum ('owner', 'manager', 'support', 'editor');

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.staff_role not null default 'support',
  created_at timestamptz not null default now()
);

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff s where s.user_id = auth.uid());
$$;

create or replace function private.is_staff_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff s where s.user_id = auth.uid() and s.role in ('owner', 'manager'));
$$;

-- Who ZDMINC contacts at each client (the owner, not the shop's customer-facing number)
alter table public.businesses add column contact_name text, add column contact_phone text, add column contact_email text;

-- Plans and subscriptions -------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  currency text not null default 'BBD',
  description text,
  video_clips integer not null default 0,     -- clips per month, 0 = no video package
  posts_per_month integer not null default 0, -- AI posts, 0 = not included
  seats integer not null default 2,
  rank integer not null default 0,            -- higher = bigger plan, decides upgrade vs downgrade
  active boolean not null default true
);

insert into public.plans (id, name, monthly_price, description, video_clips, posts_per_month, seats, rank) values
  ('starter', 'Starter', 150, 'Website shop, WhatsApp order links, Fygaro payments', 0, 0, 2, 10),
  ('growth', 'Growth', 300, 'Starter + WhatsApp inbox, catalog, cart reminders', 0, 0, 3, 20),
  ('pro', 'Pro', 500, 'Growth + automations, broadcasts, 5 seats', 0, 0, 5, 30),
  ('all-in-one', 'All-in-One', 650, 'Pro + AI posts, scheduling, captions', 0, 20, 5, 40),
  ('growth-video', 'Growth + Video', 1200, 'Growth + monthly shoot, 10 clips', 10, 0, 3, 50),
  ('all-in-one-video', 'All-in-One + Video', 1450, 'All-in-One + monthly shoot, 10 clips', 10, 20, 5, 60);

create type public.subscription_status as enum ('trial', 'active', 'paused', 'past_due', 'cancelled');

create table public.subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status public.subscription_status not null default 'active',
  current_period_start date not null default current_date,
  current_period_end date not null default (current_date + interval '1 month')::date,
  pending_plan_id text references public.plans(id),   -- downgrade waiting for renewal
  credit numeric(10,2) not null default 0,             -- taken off the next invoice
  updated_at timestamptz not null default now()
);

create table public.plan_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_plan text references public.plans(id),
  to_plan text not null references public.plans(id),
  direction text not null check (direction in ('upgrade', 'downgrade', 'same')),
  timing text not null check (timing in ('now', 'renewal')),
  status text not null default 'applied' check (status in ('applied', 'scheduled', 'cancelled')),
  proration numeric(10,2) not null default 0,          -- + charged now, - credited
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  by_client boolean not null default false,
  effective_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.plan_changes (business_id, created_at desc);

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  number text not null unique,
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'BBD',
  due_date date not null default current_date,
  status public.invoice_status not null default 'sent',
  payment_url text,
  fygaro_transaction_id text,
  reminders_sent integer not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invoices (status, due_date);
create index on public.invoices (business_id, created_at desc);

create sequence public.invoice_seq start 1;
create or replace function public.next_invoice_number()
returns text language sql security definer set search_path = '' as $$
  select 'ZDM-' || to_char(current_date, 'YYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$;
revoke execute on function public.next_invoice_number() from public, anon, authenticated;

-- Support ----------------------------------------------------------------------------
create type public.ticket_status as enum ('open', 'waiting_on_client', 'resolved');
create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  business_id uuid not null references public.businesses(id) on delete cascade,
  subject text not null check (length(subject) between 3 and 200),
  category text not null default 'other'
    check (category in ('videos', 'payments', 'whatsapp', 'website', 'account', 'plan', 'other')),
  priority public.ticket_priority not null default 'normal',
  status public.ticket_status not null default 'open',
  assignee uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.support_tickets (status, updated_at desc);
create index on public.support_tickets (business_id, updated_at desc);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  from_staff boolean not null default false,
  internal boolean not null default false,             -- staff-only notes
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  check (not internal or from_staff)
);
create index on public.ticket_messages (ticket_id, created_at);

-- Keep ticket status and SLA timestamps in step with new messages.
create or replace function private.on_ticket_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.internal then
    update public.support_tickets set updated_at = now() where id = new.ticket_id;
  elsif new.from_staff then
    update public.support_tickets
      set updated_at = now(), first_response_at = coalesce(first_response_at, now())
      where id = new.ticket_id;
  else
    update public.support_tickets
      set updated_at = now(), status = 'open', resolved_at = null
      where id = new.ticket_id;
  end if;
  return new;
end $$;
create trigger ticket_message_after_insert after insert on public.ticket_messages
  for each row execute function private.on_ticket_message();

-- Video library ------------------------------------------------------------------------
create table public.video_shoots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  month date not null,                                  -- first day of the month it belongs to
  shoot_date date,
  location text,
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.video_shoots (business_id, month desc);

create table public.video_clips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shoot_id uuid not null references public.video_shoots(id) on delete cascade,
  title text not null,
  storage_path text not null unique,                    -- <business_id>/<shoot_id>/<file> in bucket client-videos
  seconds integer check (seconds is null or seconds between 1 and 600),
  caption text,
  status text not null default 'ready' check (status in ('ready', 'published', 'hidden')),
  chosen boolean not null default false,
  chosen_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.video_clips (business_id, status);

-- Clients pick clips through this function so they can't edit anything else on the row.
create or replace function public.choose_clip(p_clip uuid, p_chosen boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  select business_id into bid from public.video_clips where id = p_clip and status = 'published';
  if bid is null or not private.is_member(bid) then return false; end if;
  update public.video_clips set chosen = p_chosen, chosen_at = case when p_chosen then now() end where id = p_clip;
  return true;
end $$;
revoke execute on function public.choose_clip(uuid, boolean) from public, anon;
grant execute on function public.choose_clip(uuid, boolean) to authenticated;

-- Internal notes and the account history -------------------------------------------------
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.account_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  kind text not null,          -- plan_change, invoice, video_publish, ticket, staff_view, note, client_created
  summary text not null,
  created_at timestamptz not null default now()
);
create index on public.account_events (business_id, created_at desc);

-- ZDMINC's own WhatsApp line: the team chatting with client owners -----------------------
create table public.zdm_wa_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  business_id uuid references public.businesses(id) on delete set null,   -- null until matched to a client
  contact_name text,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  kind text not null default 'text' check (kind in ('text', 'template')),
  status text not null default 'sent' check (status in ('received', 'sent', 'failed')),
  error text,
  pending boolean not null default false,              -- text waiting for the client to reply to the template
  ticket_id uuid references public.support_tickets(id) on delete set null,
  external_id text unique,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.zdm_wa_messages (phone, created_at desc);
create index on public.zdm_wa_messages (business_id, created_at desc);
create index on public.businesses (contact_phone);

-- Storage: private bucket, one folder per business ---------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-videos', 'client-videos', false, 4294967296)
on conflict (id) do nothing;

create policy "staff manage client videos" on storage.objects for all
  using (bucket_id = 'client-videos' and private.is_staff())
  with check (bucket_id = 'client-videos' and private.is_staff());
create policy "members read their videos" on storage.objects for select
  using (bucket_id = 'client-videos' and private.is_member(((storage.foldername(name))[1])::uuid));

-- Row level security ----------------------------------------------------------------------
alter table public.platform_staff enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.plan_changes enable row level security;
alter table public.invoices enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.video_shoots enable row level security;
alter table public.video_clips enable row level security;
alter table public.client_notes enable row level security;
alter table public.account_events enable row level security;
alter table public.zdm_wa_messages enable row level security;

create policy "staff read staff" on public.platform_staff for select using (private.is_staff());
create policy "managers manage staff" on public.platform_staff for all
  using (private.is_staff_manager()) with check (private.is_staff_manager());

create policy "anyone reads active plans" on public.plans for select using (active or private.is_staff());
create policy "managers edit plans" on public.plans for all
  using (private.is_staff_manager()) with check (private.is_staff_manager());

create policy "members read subscription" on public.subscriptions for select
  using (private.is_member(business_id) or private.is_staff());
create policy "staff write subscriptions" on public.subscriptions for all
  using (private.is_staff()) with check (private.is_staff());

create policy "admins read plan changes" on public.plan_changes for select
  using (private.is_admin(business_id) or private.is_staff());
create policy "staff write plan changes" on public.plan_changes for all
  using (private.is_staff()) with check (private.is_staff());

create policy "admins read invoices" on public.invoices for select
  using (private.is_admin(business_id) or private.is_staff());
create policy "staff write invoices" on public.invoices for all
  using (private.is_staff()) with check (private.is_staff());

create policy "members read tickets" on public.support_tickets for select
  using (private.is_member(business_id) or private.is_staff());
create policy "members open tickets" on public.support_tickets for insert
  with check (private.is_member(business_id) and created_by = auth.uid() and status = 'open' and assignee is null);
create policy "staff manage tickets" on public.support_tickets for all
  using (private.is_staff()) with check (private.is_staff());

create policy "members read public replies" on public.ticket_messages for select
  using ((private.is_member(business_id) and not internal) or private.is_staff());
create policy "members reply" on public.ticket_messages for insert
  with check (private.is_member(business_id) and author_id = auth.uid() and not from_staff and not internal
              and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.business_id = ticket_messages.business_id));
create policy "staff write messages" on public.ticket_messages for insert
  with check (private.is_staff() and author_id = auth.uid() and from_staff
              and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.business_id = ticket_messages.business_id));

create policy "members read published shoots" on public.video_shoots for select
  using ((private.is_member(business_id) and published_at is not null) or private.is_staff());
create policy "staff manage shoots" on public.video_shoots for all
  using (private.is_staff()) with check (private.is_staff());

create policy "members read published clips" on public.video_clips for select
  using ((private.is_member(business_id) and status = 'published') or private.is_staff());
create policy "staff manage clips" on public.video_clips for all
  using (private.is_staff()) with check (private.is_staff());

create policy "staff notes" on public.client_notes for all
  using (private.is_staff()) with check (private.is_staff());
create policy "staff whatsapp" on public.zdm_wa_messages for all
  using (private.is_staff()) with check (private.is_staff());
create policy "staff events" on public.account_events for all
  using (private.is_staff()) with check (private.is_staff());

-- Staff can open any client's CRM ("View as client"). Reads plus the same edits an owner can make.
create policy "staff read members" on public.business_members for select using (private.is_staff());
create policy "staff update businesses" on public.businesses for update using (private.is_staff()) with check (private.is_staff());
create policy "staff all products" on public.products for all using (private.is_staff()) with check (private.is_staff());
create policy "staff all customers" on public.customers for all using (private.is_staff()) with check (private.is_staff());
create policy "staff all orders" on public.orders for all using (private.is_staff()) with check (private.is_staff());
create policy "staff read order items" on public.order_items for select using (private.is_staff());
create policy "staff read messages" on public.messages for select using (private.is_staff());
create policy "staff read integrations" on public.integrations for select using (private.is_staff());

-- Every business gets a subscription. New ones start on Starter until ZDMINC sets the plan.
insert into public.subscriptions (business_id, plan_id)
select id, 'starter' from public.businesses on conflict do nothing;

create or replace function private.on_business_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (business_id, plan_id, status) values (new.id, 'starter', 'trial')
  on conflict do nothing;
  return new;
end $$;
create trigger business_after_insert after insert on public.businesses
  for each row execute function private.on_business_created();

-- First staff member: run once in the SQL editor with your own user id, e.g.
-- insert into public.platform_staff (user_id, name, role) values ('<your auth user id>', 'Kat', 'owner');
