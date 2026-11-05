-- Hero section text on the website: headline, sub-headline and a short paragraph. Run after 0012. Safe to run twice.
alter table public.businesses
  add column if not exists hero_headline text check (hero_headline is null or char_length(hero_headline) <= 120),
  add column if not exists hero_subheadline text check (hero_subheadline is null or char_length(hero_subheadline) <= 200),
  add column if not exists hero_text text check (hero_text is null or char_length(hero_text) <= 600);
-- Shown on the public shop page, so readable with the public key (see 0003).
grant select (hero_headline, hero_subheadline, hero_text) on public.businesses to anon, authenticated;
