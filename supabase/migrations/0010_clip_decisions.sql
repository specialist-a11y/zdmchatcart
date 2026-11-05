-- Use / Skip on ZDMINC clips. Run after 0009.
alter table public.video_clips add column skipped boolean not null default false;

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
