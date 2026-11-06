import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseSiteUrl, parseCsv, parsePrice, productLinks, productsFromCsv, productsFromJsonLd, productsFromShopifyJson, productsFromWooStore, stripHtml } from "../lib/product-import.ts";

test("CSV with quotes, commas and newlines", () => {
  const rows = parseCsv('Name,Price,Description\n"Black cake, large",45,"Rum soaked\nbaked Saturday"\nSweetbread,25,""\n');
  assert.deepEqual(rows[1], ["Black cake, large", "45", "Rum soaked\nbaked Saturday"]);
  assert.equal(rows.length, 3);
});

test("semicolon CSV and European prices", () => {
  assert.deepEqual(parseCsv("Name;Price\nCake;12,50")[1], ["Cake", "12,50"]);
  assert.equal(parsePrice("12,50"), 12.5);
  assert.equal(parsePrice("$1,250.00"), 1250);
  assert.equal(parsePrice("BBD 45"), 45);
  assert.equal(parsePrice(""), null);
});

test("Shopify export: variants become products, image rows skipped, title carried down", () => {
  const csv = [
    "Handle,Title,Body (HTML),Option1 Name,Option1 Value,Variant SKU,Variant Inventory Qty,Variant Price,Image Src,Published",
    'black-cake,Black cake,<p>Rum <b>soaked</b></p>,Size,Small,BC-S,4,35.00,https://cdn.shopify.com/a.jpg,true',
    "black-cake,,,,Large,BC-L,2,60.00,,",
    "black-cake,,,,,,,,https://cdn.shopify.com/b.jpg,",
    "sweetbread,Coconut sweetbread,,Title,Default Title,,,25,https://cdn.shopify.com/c.jpg,false",
  ].join("\n");
  const r = productsFromCsv(csv);
  assert.equal(r.source, "Shopify");
  assert.deepEqual(r.products.map((p) => [p.name, p.price, p.stock, p.active]), [
    ["Black cake (Small)", 35, 4, true], ["Black cake (Large)", 60, 2, true], ["Coconut sweetbread", 25, null, false],
  ]);
  assert.equal(r.products[1].image_url, "https://cdn.shopify.com/a.jpg");
  assert.equal(r.products[0].description, "Rum soaked");
  assert.equal(r.skipped, 1);
});

test("WooCommerce export: sale price wins, variable parents skipped, first image", () => {
  const csv = [
    "ID,Type,SKU,Name,Published,Short description,Stock,Sale price,Regular price,Images",
    "10,simple,CK1,Rum cake,1,Moist,5,40,50,\"https://x.com/1.jpg, https://x.com/2.jpg\"",
    "11,variable,,T-shirt,1,,,,,",
    "12,variation,TS-M,T-shirt - M,1,,,,30,",
  ].join("\n");
  const r = productsFromCsv(csv);
  assert.equal(r.source, "WooCommerce");
  assert.deepEqual(r.products.map((p) => [p.name, p.price]), [["Rum cake", 40], ["T-shirt - M", 30]]);
  assert.equal(r.products[0].image_url, "https://x.com/1.jpg");
});

test("plain spreadsheet with any column names", () => {
  const r = productsFromCsv("Product Name,Selling Price,Qty\nFish cakes,15,\nMacaroni pie,20,3");
  assert.equal(r.source, "Spreadsheet");
  assert.deepEqual(r.products.map((p) => [p.name, p.price, p.stock]), [["Fish cakes", 15, null], ["Macaroni pie", 20, 3]]);
});

test("no name column is reported", () => {
  assert.equal(productsFromCsv("foo,bar\n1,2").products.length, 0);
});

test("Shopify products.json", () => {
  const p = productsFromShopifyJson({ products: [{ id: 1, title: "Cake", body_html: "<p>Nice</p>", images: [{ src: "https://i/1.jpg" }], variants: [{ id: 9, price: "12.00", option1: "Default Title", available: true, sku: "C1" }] }] }, "shop.com");
  assert.deepEqual(p[0], { key: "shopify:shop.com:9", name: "Cake", price: 12, description: "Nice", image_url: "https://i/1.jpg", stock: null, active: true, sku: "C1" });
});

test("WooCommerce Store API uses minor units", () => {
  const p = productsFromWooStore([{ id: 5, name: "Pie &amp; peas", prices: { price: "2550", currency_minor_unit: 2 }, images: [{ src: "https://i/p.jpg" }], is_in_stock: false }], "s.com");
  assert.equal(p[0].name, "Pie & peas");
  assert.equal(p[0].price, 25.5);
  assert.equal(p[0].stock, 0);
});

test("schema.org Product from JSON-LD, inside @graph", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Guava cheese","sku":"G1","image":["https://i/g.jpg"],"offers":{"@type":"Offer","price":"18.00","availability":"https://schema.org/InStock"}}]}</script><script type="application/ld+json">{bad</script>`;
  const p = productsFromJsonLd(html, "x.com");
  assert.deepEqual([p[0].name, p[0].price, p[0].image_url, p[0].key], ["Guava cheese", 18, "https://i/g.jpg", "web:x.com:G1"]);
});

test("product links on a shop page stay on the same site", () => {
  const links = productLinks(`<a href="/product/cake/">x</a><a href="https://evil.com/product/x">y</a><a href="/about">z</a>`, "https://shop.com/shop");
  assert.deepEqual(links, ["https://shop.com/product/cake/"]);
});

test("site URL: adds https, refuses local addresses", () => {
  assert.equal(normaliseSiteUrl("islandcrumb.com")?.href, "https://islandcrumb.com/");
  assert.equal(normaliseSiteUrl("http://localhost:3000"), null);
  assert.equal(normaliseSiteUrl("http://169.254.169.254/latest"), null);
  assert.equal(normaliseSiteUrl("ftp://x.com"), null);
});

test("stripHtml keeps line breaks and caps length", () => {
  assert.equal(stripHtml("<p>One</p><p>Two &amp; three</p>"), "One\nTwo & three");
  assert.equal(stripHtml("x".repeat(700))!.length, 600);
});
