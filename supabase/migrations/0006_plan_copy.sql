-- Starter plan wording: what it does beyond taking a payment.
update public.plans
set description = 'Instagram and Facebook connected, shop page to WhatsApp, order codes, auto-paid orders, customer list, sales by post'
where id = 'starter';

-- Video plans: 10 videos a month instead of 24.
update public.plans set video_clips = 10, description = 'Growth + monthly shoot, 10 clips' where id = 'growth-video';
update public.plans set video_clips = 10, description = 'All-in-One + monthly shoot, 10 clips' where id = 'all-in-one-video';
