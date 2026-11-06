-- One definitive mark_order_paid: card, cash and bank transfer, rentals keep their stock, and a payment
-- brings a Quiet customer back (from 0014). Run after 0018_bank_transfer.sql, even if 0021 ran first. Safe to run again.

create or replace function public.mark_order_paid(p_order uuid, p_txn text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  update public.orders set status = 'paid', paid_at = now(), fygaro_transaction_id = p_txn
  where id = p_order and status::text in ('awaiting_confirmation', 'awaiting_payment', 'transfer_pending', 'abandoned')
  returning * into o;
  if not found then return false; end if;
  -- Rentals come back, so paying for one doesn't use up stock.
  update public.products p set stock = greatest(p.stock - i.quantity, 0)
  from public.order_items i where i.order_id = o.id and i.product_id = p.id and p.stock is not null and not p.rental;
  if o.customer_id is not null then
    update public.customers c set
      total_spent = c.total_spent + o.total,
      order_count = c.order_count + 1,
      stage = case when c.order_count >= 1 then 'repeat'::public.customer_stage else 'paid'::public.customer_stage end,
      quiet_at = null,
      last_seen_at = now()
    where c.id = o.customer_id;
  end if;
  return true;
end $$;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
