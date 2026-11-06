/** AI product assistant helpers (pure, tested). */

/** A customer message worth answering: a question about products, prices, stock, sizes, delivery or opening times. */
export function looksLikeQuestion(text: string) {
  const t = text.trim().toLowerCase();
  if (t.length < 4 || t.length > 600) return false;
  if (/^(ok|okay|thanks|thank you|ty|yes|no|cool|great|perfect|done|paid|sent)[.!]*$/.test(t)) return false;
  return t.includes("?") || /\b(how much|price|cost|do you (have|sell|make|do|deliver)|got any|available|in stock|sizes?|flavou?rs?|colou?rs?|deliver|open|close|when|where|which|what|can i|is there|are there)\b/.test(t);
}

type P = { name: string; price: number | string; description?: string | null; stock?: number | null; category?: string | null; price_note?: string | null; variants?: unknown; kind?: string | null; rental?: boolean | null; rental_unit?: string | null };

/** The shop's live products as short lines the assistant can quote from. Nothing else is known. */
export function catalogFacts(products: P[], currency: string, max = 60) {
  return products.slice(0, max).map((p) => {
    const vs = Array.isArray(p.variants) ? (p.variants as { name?: string; price?: number; available?: boolean }[]).filter((v) => v?.name) : [];
    const price = Number(p.price) === 0 && !vs.length ? "price on request"
      : vs.length ? vs.map((v) => `${v.name} ${currency} ${Number(v.price).toFixed(2)}${v.available === false ? " (not available now)" : ""}`).join(", ")
      : `${currency} ${Number(p.price).toFixed(2)}${p.rental ? ` per ${p.rental_unit === "night" ? "night" : "day"}` : ""}${p.price_note ? ` ${p.price_note}` : ""}`;
    const stock = p.stock === 0 ? " · sold out" : "";
    const about = p.description ? ` · ${p.description.replace(/\s+/g, " ").slice(0, 160)}` : "";
    return `- ${p.name}${p.category ? ` [${p.category}]` : ""}: ${price}${stock}${about}`;
  }).join("\n");
}

/** At most this many AI replies to one customer per day, so a long chat goes to a person. */
export const AI_DAILY_LIMIT = 5;
export const PERSON_QUIET_HOURS = 2;
