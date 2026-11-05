/** Search engine helpers for shop pages: slugs, titles, descriptions and schema.org data. Pure, no I/O. */
import { DAYS, type Hours } from "./hours.ts";
import { displayPrice, readVariants } from "./catalog.ts";

/** "Black Cake (8 inch)!" -> "black-cake-8-inch" */
export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "item";
}

/** A slug not already used by another product in the shop. */
export function uniqueSlug(name: string, taken: Set<string>) {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Last line of the address, like "Holetown, St James". Adds Barbados for BBD shops if it's missing. */
export function area(address: string | null | undefined, currency?: string) {
  const line = (address ?? "").split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "";
  if (!line) return currency === "BBD" ? "Barbados" : "";
  return currency === "BBD" && !/barbados/i.test(line) ? `${line}, Barbados` : line;
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const KIND: Record<string, string> = { caterer: "Caterer", artist: "Artist", beauty: "Beauty", trades: "Services" };

export function shopTitle(b: { name: string; seo_title?: string | null; address?: string | null; currency?: string; site_template?: string | null }) {
  if (clean(b.seo_title)) return clip(clean(b.seo_title), 70);
  const where = area(b.address, b.currency).split(",")[0];
  return clip(`${b.name}${where ? ` · ${KIND[b.site_template ?? ""] ? `${KIND[b.site_template!]} in ` : ""}${where}` : ""} | Order online`, 70);
}

export function shopDescription(b: { name: string; seo_description?: string | null; description?: string | null; tagline?: string | null; address?: string | null; currency?: string }) {
  if (clean(b.seo_description)) return clip(clean(b.seo_description), 160);
  const where = area(b.address, b.currency);
  const lead = clean(b.description) || clean(b.tagline) || `${b.name}.`;
  return clip(`${lead.replace(/[.!]?$/, ".")} Order online, pay securely by card${where ? `, pickup or delivery in ${where.split(",")[0]}` : ""}.`, 160);
}

export function productTitle(p: { name: string }, b: { name: string }) {
  return clip(`${p.name} | ${b.name}`, 70);
}

export function productDescription(p: { name: string; description?: string | null; price: number | string; variants?: unknown }, b: { name: string; currency: string; address?: string | null }) {
  const { amount, from } = displayPrice(p);
  const price = amount > 0 ? ` ${from ? "From" : "Just"} ${b.currency} ${amount.toFixed(2)}.` : "";
  const where = area(b.address, b.currency).split(",")[0];
  return clip(`${clean(p.description) || `${p.name} from ${b.name}.`}${price} Order online${where ? ` in ${where}` : ""} and pay by card.`.replace("..", "."), 160);
}

/** schema.org type from the website template. */
export function schemaType(template: string | null | undefined) {
  return ({ caterer: "FoodEstablishment", beauty: "BeautySalon", trades: "HomeAndConstructionBusiness", artist: "ArtGallery" } as Record<string, string>)[template ?? ""] ?? "Store";
}

const DAY_URL: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export function openingHoursSpec(hours: Hours) {
  return DAYS.flatMap((d) => (hours[d] ?? []).map(([opens, closes]) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAY_URL[d]}`, opens, closes,
  })));
}

const handle = (s: string) => s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//, "").replace(/\/$/, "");

type ShopB = {
  name: string; description?: string | null; tagline?: string | null; logo_url?: string | null; hero_image_url?: string | null; address?: string | null;
  whatsapp_number?: string | null; currency: string; instagram?: string | null; facebook?: string | null; website_url?: string | null; site_template?: string | null;
};
type ShopP = { name: string; description?: string | null; price: number | string; variants?: unknown; image_url?: string | null; stock?: number | null; slug?: string | null; id: string };

/** The availability Google understands. */
const availability = (p: ShopP) => (p.stock === 0 || (readVariants(p.variants).length > 0 && !readVariants(p.variants).some((v) => v.available)) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock");

export function productLd(p: ShopP, b: ShopB, url: string) {
  const vs = readVariants(p.variants).filter((v) => v.available && v.price > 0);
  const { amount } = displayPrice(p);
  const offers = vs.length > 1
    ? { "@type": "AggregateOffer", priceCurrency: b.currency, lowPrice: Math.min(...vs.map((v) => v.price)).toFixed(2), highPrice: Math.max(...vs.map((v) => v.price)).toFixed(2), offerCount: vs.length, availability: availability(p) }
    : amount > 0 ? { "@type": "Offer", priceCurrency: b.currency, price: amount.toFixed(2), availability: availability(p), url, seller: { "@type": "Organization", name: b.name } } : undefined;
  return {
    "@type": "Product", name: p.name, description: clean(p.description) || undefined, image: p.image_url ? [p.image_url] : undefined, url,
    brand: { "@type": "Brand", name: b.name }, ...(offers ? { offers } : {}),
  };
}

/** LocalBusiness data for the shop home page. */
export function shopLd(b: ShopB, opts: { url: string; hours: Hours; products: ShopP[]; productUrl: (p: ShopP) => string }) {
  const sameAs = [
    b.instagram ? `https://www.instagram.com/${handle(b.instagram)}` : null,
    b.facebook ? `https://www.facebook.com/${handle(b.facebook)}` : null,
    b.website_url && /^https?:\/\//.test(b.website_url) ? b.website_url : null,
  ].filter(Boolean);
  const where = area(b.address, b.currency);
  const spec = openingHoursSpec(opts.hours);
  return {
    "@context": "https://schema.org",
    "@type": schemaType(b.site_template), "@id": `${opts.url}#business`, name: b.name, url: opts.url,
    description: clean(b.description) || clean(b.tagline) || undefined,
    image: [b.hero_image_url, b.logo_url].filter(Boolean),
    logo: b.logo_url ?? undefined,
    telephone: b.whatsapp_number ? `+${b.whatsapp_number.replace(/\D/g, "")}` : undefined,
    currenciesAccepted: b.currency,
    paymentAccepted: "Credit card, Debit card",
    address: b.address ? { "@type": "PostalAddress", streetAddress: b.address.split("\n").map((l) => l.trim()).filter(Boolean).join(", "), addressLocality: where.split(",")[0] || undefined, addressCountry: b.currency === "BBD" ? "BB" : undefined } : undefined,
    ...(spec.length ? { openingHoursSpecification: spec } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    hasOfferCatalog: opts.products.length ? {
      "@type": "OfferCatalog", name: `${b.name} menu`,
      itemListElement: opts.products.slice(0, 60).map((p) => ({ "@type": "Offer", itemOffered: productLd(p, b, opts.productUrl(p)) })),
    } : undefined,
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })) };
}

/** Safe to drop into a <script type="application/ld+json">. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** What the owner sees as the Google result, and what's wrong with it. */
export function seoChecks(title: string, description: string) {
  const out: string[] = [];
  if (title.length < 20) out.push("Title is short. Add what you sell and where.");
  if (description.length < 70) out.push("Description is short. Aim for 120 to 160 characters.");
  if (description.length > 160) out.push("Description is long; Google cuts it at about 160 characters.");
  return out;
}
