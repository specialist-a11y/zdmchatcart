-- Evening-before pickup: the shopper picks their event date; they collect the evening before and return the
-- day after, and only the event nights are charged. Both days are held in the calendar.
-- Run after 0027. Safe to run more than once.
alter table public.businesses
  add column if not exists rental_eve_pickup boolean not null default false;
