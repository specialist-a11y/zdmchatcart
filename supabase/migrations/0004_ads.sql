-- Ads: campaigns ZDMINC runs in each client's own Meta ad account, client approval, daily spend,
-- and results counted from orders that came through each ad's ?ref=<code> link. Run after 0003.

alter table public.businesses add column if not exists ad_budget_monthly numeric(10,2) check (ad_budget_monthly is null or ad_budget_monthly >= 0);
grant select (ad_budget_monthly) on public.businesses to anon, authenticated;

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null check (code ~ '^A-[0-9]{1,4}$'),            -- tracking code, used as ?ref=A-3 on the shop link
  name text not null check (length(name) between 2 and 120),
  kind text not null default 'boost' check (kind in ('boost', 'retargeting', 'launch', 'other')),
  status text not null default 'needs_approval'
    check (status in ('draft', 'needs_approval', 'changes_requested', 'approved', 'running', 'paused', 'ended')),
  daily_budget numeric(10,2) not null check (daily_budget > 0),
  starts_on date,
  ends_on date check (ends_on is null or starts_on is null or ends_on >= starts_on),
  clip_id uuid references public.video_clips(id) on delete set null,
  caption text,
  audience text,
  client_note text,                                               -- what the client asked to change
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, code)
);
create index on public.ad_campaigns (business_id, created_at desc);

create table public.ad_spend (
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  day date not null,
  amount numeric(10,2) not null check (amount >= 0),
  impressions integer check (impressions is null or impressions >= 0),
  clicks integer check (clicks is null or clicks >= 0),
  primary key (campaign_id, day)
);
create index on public.ad_spend (business_id, day);

-- Next free code for a business: A-1, A-2...
create or replace function public.next_ad_code(bid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select 'A-' || (coalesce(max(substring(code from 3)::int), 0) + 1)::text from public.ad_campaigns where business_id = bid;
$$;
revoke execute on function public.next_ad_code(uuid) from public, anon, authenticated;

-- Owners and admins approve or ask for changes; nothing else on the row is theirs to edit.
create or replace function public.review_ad(p_campaign uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.ad_campaigns;
begin
  select * into c from public.ad_campaigns where id = p_campaign;
  if c.id is null or not private.is_admin(c.business_id) then raise exception 'not allowed'; end if;
  if c.status not in ('needs_approval', 'changes_requested') then return c.status; end if;
  if p_approve then
    update public.ad_campaigns set status = 'approved', approved_at = now(), approved_by = auth.uid(), client_note = null where id = c.id;
    return 'approved';
  end if;
  update public.ad_campaigns set status = 'changes_requested', client_note = left(coalesce(p_note, ''), 1000) where id = c.id;
  return 'changes_requested';
end $$;
revoke execute on function public.review_ad(uuid, boolean, text) from public, anon;
grant execute on function public.review_ad(uuid, boolean, text) to authenticated;

alter table public.ad_campaigns enable row level security;
alter table public.ad_spend enable row level security;
create policy "members read campaigns" on public.ad_campaigns for select using (private.is_member(business_id) or private.is_staff());
create policy "staff manage campaigns" on public.ad_campaigns for all using (private.is_staff()) with check (private.is_staff());
create policy "members read spend" on public.ad_spend for select using (private.is_member(business_id) or private.is_staff());
create policy "staff manage spend" on public.ad_spend for all using (private.is_staff()) with check (private.is_staff());
