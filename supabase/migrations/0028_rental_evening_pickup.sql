-- Rental settings, run after 0027. Safe to run more than once.
-- 1. Evening-before pickup: the shopper picks their event date; they collect the day before and return the day after.
--    Only the event nights are charged. Both days are held in the calendar.
-- 2. Deposit kind: 'refundable' (a security deposit added on top and given back) or 'booking'
--    (part of the price, paid first to secure the date; the balance is due at pickup).
-- 3. Pickup location: a map link or "lat, lng", sent to the customer once they've paid.
alter table public.businesses
  add column if not exists rental_eve_pickup boolean not null default false,
  add column if not exists rental_deposit_mode text not null default 'refundable',
  add column if not exists rental_pickup_map text;
alter table public.businesses drop constraint if exists businesses_rental_deposit_mode;
alter table public.businesses add constraint businesses_rental_deposit_mode check (rental_deposit_mode in ('refundable', 'booking'));
alter table public.businesses drop constraint if exists businesses_rental_pickup_map;
alter table public.businesses add constraint businesses_rental_pickup_map check (rental_pickup_map is null or char_length(rental_pickup_map) <= 300);

-- Which kind of deposit an order was booked with (null: none, or booked before this).
alter table public.orders
  add column if not exists deposit_kind text check (deposit_kind is null or deposit_kind in ('refundable', 'booking'));
