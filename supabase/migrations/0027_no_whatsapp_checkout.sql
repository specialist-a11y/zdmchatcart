-- Checkout without WhatsApp: the shopper gives a phone number to call and an email, pays by card or
-- 1st Pay / bank transfer, and follows the order on its own page (with a screenshot upload for transfers).
-- Run after 0026. Safe to run more than once.
alter table public.orders
  add column if not exists no_whatsapp boolean not null default false,
  add column if not exists contact_email text check (contact_email is null or char_length(contact_email) <= 120);
