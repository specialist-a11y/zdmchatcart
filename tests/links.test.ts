import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseDomain, dnsRecord, apexOf, slugifyCode, validCode, validRef, linkTarget } from "../lib/links.ts";

test("domains are cleaned up", () => {
  assert.equal(normaliseDomain(" https://IslandCrumb.com/shop "), "islandcrumb.com");
  assert.equal(normaliseDomain("shop.islandcrumb.com.bb"), "shop.islandcrumb.com.bb");
  assert.equal(normaliseDomain("not a domain"), null);
  assert.equal(normaliseDomain("localhost"), null);
});

test("DNS record to add", () => {
  assert.deepEqual(dnsRecord("islandcrumb.com"), { type: "A", host: "@", value: "76.76.21.21" });
  assert.deepEqual(dnsRecord("www.islandcrumb.com"), { type: "CNAME", host: "www", value: "cname.vercel-dns.com" });
  assert.equal(apexOf("shop.islandcrumb.com.bb"), "islandcrumb.com.bb");
  assert.deepEqual(dnsRecord("islandcrumb.com.bb"), { type: "A", host: "@", value: "76.76.21.21" });
  assert.equal(dnsRecord("order.shop.islandcrumb.com.bb").host, "order.shop");
});

test("short link codes", () => {
  assert.equal(slugifyCode("Black Cake Story!"), "black-cake-story");
  assert.equal(slugifyCode("  Crème brûlée  "), "creme-brulee");
  assert.ok(validCode("cake"));
  assert.equal(validCode("a"), false);
  assert.equal(validCode("Cake"), false);
  assert.ok(validRef("A-3"));
  assert.equal(validRef("bad ref"), false);
});

test("short links go to the shop with the tracking code", () => {
  assert.equal(linkTarget("https://app.zdm.bb/", "island-crumb", "S-CAKE"), "https://app.zdm.bb/s/island-crumb?ref=S-CAKE");
  assert.equal(linkTarget("https://app.zdm.bb", "island-crumb", "A-3", "islandcrumb.com"), "https://islandcrumb.com/?ref=A-3");
});

test("short links use the shop's own domain when live", async () => {
  const { shortUrl } = await import("../lib/links.ts");
  assert.equal(shortUrl("cake", "islandcrumb.com"), "https://islandcrumb.com/cake");
});
