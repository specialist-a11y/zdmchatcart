/** Pure helpers for order codes, money and WhatsApp message text (no server imports, so they are testable). */

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

export function orderSummary(code: string, items: LineItem[], total: number | string, currency: string): string {
  const lines = items.map((i) => `• ${i.quantity} x ${i.name}: ${money(Number(i.unit_price) * i.quantity, currency)}`);
  return [`Order ${code}`, ...lines, `Total: ${money(total, currency)}`].join("\n");
}

export function waLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Price a cart against the catalog. Prices always come from the database, never the browser. */
export function priceCart(
  requested: { productId: string; quantity: number }[],
  catalog: { id: string; name: string; price: number | string; stock: number | null; active: boolean }[],
): { items: (LineItem & { product_id: string })[]; subtotal: number } | { error: string } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const merged = new Map<string, number>();
  for (const r of requested) merged.set(r.productId, (merged.get(r.productId) ?? 0) + r.quantity);
  const items: (LineItem & { product_id: string })[] = [];
  let cents = 0;
  for (const [id, qty] of merged) {
    const p = byId.get(id);
    if (!p || !p.active) return { error: "A product in your cart is no longer available." };
    if (p.stock !== null && qty > p.stock) return { error: `Only ${p.stock} left of ${p.name}.` };
    const unitCents = Math.round(Number(p.price) * 100);
    cents += unitCents * qty;
    items.push({ product_id: p.id, name: p.name, unit_price: unitCents / 100, quantity: qty });
  }
  if (items.length === 0) return { error: "Your cart is empty." };
  return { items, subtotal: cents / 100 };
}
