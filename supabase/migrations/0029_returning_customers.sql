-- Returning customers: each new WhatsApp visit (after 24 hours or more of quiet) is counted,
-- so the bot can say "welcome back" and the CRM shows who keeps coming back.
-- Run after 0028. Safe to run more than once.
alter table public.customers
  add column if not exists visits integer not null default 1,
  add column if not exists last_visit_at timestamptz;
