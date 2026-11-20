-- Browser notifications (Web Push): each browser or phone a team member turns notifications on in.
-- New WhatsApp messages to the business are pushed to every subscribed member, even with ChatCart closed.
-- Run after 0030. Safe to run more than once.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_business on public.push_subscriptions (business_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for select using (user_id = auth.uid());
-- Written by server actions (the signed-in member's own browser) and read by the webhook, both with the service role.
