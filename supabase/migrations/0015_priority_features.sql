-- Section 2 of docs/improvements/PRIORITIES.md: hours and bot automations, Instagram DMs in the inbox,
-- clip comments, image post allowance, owner summary. Run after 0014. Safe to run more than once.

-- Opening hours by day, away message, holiday closure, 8pm summary --------------------------------
-- hours: {"mon": [["07:00","17:00"]], "tue": [], ...}; a missing or empty day means closed.
alter table public.businesses
  add column if not exists hours jsonb check (hours is null or jsonb_typeof(hours) = 'object'),
  add column if not exists away_enabled boolean not null default false,
  add column if not exists away_message text check (away_message is null or char_length(away_message) <= 600),
  add column if not exists closed_until date,
  add column if not exists closed_note text check (closed_note is null or char_length(closed_note) <= 200),
  add column if not exists daily_summary boolean not null default true;
-- The shop page shows "Open now" and holiday closures.
grant select (hours, closed_until, closed_note) on public.businesses to anon, authenticated;

-- So the away message goes once per customer per closed spell, not on every message.
alter table public.customers
  add column if not exists away_sent_at timestamptz,
  add column if not exists instagram_username text;
create unique index if not exists customers_business_instagram on public.customers (business_id, instagram_id) where instagram_id is not null;

-- FAQ keyword answers for the WhatsApp bot ----------------------------------------------------------
create table if not exists public.whatsapp_faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  keywords text[] not null check (cardinality(keywords) between 1 and 12),
  answer text not null check (char_length(answer) between 1 and 1000),
  active boolean not null default true,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_faqs_business on public.whatsapp_faqs (business_id, active);

-- Comments and change requests on a clip or photo ---------------------------------------------------
create table if not exists public.clip_comments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.video_clips(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  from_staff boolean not null default false,
  kind text not null default 'comment' check (kind in ('comment', 'change')),
  body text not null check (char_length(body) between 1 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clip_comments_clip on public.clip_comments (clip_id, created_at);
create index if not exists clip_comments_open on public.clip_comments (business_id) where resolved_at is null;

-- Image posts per month on each plan (0 = not shown). ZDMINC sets the numbers in the admin. --------
alter table public.plans add column if not exists image_posts integer not null default 0 check (image_posts >= 0);

-- RLS --------------------------------------------------------------------------------------------
alter table public.whatsapp_faqs enable row level security;
alter table public.clip_comments enable row level security;
drop policy if exists "members read faqs" on public.whatsapp_faqs;
create policy "members read faqs" on public.whatsapp_faqs for select using (private.is_member(business_id) or private.is_staff());
drop policy if exists "admins manage faqs" on public.whatsapp_faqs;
create policy "admins manage faqs" on public.whatsapp_faqs for all
  using (private.is_admin(business_id) or private.is_staff()) with check (private.is_admin(business_id) or private.is_staff());
drop policy if exists "members read clip comments" on public.clip_comments;
create policy "members read clip comments" on public.clip_comments for select using (private.is_member(business_id) or private.is_staff());
drop policy if exists "members add clip comments" on public.clip_comments;
create policy "members add clip comments" on public.clip_comments for insert
  with check ((private.is_member(business_id) and not from_staff and author_id = auth.uid()) or private.is_staff());
drop policy if exists "staff manage clip comments" on public.clip_comments;
create policy "staff manage clip comments" on public.clip_comments for update using (private.is_staff() or private.is_admin(business_id));
