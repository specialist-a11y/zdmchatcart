-- "Bot automation" from the pricing cards (WhatsApp answers to common questions and the away message) is now its own
-- plan feature, wa_automations, on Growth and up. Starter keeps order codes, payment links, receipts and the first-time hello.
-- Run after 0022. Safe to run more than once.

update public.plans
set features = array_append(features, 'wa_automations')
where 'cart_recovery' = any(features) and not ('wa_automations' = any(features));
