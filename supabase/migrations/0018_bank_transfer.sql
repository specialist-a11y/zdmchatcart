-- Bank transfer (1st Pay or any bank) as a second way to pay, checked by the owner. Run after 0017_seo.sql.

alter type public.order_status add value if not exists 'transfer_pending' after 'awaiting_payment';

alter table public.orders
  add column if not exists payment_method text not null default 'card' check (payment_method in ('card', 'transfer', 'cash')),
  add column if not exists transfer_reference text check (char_length(transfer_reference) <= 80),
  add column if not exists transfer_proof_path text,          -- screenshot in bucket transfer-proofs: <business_id>/<order_id>/<file>
  add column if not exists transfer_proof_hash text,          -- sha256 of the screenshot, to catch the same image used twice
  add column if not exists transfer_submitted_at timestamptz,
  add column if not exists transfer_reminded_at timestamptz;
create index if not exists orders_transfer_hash on public.orders (transfer_proof_hash) where transfer_proof_hash is not null;

alter table public.businesses
  add column if not exists bank_transfer_enabled boolean not null default false,
  add column if not exists bank_details text check (char_length(bank_details) <= 600);
-- The shop only needs to know whether the option is on. Bank details are sent in WhatsApp after an order, never exposed publicly.
grant select (bank_transfer_enabled) on public.businesses to anon, authenticated;

-- Owner confirms a transfer: transfer_pending can now be marked paid too.
create or replace function public.mark_order_paid(p_order uuid, p_txn text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  update public.orders set status = 'paid', paid_at = now(), fygaro_transaction_id = p_txn
  where id = p_order and status::text in ('awaiting_confirmation', 'awaiting_payment', 'transfer_pending', 'abandoned')
  returning * into o;
  if not found then return false; end if;
  update public.products p set stock = greatest(p.stock - i.quantity, 0)
  from public.order_items i where i.order_id = o.id and i.product_id = p.id and p.stock is not null;
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

-- Private bucket for payment screenshots, one folder per business.
insert into storage.buckets (id, name, public, file_size_limit)
values ('transfer-proofs', 'transfer-proofs', false, 10485760)
on conflict (id) do nothing;
drop policy if exists "members read their transfer proofs" on storage.objects;
create policy "members read their transfer proofs" on storage.objects for select
  using (bucket_id = 'transfer-proofs' and (private.is_member(((storage.foldername(name))[1])::uuid) or private.is_staff()));
-- Uploads happen on the server with the service role (from the WhatsApp webhook).
