-- Content library and social scheduling. Run after 0008.
-- The video library becomes a content library: photos as well as videos, uploaded by ZDMINC
-- (from a shoot) or by the client. Any item can be scheduled to Instagram and/or Facebook.

-- Library items ---------------------------------------------------------------------------
alter table public.video_clips alter column shoot_id drop not null;   -- client uploads have no shoot
alter table public.video_clips
  add column kind text not null default 'video' check (kind in ('video', 'image')),
  add column source text not null default 'zdm' check (source in ('zdm', 'client')),
  add column uploaded_by uuid references auth.users(id) on delete set null;
create index on public.video_clips (business_id, kind, created_at desc);

-- Scheduled posts -------------------------------------------------------------------------
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  media_ids uuid[] not null check (cardinality(media_ids) between 1 and 10),   -- video_clips ids, in order
  platforms text[] not null check (cardinality(platforms) between 1 and 2 and platforms <@ array['instagram', 'facebook']),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  publish_state jsonb not null default '{}',  -- Instagram containers while a video processes, and per-platform errors
  ig_media_id text,
  ig_permalink text,
  fb_post_id text,
  error text,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index on public.social_posts (business_id, scheduled_at desc);
create index on public.social_posts (status, scheduled_at) where status in ('scheduled', 'publishing');

alter table public.social_posts enable row level security;
create policy "members read posts" on public.social_posts for select
  using (private.is_member(business_id) or private.is_staff());
-- Writes go through the server (membership check) and the publishing cron (service role).

-- The cron claims due posts so two runs never publish the same post twice.
create or replace function public.claim_due_posts(p_limit integer default 10)
returns setof public.social_posts language sql security definer set search_path = '' as $$
  update public.social_posts p
  set status = 'publishing', attempts = p.attempts + 1, locked_until = now() + interval '4 minutes'
  where p.id in (
    select id from public.social_posts
    where ((status = 'scheduled' and scheduled_at <= now()) or status = 'publishing')
      and (locked_until is null or locked_until < now())
    order by scheduled_at
    limit p_limit
    for update skip locked
  )
  returning p.*;
$$;
revoke execute on function public.claim_due_posts(integer) from public, anon, authenticated;
