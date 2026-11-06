-- Rental mode: products rented by the day or night, booked for dates, a set number of units owned.
-- Run after 0020_product_import.sql.

-- Products: a rental uses `stock` as how many units the business owns, and stock never goes down when rented.
alter table public.products
  add column if not exists rental boolean not null default false,
  add column if not exists rental_unit text not null default 'day' check (rental_unit in ('day', 'night')),
  add column if not exists deposit numeric(10,2) not null default 0 check (deposit >= 0),
  add column if not exists min_days integer not null default 1 check (min_days between 1 and 30);

-- Shop rental settings (public: the shop page needs them).
alter table public.businesses
  add column if not exists rental_agreement_url text check (rental_agreement_url is null or rental_agreement_url ~ '^https?://'),
  add column if not exists rental_pickup_times text check (char_length(rental_pickup_times) <= 300),
  add column if not exists rental_lead_days integer not null default 1 check (rental_lead_days between 0 and 60),
  add column if not exists rental_buffer_days integer not null default 0 check (rental_buffer_days between 0 and 7);
grant select (rental_agreement_url, rental_pickup_times, rental_lead_days, rental_buffer_days) on public.businesses to anon, authenticated;

-- Orders: the booked dates (end = return day, exclusive), pickup time, agreement and deposit.
alter table public.orders
  add column if not exists rental_start date,
  add column if not exists rental_end date,
  add column if not exists rental_days integer,
  add column if not exists rental_unit text,
  add column if not exists pickup_time text,
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists deposit numeric(10,2) not null default 0,
  add column if not exists picked_up_at timestamptz,
  add column if not exists returned_at timestamptz,
  add column if not exists deposit_returned_at timestamptz;
alter table public.orders drop constraint if exists orders_rental_dates;
alter table public.orders add constraint orders_rental_dates check (rental_start is null or (rental_end > rental_start));
create index if not exists orders_rentals on public.orders (business_id, rental_start, rental_end) where rental_start is not null;

-- Paying for a rental doesn't use up stock: the units come back.
create or replace function public.mark_order_paid(p_order uuid, p_txn text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  update public.orders set status = 'paid', paid_at = now(), fygaro_transaction_id = p_txn
  where id = p_order and status::text in ('awaiting_confirmation', 'awaiting_payment', 'transfer_pending', 'abandoned')
  returning * into o;
  if not found then return false; end if;
  update public.products p set stock = greatest(p.stock - i.quantity, 0)
  from public.order_items i where i.order_id = o.id and i.product_id = p.id and p.stock is not null and not p.rental;
  if o.customer_id is not null then
    update public.customers c set
      total_spent = c.total_spent + o.total,
      order_count = c.order_count + 1,
      stage = case when c.order_count >= 1 then 'repeat'::public.customer_stage else 'paid'::public.customer_stage end,
      last_seen_at = now()
    where c.id = o.customer_id;
  end if;
  return true;
end $$;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- Double bookings: the orders API checks free units before saving and checks again right after,
-- cancelling its own order if two shoppers took the last unit at the same moment.
