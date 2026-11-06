-- Plan limits from the pricing cards, and the AI product assistant (Pro and up).
-- Run after 0023. Safe to run more than once.

-- Team inbox is a Pro feature: Starter and Growth plans have one login. (Existing extra members keep access.)
update public.plans set seats = 1 where id in ('starter', 'growth', 'growth-video');

-- Who sent each outgoing message: 'person' (from the Inbox), 'ai' (the product assistant) or null (the bot and system messages).
-- The assistant stays quiet while a person is talking to the customer.
alter table public.messages add column if not exists sent_by text check (sent_by is null or sent_by in ('person', 'ai'));
create index if not exists messages_sent_by on public.messages (customer_id, created_at desc) where sent_by is not null;

-- The owner can switch the AI product assistant off.
alter table public.businesses add column if not exists ai_assistant boolean not null default true;
