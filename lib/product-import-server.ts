import "server-only";
import { normaliseSiteUrl, productLinks, productsFromJsonLd, productsFromShopifyJson, productsFromWooStore, type ImportResult, type ImportedProduct } from "./product-import";

const UA = "ZDM-ChatCart-Importer/1.0 (+product import for the shop owner)";
const LIMIT = 4 * 1024 * 1024;

/** GET a public page with a timeout and a size cap. Redirects are followed but must stay on public hosts. */
async function get(url: string, accept = "text/html,application/json"): Promise<{ ok: boolean; status: number; text: string; type: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    if (!normaliseSiteUrl(res.url || url)) return { ok: false, status: 0, text: "", type: "", finalUrl: res.url };
    const buf = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, text: new TextDecoder().decode(buf.byteLength > LIMIT ? buf.slice(0, LIMIT) : buf), type: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
  } catch {
    return { ok: false, status: 0, text: "", type: "", finalUrl: url };
  } finally { clearTimeout(t); }
}
const json = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

/**
 * Read products from the business's current site:
 * 1. Shopify's public products.json, 2. WooCommerce's public Store API,
 * 3. schema.org Product data on the page, then on up to 40 product pages it links to (Wix, Squarespace, custom sites).
 */
export async function productsFromSite(input: string): Promise<ImportResult> {
  const u = normaliseSiteUrl(input);
  if (!u) return { source: input, products: [], skipped: 0, warnings: ["That doesn't look like a website address."] };
  const host = u.hostname.replace(/^www\./, "");
  const origin = u.origin;

  // 1. Shopify
  const shop: ImportedProduct[] = [];
  for (let page = 1; page <= 4; page++) {
    const r = await get(`${origin}/products.json?limit=250&page=${page}`, "application/json");
    const j = r.ok ? json(r.text) : null;
    if (!j?.products) break;
    shop.push(...productsFromShopifyJson(j, host));
    if (j.products.length < 250) break;
  }
  if (shop.length) return { source: `Shopify site (${host})`, products: shop, skipped: 0, warnings: ["Stock levels aren't public on Shopify. Import a CSV export instead if you track stock."] };

  // 2. WooCommerce
  const woo: ImportedProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await get(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, "application/json");
    const j = r.ok ? json(r.text) : null;
    if (!Array.isArray(j) || !j.length) break;
    woo.push(...productsFromWooStore(j, host));
    if (j.length < 100) break;
  }
  if (woo.length) return { source: `WooCommerce site (${host})`, products: woo, skipped: 0, warnings: [] };

  // 3. Product data on the page and its product pages
  const first = await get(u.href);
  if (!first.ok) return { source: host, products: [], skipped: 0, warnings: [`Couldn't open ${u.href}${first.status ? ` (error ${first.status})` : ""}. Try the shop page address, or export a CSV from your website.`] };
  const found = productsFromJsonLd(first.text, host);
  const links = productLinks(first.text, first.finalUrl, 40);
  for (let i = 0; i < links.length; i += 6) {
    const pages = await Promise.all(links.slice(i, i + 6).map((l) => get(l)));
    for (const p of pages) if (p.ok) found.push(...productsFromJsonLd(p.text, host));
  }
  const seen = new Set<string>();
  const products = found.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
  return {
    source: host, products, skipped: 0,
    warnings: products.length ? ["Read from the product pages on your site. Check prices before importing."] : ["We couldn't find product details on that page. Paste your shop or products page, or upload a CSV export."],
  };
}
