/**
 * Bring a business's products in from the website they already have.
 * Pure parsing only (tested): CSV exports from Shopify, WooCommerce, Wix, Square or any spreadsheet,
 * Shopify's public products.json, WooCommerce's public Store API, and schema.org Product data on any page.
 */

export type ImportedProduct = {
  key: string;            // stable id from the old site, so importing again updates instead of duplicating
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  stock: number | null;   // null = not tracked
  active: boolean;        // visible on the old site
  sku: string | null;
};
export type ImportResult = { source: string; products: ImportedProduct[]; skipped: number; warnings: string[] };

const MAX = 1000;

// CSV ----------------------------------------------------------------------------------------
/** RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes, comma/semicolon/tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function stripHtml(html: string | null | undefined, max = 600): string | null {
  if (!html) return null;
  const t = html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return t ? (t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t) : null;
}

/** "$1,250.00", "1.250,00", "BBD 45" -> number, or null. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const toStock = (v: unknown): number | null => {
  const s = String(v ?? "").trim();
  if (!s || /unlimited|in stock|instock/i.test(s)) return null;
  const n = Math.floor(Number(s.replace(/[^\d-]/g, "")));
  return Number.isFinite(n) ? Math.max(0, n) : null;
};
const truthy = (v: unknown, dflt = true) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return dflt;
  return !["false", "0", "no", "draft", "archived", "hidden", "private", "-1", "n"].includes(s);
};
const firstUrl = (v: unknown) => String(v ?? "").split(/[,|\s]+/).find((u) => /^https?:\/\//i.test(u)) ?? null;
const slugKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Column names each platform uses, normalised. First match wins. */
const COLS = {
  name: ["title", "name", "product name", "item name", "product", "item"],
  price: ["variant price", "sale price", "regular price", "price", "selling price", "unit price"],
  regular: ["regular price"],
  sale: ["sale price"],
  description: ["body", "description", "short description", "product description", "details"],
  image: ["image src", "images", "productimageurl", "image url", "image", "picture", "photo url", "variant image"],
  stock: ["variant inventory qty", "stock", "inventory", "quantity", "qty", "stock quantity", "current quantity"],
  active: ["published", "status", "visible", "visibility", "enabled", "active"],
  sku: ["variant sku", "sku", "product code"],
  handle: ["handle", "id", "product id", "token", "handleid", "parent"],
  opt1: ["option1 value"], opt2: ["option2 value"],
};

export function detectPlatform(headers: string[]): string {
  const h = new Set(headers.map(norm));
  if (h.has("handle") && h.has("variant price")) return "Shopify";
  if (h.has("regular price") && (h.has("type") || h.has("sku"))) return "WooCommerce";
  if (h.has("handleid") || h.has("productimageurl")) return "Wix";
  if (h.has("item name") && h.has("token")) return "Square";
  return "Spreadsheet";
}

export function productsFromCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { source: "CSV", products: [], skipped: 0, warnings: ["The file has no product rows."] };
  const headers = rows[0];
  const platform = detectPlatform(headers);
  const idx = (names: string[]) => { const n = headers.map(norm); for (const want of names) { const i = n.indexOf(want); if (i >= 0) return i; } return -1; };
  const c = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, idx(v)])) as Record<keyof typeof COLS, number>;
  const warnings: string[] = [];
  if (c.name < 0 && platform !== "Shopify") return { source: platform, products: [], skipped: rows.length - 1, warnings: ["Couldn't find a Name or Title column."] };
  if (c.price < 0) warnings.push("No price column found; prices are set to 0 for you to fill in.");

  const out: ImportedProduct[] = [];
  let skipped = 0;
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  // Shopify repeats the handle on variant and extra-image rows, with the title only on the first.
  const parent = new Map<string, { name: string; description: string | null; image: string | null; active: boolean }>();

  for (const r of rows.slice(1)) {
    const handle = cell(r, c.handle);
    let name = cell(r, c.name);
    const base = handle ? parent.get(handle) : undefined;
    if (!name && base) name = base.name;
    const priceRaw = platform === "WooCommerce" && cell(r, c.sale) ? cell(r, c.sale) : platform === "WooCommerce" ? cell(r, c.regular) || cell(r, c.price) : cell(r, c.price);
    if (!name || (platform === "Shopify" && !priceRaw && base)) { skipped++; continue; } // image-only rows
    if (platform === "WooCommerce" && /^variable$/i.test(cell(r, idx(["type"])))) { skipped++; continue; } // the variations carry the prices
    const description = stripHtml(cell(r, c.description)) ?? base?.description ?? null;
    const image = firstUrl(cell(r, c.image)) ?? base?.image ?? null;
    const active = c.active >= 0 && cell(r, c.active) !== "" ? truthy(cell(r, c.active)) : base?.active ?? true;
    if (handle && !base) parent.set(handle, { name, description, image, active });
    const opts = [cell(r, c.opt1), cell(r, c.opt2)].filter((o) => o && !/^default title$/i.test(o));
    const full = opts.length ? `${name} (${opts.join(", ")})` : name;
    const sku = cell(r, c.sku) || null;
    out.push({
      key: `${platform.toLowerCase()}:${sku || slugKey(`${handle || name}-${opts.join("-")}`)}`,
      name: full.slice(0, 120), price: parsePrice(priceRaw) ?? 0, description, image_url: image,
      stock: toStock(cell(r, c.stock)), active, sku,
    });
    if (out.length >= MAX) { warnings.push(`Only the first ${MAX} products were read.`); break; }
  }
  return { source: platform, products: dedupe(out), skipped, warnings };
}

function dedupe(list: ImportedProduct[]) {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
}

// From a website link -------------------------------------------------------------------------
/** Shopify: https://shop.com/products.json?limit=250&page=N */
export function productsFromShopifyJson(json: any, host: string): ImportedProduct[] {
  const out: ImportedProduct[] = [];
  for (const p of json?.products ?? []) {
    const img = p.images?.[0]?.src ?? null;
    const variants: any[] = p.variants?.length ? p.variants : [{}];
    for (const v of variants) {
      const opt = [v.option1, v.option2].filter((o: any) => o && !/^default title$/i.test(o));
      out.push({
        key: `shopify:${host}:${v.id ?? p.id}`,
        name: (opt.length ? `${p.title} (${opt.join(", ")})` : p.title ?? "").slice(0, 120),
        price: parsePrice(v.price) ?? 0,
        description: stripHtml(p.body_html),
        image_url: (v.featured_image?.src ?? img) || null,
        stock: null, active: v.available !== false, sku: v.sku || null,
      });
    }
  }
  return out.filter((p) => p.name);
}

/** WooCommerce Store API: https://shop.com/wp-json/wc/store/v1/products?per_page=100&page=N (prices in minor units). */
export function productsFromWooStore(json: any, host: string): ImportedProduct[] {
  return (Array.isArray(json) ? json : []).filter((p) => p?.name).map((p: any) => {
    const unit = Number(p.prices?.currency_minor_unit ?? 2);
    const raw = p.prices?.sale_price || p.prices?.price;
    return {
      key: `woo:${host}:${p.id}`,
      name: stripHtml(p.name, 120) ?? "",
      price: raw != null && raw !== "" ? Math.round(Number(raw) / 10 ** unit * 100) / 100 : 0,
      description: stripHtml(p.short_description || p.description),
      image_url: p.images?.[0]?.src ?? null,
      stock: p.is_in_stock === false ? 0 : null, active: true, sku: p.sku || null,
    };
  });
}

/** Any site (Wix, Squarespace, custom): schema.org Product in JSON-LD script tags. */
export function productsFromJsonLd(html: string, host: string): ImportedProduct[] {
  const out: ImportedProduct[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const type = ([] as string[]).concat(n["@type"] ?? []);
    if (type.includes("Product") && n.name) {
      const offer = ([] as any[]).concat(n.offers ?? [])[0] ?? {};
      const price = parsePrice(offer.price ?? offer.lowPrice ?? offer.offers?.[0]?.price);
      const image = typeof n.image === "string" ? n.image : Array.isArray(n.image) ? (typeof n.image[0] === "string" ? n.image[0] : n.image[0]?.url) : n.image?.url;
      out.push({
        key: `web:${host}:${n.sku || n.productID || slugKey(String(n.name))}`,
        name: stripHtml(String(n.name), 120) ?? "", price: price ?? 0, description: stripHtml(n.description),
        image_url: image ?? null, stock: /OutOfStock/i.test(String(offer.availability ?? "")) ? 0 : null, active: true, sku: n.sku || null,
      });
    }
    for (const k of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"]) if (n[k]) walk(n[k]);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* skip broken blocks */ }
  }
  return dedupe(out.filter((p) => p.name));
}

/** Product page links on a shop or category page, for sites that only describe products on their own pages. */
export function productLinks(html: string, base: string, max = 60): string[] {
  const origin = new URL(base).origin;
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === origin && /\/(product|products|shop|item|p)\/[^/]+\/?$/i.test(u.pathname)) links.add(u.origin + u.pathname);
    } catch { /* ignore */ }
    if (links.size >= max) break;
  }
  return [...links];
}

/** Accepts "islandcrumb.com", "https://islandcrumb.com/shop" etc. Public http(s) hosts only. */
export function normaliseSiteUrl(input: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || /^(\d+\.){3}\d+$/.test(h) || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) return null;
    return u;
  } catch { return null; }
}
