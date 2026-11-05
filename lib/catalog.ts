/** Products, services, their options (variants), and website templates. Pure: used by the shop, the editor, the order API and tests. */

export type Variant = { id: string; name: string; price: number; available: boolean };
export type CatalogItem = {
  id: string; name: string; description: string | null; price: number | string; image_url: string | null;
  stock: number | null; kind?: "product" | "service"; category?: string | null; price_note?: string | null; variants?: unknown;
};

export const MAX_VARIANTS = 30;

/** Read the variants column safely (it's JSON from the database or the browser). */
export function readVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const id = String(o.id ?? "").slice(0, 12), name = String(o.name ?? "").trim().slice(0, 60), price = Number(o.price);
    if (!/^[a-z0-9]{2,12}$/i.test(id) || !name || !Number.isFinite(price) || price < 0) return [];
    return [{ id, name, price: Math.round(price * 100) / 100, available: o.available !== false }];
  }).slice(0, MAX_VARIANTS);
}

/** Clean variants typed in the editor: drop blank rows, give new rows ids, keep ids unique. */
export function cleanVariants(rows: { id?: string; name: string; price: string | number; available?: boolean }[], makeId: () => string): Variant[] | { error: string } {
  const out: Variant[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    const priceText = String(r.price).trim();
    if (!name && !priceText) continue;
    if (!name) return { error: "Every option needs a name, like 8 inch or 60 minutes." };
    const price = Number(priceText);
    if (priceText === "" || !Number.isFinite(price) || price < 0) return { error: `Give "${name}" a price (0 for price on request).` };
    let id = r.id && /^[a-z0-9]{2,12}$/i.test(r.id) && !seen.has(r.id) ? r.id : makeId();
    while (seen.has(id)) id = makeId();
    seen.add(id);
    out.push({ id, name: name.slice(0, 60), price: Math.round(price * 100) / 100, available: r.available !== false });
  }
  if (out.length > MAX_VARIANTS) return { error: `Up to ${MAX_VARIANTS} options per item.` };
  return out;
}

/** The "from" price shown on cards: the cheapest available option, or the base price. */
export function displayPrice(p: { price: number | string; variants?: unknown }) {
  const vs = readVariants(p.variants).filter((v) => v.available);
  if (!vs.length) return { amount: Number(p.price), from: false };
  const prices = vs.map((v) => v.price);
  const min = Math.min(...prices);
  return { amount: min, from: prices.some((x) => x !== min) };
}

/** Cart lines are keyed "productId" or "productId:variantId". */
export const cartKey = (productId: string, variantId?: string | null) => (variantId ? `${productId}:${variantId}` : productId);
export function splitKey(key: string) {
  const [productId, variantId] = key.split(":");
  return { productId, variantId: variantId || null };
}

/* Website templates --------------------------------------------------------------------- */
export type TemplateId = "classic" | "caterer" | "artist" | "beauty" | "trades";
export type Template = {
  id: TemplateId; name: string; for: string; blurb: string;
  layout: "grid" | "menu" | "gallery";
  add: string;          // button on each item
  cta: string;          // cart button
  greeting: string;     // first line of the WhatsApp message
  font?: { family: string; url: string };
  swatch: [string, string, string];
};

export const TEMPLATES: Template[] = [
  { id: "classic", name: "Classic shop", for: "Any business", blurb: "Clean product grid in your brand colour.", layout: "grid",
    add: "Add", cta: "Order on WhatsApp", greeting: "Hi! I'd like to place order", swatch: ["#ffffff", "#0b0f0e", "#3d8bff"] },
  { id: "caterer", name: "Caterer & kitchen", for: "Caterers, bakers, food spots", blurb: "Warm menu layout grouped by course, with a big food photo up top.", layout: "menu",
    add: "Add", cta: "Send my order", greeting: "Hi! I'd like to place order",
    font: { family: "'Playfair Display', Georgia, serif", url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap" },
    swatch: ["#fbf6ee", "#3b2a1e", "#c8743a"] },
  { id: "artist", name: "Artist & maker", for: "Artists, photographers, crafters", blurb: "Dark gallery that lets the work speak. Tap a piece to see it large.", layout: "gallery",
    add: "Enquire", cta: "Enquire on WhatsApp", greeting: "Hi! I'm interested in",
    font: { family: "'Space Grotesk', system-ui, sans-serif", url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" },
    swatch: ["#111111", "#f4f1ea", "#d9b26f"] },
  { id: "beauty", name: "Beauty & wellness", for: "Salons, nails, lashes, spas", blurb: "Soft, elegant service menu with times and prices, made for bookings.", layout: "menu",
    add: "Book", cta: "Book on WhatsApp", greeting: "Hi! I'd like to book",
    font: { family: "'Cormorant Garamond', Georgia, serif", url: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap" },
    swatch: ["#fbf3f1", "#4a2f35", "#c98b8b"] },
  { id: "trades", name: "Trades & services", for: "Plumbers, electricians, mechanics, cleaners", blurb: "Bold, no-nonsense service cards and a big Get a quote button.", layout: "grid",
    add: "Add to quote", cta: "Get a quote on WhatsApp", greeting: "Hi! I'd like a quote for request",
    swatch: ["#f5f5f2", "#111111", "#f5b400"] },
];
export const template = (id?: string | null) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** Quick-fill option sets for the editor. */
export const PRESETS: { label: string; kind: "product" | "service" | "any"; names: string[] }[] = [
  { label: "Sizes S/M/L", kind: "product", names: ["Small", "Medium", "Large"] },
  { label: "Cake sizes", kind: "product", names: ["6 inch", "8 inch", "10 inch"] },
  { label: "Half / full tray", kind: "product", names: ["Half tray", "Full tray"] },
  { label: "Durations", kind: "service", names: ["30 min", "60 min", "90 min"] },
  { label: "Hair length", kind: "service", names: ["Short", "Medium", "Long"] },
  { label: "Call-out / hourly", kind: "service", names: ["Call-out", "Per hour"] },
];
