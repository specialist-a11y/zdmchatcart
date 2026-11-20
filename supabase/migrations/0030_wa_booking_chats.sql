-- Ordering inside a WhatsApp chat: where each customer is in the conversation (items, date, time, agreement, confirm).
-- One row per customer; it is cleared when the order is made or cancelled, and ignored after 6 hours.
-- Run after 0029. Safe to run more than once.
create table if not exists public.wa_sessions (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  step text not null check (step in ('items', 'date', 'time', 'agree', 'confirm')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.wa_sessions enable row level security;
drop policy if exists wa_sessions_read on public.wa_sessions;
create policy wa_sessions_read on public.wa_sessions for select
  using (private.is_member(business_id) or private.is_staff());
-- Written only by the WhatsApp webhook with the service role.
