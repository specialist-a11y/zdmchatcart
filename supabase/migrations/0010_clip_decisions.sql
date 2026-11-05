-- Use / Skip on ZDMINC clips. Run after 0009.
alter table public.video_clips add column if not exists skipped boolean not null default false;

-- Clients decide on a clip through this function so they can't edit anything else on the row.
-- p_decision: 'use', 'skip' or 'new' (undo).
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

-- RLS policies so business members can upload/delete their own media and schedule posts:
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

drop policy if exists "admins manage posts" on public.social_posts;
create policy "admins manage posts" on public.social_posts for all
  using (private.is_admin(business_id) or private.is_staff())
  with check (private.is_admin(business_id) or private.is_staff());
