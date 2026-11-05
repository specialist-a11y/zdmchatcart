/** Pure helpers for order codes, money and WhatsApp message text (no server imports, so they are testable). */
import { readVariants } from "./catalog.ts";

export const ORDER_CODE_RE = /\b([A-Z]{1,4})-(\d{3,})\b/i;

export function extractOrderCode(text: string): string | null {
  const m = text.match(ORDER_CODE_RE);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

export function money(amount: number | string, currency = "BBD"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `${currency === "BBD" ? "BBD $" : currency + " "}${n.toFixed(2)}`;
}

export type LineItem = { name: string; unit_price: number | string; quantity: number };

/** True when any line is "price on request" (saved at 0) and the owner still has to set a price. */
export const needsPrice = (items: { unit_price: number | string }[]) => items.some((i) => Number(i.unit_price) === 0);

export function orderSummary(code: string, items: LineItem[], total: number | string, currency: string): string {
  const lines = items.map((i) => `• ${i.quantity} x ${i.name}: ${Number(i.unit_price) === 0 ? "price to confirm" : money(Number(i.unit_price) * i.quantity, currency)}`);
  const last = needsPrice(items)
    ? (Number(total) > 0 ? `Total so far: ${money(total, currency)}, plus the items to confirm` : "Total: to confirm")
    : `Total: ${money(total, currency)}`;
  return [`Order ${code}`, ...lines, last].join("\n");
}

/**
 * The automatic WhatsApp reply when a customer sends their order code.
 * No payment link while prices are still to confirm; the pickup/delivery question only for physical products.
 */
export function orderReply(o: { code: string; items: LineItem[]; total: number | string; currency: string; paymentUrl: string | null; hasProducts: boolean; anyServices: boolean }) {
  const kind = o.anyServices && !o.hasProducts ? "booking" : "order";
  const summary = orderSummary(o.code, o.items, o.total, o.currency);
  if (needsPrice(o.items)) return `Thanks! Here's your request:\n${summary}\n\nWe'll confirm the price and send your payment link shortly.`;
  const ask = o.hasProducts ? "\n\nReply PICKUP or DELIVERY so we know how to get it to you." : "";
  return o.paymentUrl
    ? `Thanks! Here's your ${kind}:\n${summary}\n\nPay securely here: ${o.paymentUrl}${ask}`
    : `Thanks! Here's your ${kind}:\n${summary}\n\nWe'll send your payment link shortly.${ask}`;
}

export function waLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Price a cart against the catalog. Prices always come from the database, never the browser.
 *  Items with options (variants) need a variantId, and that option's price is used. */
export function priceCart(
  requested: { productId: string; variantId?: string | null; quantity: number }[],
  catalog: { id: string; name: string; price: number | string; stock: number | null; active: boolean; variants?: unknown }[],
): { items: (LineItem & { product_id: string })[]; subtotal: number } | { error: string } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const merged = new Map<string, { productId: string; variantId: string | null; qty: number }>();
  for (const r of requested) {
    const key = r.variantId ? `${r.productId}:${r.variantId}` : r.productId;
    const m = merged.get(key) ?? { productId: r.productId, variantId: r.variantId ?? null, qty: 0 };
    m.qty += r.quantity;
    merged.set(key, m);
  }
  const perProduct = new Map<string, number>();
  const items: (LineItem & { product_id: string })[] = [];
  let cents = 0;
  for (const { productId, variantId, qty } of merged.values()) {
    const p = byId.get(productId);
    if (!p || !p.active) return { error: "A product in your cart is no longer available." };
    const variants = readVariants(p.variants);
    let name = p.name, price = Number(p.price);
    if (variants.length) {
      const v = variants.find((x) => x.id === variantId);
      if (!v) return { error: `Pick an option for ${p.name}.` };
      if (!v.available) return { error: `${p.name} (${v.name}) isn't available right now.` };
      name = `${p.name} (${v.name})`;
      price = v.price;
    } else if (variantId) {
      return { error: `${p.name} has changed. Please add it to your cart again.` };
    }
    const total = (perProduct.get(productId) ?? 0) + qty;
    perProduct.set(productId, total);
    if (p.stock !== null && total > p.stock) return { error: `Only ${p.stock} left of ${p.name}.` };
    const unitCents = Math.round(price * 100);
    cents += unitCents * qty;
    items.push({ product_id: p.id, name, unit_price: unitCents / 100, quantity: qty });
  }
  if (items.length === 0) return { error: "Your cart is empty." };
  return { items, subtotal: cents / 100 };
}
