-- Content library, social scheduling, clip decisions, and upload RLS policies (idempotent).
-- Safe to run in the Supabase SQL Editor even if 0009 or parts of 0010 were already run.

-- 1. Library items (0009 + 0010) ----------------------------------------------------------
alter table public.video_clips alter column shoot_id drop not null;
alter table public.video_clips
  add column if not exists kind text not null default 'video' check (kind in ('video', 'image')),
  add column if not exists source text not null default 'zdm' check (source in ('zdm', 'client')),
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists skipped boolean not null default false;

create index if not exists video_clips_business_kind_created_idx
  on public.video_clips (business_id, kind, created_at desc);

-- 2. Scheduled posts (0009) ---------------------------------------------------------------
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  media_ids uuid[] not null check (cardinality(media_ids) between 1 and 10),
  platforms text[] not null check (cardinality(platforms) between 1 and 2 and platforms <@ array['instagram', 'facebook']),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  publish_state jsonb not null default '{}',
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

create index if not exists social_posts_business_scheduled_idx
  on public.social_posts (business_id, scheduled_at desc);
create index if not exists social_posts_due_idx
  on public.social_posts (status, scheduled_at) where status in ('scheduled', 'publishing');

alter table public.social_posts enable row level security;

drop policy if exists "members read posts" on public.social_posts;
create policy "members read posts" on public.social_posts for select
  using (private.is_member(business_id) or private.is_staff());

drop policy if exists "admins manage posts" on public.social_posts;
create policy "admins manage posts" on public.social_posts for all
  using (private.is_admin(business_id) or private.is_staff())
  with check (private.is_admin(business_id) or private.is_staff());

-- 3. Claim due posts RPC (0009) -----------------------------------------------------------
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

-- 4. Decide clip RPC (0010) ---------------------------------------------------------------
create or replace function public.decide_clip(p_clip uuid, p_decision text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  if p_decision not in ('use', 'skip', 'new') then return false; end if;
  select business_id into bid from public.video_clips where id = p_clip and status = 'published';
  if bid is null or not private.is_member(bid) then return false; end if;
  update public.video_clips set
    chosen = p_decision = 'use',
    chosen_at = case when p_decision = 'use' then now() end,
    skipped = p_decision = 'skip'
  where id = p_clip;
  return true;
end $$;
revoke execute on function public.decide_clip(uuid, text) from public, anon;
grant execute on function public.decide_clip(uuid, text) to authenticated;

-- 5. Storage & video_clips RLS policies for client uploads --------------------------------
drop policy if exists "members upload their own content" on storage.objects;
create policy "members upload their own content" on storage.objects for insert
  with check (
    bucket_id = 'client-videos'
    and (storage.foldername(name))[2] = 'uploads'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff())
  );

drop policy if exists "members update their own content" on storage.objects;
create policy "members update their own content" on storage.objects for update
  using (
    bucket_id = 'client-videos'
    and (storage.foldername(name))[2] = 'uploads'
    and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff())
  );

drop policy if exists "members delete their own content" on storage.objects;
create policy "members delete their own content" on storage.objects for delete
  using (
    bucket_id = 'client-videos'
    and (storage.foldername(name))[2] = 'uploads'
    and (private.is_admin(((storage.foldername(name))[1])::uuid) or private.is_staff())
  );

drop policy if exists "members insert client clips" on public.video_clips;
create policy "members insert client clips" on public.video_clips for insert
  with check (
    source = 'client'
    and (private.is_member(business_id) or private.is_staff())
  );

drop policy if exists "members delete client clips" on public.video_clips;
create policy "members delete client clips" on public.video_clips for delete
  using (
    source = 'client'
    and (private.is_admin(business_id) or private.is_staff())
  );
