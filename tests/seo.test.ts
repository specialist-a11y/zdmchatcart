import { test } from "node:test";
import assert from "node:assert/strict";
import { area, breadcrumbLd, ldJson, openingHoursSpec, productDescription, productLd, schemaType, seoChecks, shopDescription, shopLd, shopTitle, slugify, uniqueSlug } from "../lib/seo.ts";
import { cleanHours } from "../lib/hours.ts";

const b = { name: "Island Crumb Bakery", currency: "BBD", address: "1st Street\nHoletown, St James", description: "Black cake and sweetbread, baked every Friday.", tagline: null, site_template: "caterer", instagram: "@islandcrumb", whatsapp_number: "1 246 555 0123" };

test("slugs", () => {
  assert.equal(slugify("Black Cake (8 inch)!"), "black-cake-8-inch");
  assert.equal(slugify("Mac & Cheese"), "mac-and-cheese");
  assert.equal(slugify("Crème brûlée"), "creme-brulee");
  assert.equal(slugify("!!!"), "item");
  assert.equal(uniqueSlug("Black cake", new Set(["black-cake", "black-cake-2"])), "black-cake-3");
});

test("titles and descriptions", () => {
  assert.equal(area(b.address, "BBD"), "Holetown, St James, Barbados");
  assert.equal(area(null, "BBD"), "Barbados");
  assert.equal(shopTitle(b), "Island Crumb Bakery · Caterer in Holetown | Order online");
  assert.equal(shopTitle({ ...b, seo_title: "Best black cake in Barbados" }), "Best black cake in Barbados");
  const d = shopDescription(b);
  assert.match(d, /^Black cake and sweetbread, baked every Friday\. Order online, pay securely by card, pickup or delivery in Holetown\.$/);
  assert.ok(d.length <= 160);
  const pd = productDescription({ name: "Black cake", price: 40, variants: [{ id: "s6", name: "6", price: 40, available: true }, { id: "s8", name: "8", price: 60, available: true }] }, b);
  assert.match(pd, /From BBD 40\.00/);
  assert.ok(shopDescription({ ...b, description: "x ".repeat(200) }).length <= 160);
});

test("structured data", () => {
  assert.equal(schemaType("beauty"), "BeautySalon");
  assert.equal(schemaType(null), "Store");
  const spec = openingHoursSpec(cleanHours({ sat: [["06:00", "13:00"]] }));
  assert.deepEqual(spec, [{ "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Saturday", opens: "06:00", closes: "13:00" }]);
  const p = { id: "1", name: "Black cake", price: 40, variants: [{ id: "s6", name: "6 inch", price: 40, available: true }, { id: "s8", name: "8 inch", price: 60, available: true }], stock: null };
  const ld: any = productLd(p, b, "https://x/p/black-cake");
  assert.equal(ld.offers["@type"], "AggregateOffer");
  assert.equal(ld.offers.highPrice, "60.00");
  const sold: any = productLd({ id: "2", name: "Pone", price: 15, stock: 0 }, b, "u");
  assert.equal(sold.offers.availability, "https://schema.org/OutOfStock");
  const shop: any = shopLd(b, { url: "https://x", hours: {}, products: [p], productUrl: () => "u" });
  assert.equal(shop["@type"], "FoodEstablishment");
  assert.equal(shop.telephone, "+12465550123");
  assert.deepEqual(shop.sameAs, ["https://www.instagram.com/islandcrumb"]);
  assert.equal(shop.address.addressCountry, "BB");
  assert.equal(breadcrumbLd([{ name: "A", url: "u" }]).itemListElement[0].position, 1);
  assert.doesNotMatch(ldJson({ a: "</script>" }), /<\/script>/);
});

test("owner checks", () => {
  assert.equal(seoChecks("Island Crumb Bakery · Holetown", "Short").length, 1);
});
