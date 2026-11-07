import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, holdsUnits, kitsFrom, type Booking, type Kits } from "./rental";

/** Bookings that hold units at any point between from and to (end exclusive), widened by the buffer days. */
export async function loadBookings(admin: SupabaseClient, businessId: string, from: string, to: string, bufferDays = 0, excludeOrderId?: string, upTo?: { id: string; created_at: string }): Promise<Booking[]> {
  let q = admin.from("orders")
    .select("id, status, created_at, rental_start, rental_end, order_items(product_id, quantity)")
    .eq("business_id", businessId)
    .not("rental_start", "is", null)
    .lt("rental_start", to)
    .gt("rental_end", addDays(from, -Math.max(0, bufferDays)))
    .limit(2000);
  if (excludeOrderId) q = q.neq("id", excludeOrderId);
  const { data } = await q;
  const now = Date.now();
  return (data ?? [])
    .filter((o: any) => holdsUnits(o.status, o.created_at, now))
    // upTo: only this order and the ones saved before it, so the later of two clashing orders is the one that gives way.
    .filter((o: any) => !upTo || o.id === upTo.id || o.created_at < upTo.created_at || (o.created_at === upTo.created_at && o.id < upTo.id))
    .flatMap((o: any) => (o.order_items ?? []).filter((i: any) => i.product_id).map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, start: o.rental_start, end: o.rental_end })));
}

/** Every active rental item of a shop (units owned) and which ones are packages. Works before migration 0025 (no packages then). */
export async function loadRentalCatalog(admin: SupabaseClient, businessId: string): Promise<{ products: { id: string; name: string; stock: number | null }[]; kits: Kits }> {
  const base = () => admin.from("products").select("id, name, stock").eq("business_id", businessId).eq("active", true).eq("rental", true);
  const { data, error } = await admin.from("products").select("id, name, stock, includes").eq("business_id", businessId).eq("active", true).eq("rental", true);
  const rows = (error ? (await base()).data : data) ?? [];
  return { products: rows.map((r: any) => ({ id: r.id, name: r.name, stock: r.stock })), kits: kitsFrom(rows as any[]) };
}
