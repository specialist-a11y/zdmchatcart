import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceCart } from "./order-text";

type Admin = SupabaseClient;
export type OrderLine = { productId: string; variantId?: string | null; quantity: number };

/** "uuid" or "uuid:variant" from a product picker. */
export function readPick(value: string): { productId: string; variantId: string | null } | null {
  const [productId, variantId] = value.split(":");
  return /^[0-9a-f-]{36}$/i.test(productId ?? "") ? { productId, variantId: variantId && /^[a-z0-9]{2,12}$/i.test(variantId) ? variantId : null } : null;
}

/** Create an order for a known customer from the CRM (chat or phone order). Prices come from the catalog. */
export async function createOrderFor(admin: Admin, opts: {
  businessId: string; currency: string; customerId: string | null; lines: OrderLine[];
  source: "whatsapp" | "instagram" | "manual"; fulfillment?: "pickup" | "delivery" | null; note?: string | null;
}) {
  if (!opts.lines.length) return { error: "Add at least one item" };
  const ids = opts.lines.map((l) => l.productId);
  let { data: catalog, error } = await admin.from("products").select("id, name, price, stock, active, variants").eq("business_id", opts.businessId).in("id", ids);
  if (error) catalog = (await admin.from("products").select("id, name, price, stock, active").eq("business_id", opts.businessId).in("id", ids)).data as typeof catalog;
  const priced = priceCart(opts.lines, catalog ?? []);
  if ("error" in priced) return { error: priced.error };
  const { data: code, error: codeErr } = await admin.rpc("next_order_code", { bid: opts.businessId });
  if (codeErr || !code) return { error: "Couldn't make an order code" };
  const { data: order, error: oErr } = await admin.from("orders").insert({
    business_id: opts.businessId, code, customer_id: opts.customerId, source: opts.source,
    subtotal: priced.subtotal, total: priced.subtotal, currency: opts.currency,
    fulfillment: opts.fulfillment ?? null, note: opts.note?.slice(0, 500) || null,
  }).select("id, code").single();
  if (oErr || !order) return { error: oErr?.message ?? "Couldn't create the order" };
  await admin.from("order_items").insert(priced.items.map((i) => ({ ...i, order_id: order.id, business_id: opts.businessId })));
  if (opts.customerId) await admin.from("customers").update({ stage: "ordered" }).eq("id", opts.customerId).eq("stage", "new");
  return { id: order.id as string, code: order.code as string, total: priced.subtotal, items: priced.items };
}
