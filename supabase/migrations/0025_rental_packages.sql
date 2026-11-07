-- Rental packages: a package lists the rental items it is made of, e.g. Backyard Movie Night = projector + 14ft screen + popcorn machine.
-- Booking the package holds those items for the same dates, and an item that is already out makes the package unavailable.
-- Run after 0024. Safe to run more than once.
alter table public.products
  add column if not exists includes jsonb not null default '[]'::jsonb;
alter table public.products drop constraint if exists products_includes_array;
alter table public.products add constraint products_includes_array check (jsonb_typeof(includes) = 'array' and jsonb_array_length(includes) <= 20);
