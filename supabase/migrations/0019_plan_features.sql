-- Plans unlock features, self-serve signup with a chosen plan, and ZDMINC invoices paid by bank transfer (1st Pay or any bank).
-- Run after 0018_bank_transfer.sql.

-- 1. What each plan includes, and its one-time setup fee -----------------------------------
alter table public.plans
  add column if not exists features text[] not null default '{}',
  add column if not exists setup_fee numeric(10,2) not null default 1500 check (setup_fee >= 0),
  add column if not exists self_serve boolean not null default true;  -- shown on the signup page

-- Same split as the pricing on the website. Edit any time in ZDMINC admin > Plans and billing.
update public.plans set features = '{}', setup_fee = 1500 where id = 'starter';
update public.plans set features = '{ig_autoreplies,cart_recovery,daily_summary}', setup_fee = 1500 where id = 'growth';
update public.plans set features = '{ig_autoreplies,cart_recovery,daily_summary,reporting,ai_assistant,broadcasts}', setup_fee = 1500 where id = 'pro';
update public.plans set features = '{ig_autoreplies,cart_recovery,daily_summary,reporting,ai_assistant,broadcasts,marketing_autopilot,ads}', setup_fee = 2500 where id = 'all-in-one';
update public.plans set features = '{ig_autoreplies,cart_recovery,daily_summary,videos}', setup_fee = 1500 where id = 'growth-video';
update public.plans set features = '{ig_autoreplies,cart_recovery,daily_summary,reporting,ai_assistant,broadcasts,marketing_autopilot,ads,videos}', setup_fee = 2500 where id = 'all-in-one-video';

-- 2. Signed up, waiting for the first payment ----------------------------------------------
alter type public.subscription_status add value if not exists 'pending_payment';

-- 3. ZDMINC invoices paid by bank transfer --------------------------------------------------
alter table public.invoices
  add column if not exists paid_via text check (paid_via is null or paid_via in ('card', 'transfer', 'cash', 'other')),
  add column if not exists transfer_reference text,
  add column if not exists transfer_proof_path text,     -- bucket transfer-proofs: <business_id>/invoices/<invoice_id>.<ext>
  add column if not exists transfer_submitted_at timestamptz,
  add column if not exists is_first boolean not null default false;  -- setup + first month; paying it starts the subscription
create index if not exists invoices_transfer_pending on public.invoices (transfer_submitted_at) where transfer_submitted_at is not null and status in ('sent', 'overdue');

-- ZDMINC's own settings (bank details for invoices). Staff only; clients read it through the server.
create table if not exists public.platform_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists "staff read settings" on public.platform_settings;
create policy "staff read settings" on public.platform_settings for select using (private.is_staff());
drop policy if exists "managers write settings" on public.platform_settings;
create policy "managers write settings" on public.platform_settings for all using (private.is_staff_manager()) with check (private.is_staff_manager());
insert into public.platform_settings (key, value) values ('zdm_bank_details', '') on conflict do nothing;

-- 4. A business made from the signup page waits for its first payment.
-- (ZDMINC admin's "New client" sets the plan and makes it active straight after.)
create or replace function private.on_business_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (business_id, plan_id, status) values (new.id, 'starter', 'pending_payment')
  on conflict do nothing;
  return new;
end $$;
