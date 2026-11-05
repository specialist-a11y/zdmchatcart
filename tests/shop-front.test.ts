import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeFor, bestsellers, fulfilmentChip, mix, onColor, readZones, readyText, sharedReadyDays, slotOptions, sourceOf, specialActive, themeVars } from "../lib/shop-front.ts";
import { cleanHours } from "../lib/hours.ts";

const bb = (iso: string) => Date.parse(`${iso}-04:00`); // 2026-11-05 is a Thursday
const H = cleanHours({ thu: [["08:00", "17:00"]], fri: [["08:00", "17:00"]], sat: [["08:00", "12:00"]] });

test("themes build from the brand colour", () => {
  assert.equal(mix("#000000", 0.5), "#808080");
  assert.equal(onColor("#FFFFFF"), "#0B0F0E");
  assert.equal(onColor("#5A2E1A"), "#FFFFFF");
  assert.equal(themeVars("warm", "#5A2E1A")["--accent"], "#5A2E1A");
  assert.deepEqual(themeVars(null, "#5A2E1A"), {});
});

test("zones are cleaned and summarised", () => {
  const z = readZones([{ name: "Zone A", fee: 10 }, { name: "", fee: 5 }, { name: "Zone B", fee: "20" }, { name: "Bad", fee: -1 }]);
  assert.deepEqual(z.map((x) => x.fee), [10, 20]);
  assert.equal(fulfilmentChip(z, true), "Pickup · Delivery from BBD 10");
  assert.equal(fulfilmentChip([], true), "Pickup");
});

test("slots follow hours, notice, lead time and ready days", () => {
  const now = bb("2026-11-05T15:30:00");
  const s = slotOptions(H, { now, slotMinutes: 120 });
  assert.equal(s[0].label, "Tomorrow 8am"); // today's 4pm slot has under an hour's notice? 16:00 is 30 min away
  assert.ok(s.some((x) => x.label === "Sat 10am"));
  const sat = slotOptions(H, { now, readyDays: ["sat"] });
  assert.ok(sat.every((x) => x.label.startsWith("Sat")));
  const lead = slotOptions(H, { now, leadDays: 2 });
  assert.ok(lead[0].label.startsWith("Sat"));
  assert.deepEqual(sharedReadyDays([{ ready_days: ["fri", "sat"] }, { ready_days: [] }, { ready_days: ["sat", "sun"] }]), ["sat"]);
});

test("badges", () => {
  const best = bestsellers([{ product_id: "a", quantity: 3 }, { product_id: "b", quantity: 1 }, { product_id: "a", quantity: 1 }]);
  assert.deepEqual([...best], ["a"]);
  assert.equal(badgeFor({ id: "a" }, best), "bestseller");
  assert.equal(badgeFor({ id: "a", stock: 0 }, best), "soldout");
  assert.equal(badgeFor({ id: "c", lead_days: 2 }, best), "preorder");
  assert.equal(badgeFor({ id: "a", badge: "none" }, best), null);
  assert.equal(readyText({ ready_days: ["fri", "sat"], lead_days: 2 }), "Ready Fri, Sat · order 2 days ahead");
});

test("visit sources and specials", () => {
  assert.equal(sourceOf("https://l.instagram.com/"), "instagram");
  assert.equal(sourceOf("", "fb"), "facebook");
  assert.equal(sourceOf(null, null, "IG-CAKE"), "link");
  assert.equal(sourceOf(null), "direct");
  assert.equal(specialActive("Rum cake", "2000-01-01T00:00:00Z"), false);
  assert.equal(specialActive("Rum cake", null), true);
});

test("shop score and change", async () => {
  const { shopScore, change } = await import("../lib/shop-front.ts");
  const s = shopScore({ logo: true, colour: true, domain: false, products: 4, withPhotos: 1, hours: true, about: false, special: false, base: "/d/x" });
  assert.equal(s.pct, 43);
  assert.equal(s.items.find((i) => i.key === "photos")?.todo, "Add photos to 3 products");
  assert.equal(change(118, 100), 18);
  assert.equal(change(5, 0), null);
});
