-- Instagram comment auto-replies: "Comment CAKE and we'll DM you the link". Run after 0007.

create table public.ig_autoreplies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  keyword text not null check (keyword ~ '^[A-Z0-9]{2,30}$'),
  media_id text,                         -- null = every post
  media_label text,                      -- caption snippet shown in the CRM
  public_replies text[] not null default array['Sent! Check your DMs for the link', 'Just sent it to your DMs', 'Check your messages, the link is there'],
  dm_text text not null check (char_length(dm_text) between 1 and 900),
  short_link_id uuid references public.short_links(id) on delete set null,
  active boolean not null default true,
  daily_cap integer not null default 300 check (daily_cap between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.ig_autoreplies (business_id, active);
-- One rule per keyword per post (and one per keyword for "every post").
create unique index ig_autoreplies_unique on public.ig_autoreplies (business_id, keyword, coalesce(media_id, '*'));

create table public.ig_comment_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  rule_id uuid references public.ig_autoreplies(id) on delete set null,
  comment_id text not null unique,       -- Instagram retries webhooks; this stops double replies
  media_id text,
  from_id text,
  from_username text,
  text text,
  status text not null check (status in ('sent', 'dm_only', 'reply_only', 'already_sent', 'over_cap', 'paused', 'error')),
  error text,
  created_at timestamptz not null default now()
);
create index on public.ig_comment_events (business_id, created_at desc);
create index on public.ig_comment_events (rule_id, from_id);

alter table public.ig_autoreplies enable row level security;
alter table public.ig_comment_events enable row level security;
create policy "members read autoreplies" on public.ig_autoreplies for select using (private.is_member(business_id) or private.is_staff());
create policy "members read comment events" on public.ig_comment_events for select using (private.is_member(business_id) or private.is_staff());
-- Writes go through the server (owner/admin check, or the signed Meta webhook).
