-- Part payments: the owner records what actually arrived (1st Pay, bank transfer or cash).
-- Each payment is logged; the order keeps a running amount_paid, and the receipt shows paid so far and the balance.
-- Run after 0025. Safe to run more than once.
alter table public.orders
  add column if not exists amount_paid numeric(12,2) not null default 0;

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('transfer', 'cash', 'card')),
  reference text check (char_length(reference) <= 80),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_payments_order on public.order_payments (order_id, created_at);

alter table public.order_payments enable row level security;
drop policy if exists order_payments_read on public.order_payments;
create policy order_payments_read on public.order_payments for select
  using (private.is_member(business_id) or private.is_staff());
-- Writes go through server actions with the service role after an owner/admin check.
