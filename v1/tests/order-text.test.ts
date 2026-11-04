import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOrderCode, money, orderSummary, priceCart, waLink } from "../lib/order-text.ts";

test("order codes are found and normalised", () => {
  assert.equal(extractOrderCode("Hi! I'd like to place order zb-1042"), "ZB-1042");
  assert.equal(extractOrderCode("ORDER CC-1001 please"), "CC-1001");
  assert.equal(extractOrderCode("call me at 246-555"), null);
  assert.equal(extractOrderCode("hello"), null);
});

const catalog = [
  { id: "a", name: "Coconut sweetbread", price: "25.00", stock: null, active: true },
  { id: "b", name: "Black cake", price: "40.00", stock: 2, active: true },
  { id: "c", name: "Old item", price: "5.00", stock: null, active: false },
];

test("cart is priced from the catalog, not the browser, and merges duplicates", () => {
  const r = priceCart([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }, { productId: "a", quantity: 1 }], catalog);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.subtotal, 90);
  assert.deepEqual(r.items.map((i) => [i.name, i.quantity]), [["Coconut sweetbread", 2], ["Black cake", 1]]);
});

test("cart rejects out-of-stock, inactive and unknown products", () => {
  assert.deepEqual(priceCart([{ productId: "b", quantity: 3 }], catalog), { error: "Only 2 left of Black cake." });
  assert.ok("error" in priceCart([{ productId: "c", quantity: 1 }], catalog));
  assert.ok("error" in priceCart([{ productId: "zzz", quantity: 1 }], catalog));
  assert.ok("error" in priceCart([], catalog));
});

test("cents-safe totals", () => {
  const r = priceCart([{ productId: "x", quantity: 3 }], [{ id: "x", name: "Tea", price: "0.10", stock: null, active: true }]);
  assert.ok(!("error" in r) && r.subtotal === 0.3);
});

test("summary and links", () => {
  assert.equal(money(90, "BBD"), "BBD $90.00");
  const s = orderSummary("ZB-1042", [{ name: "Black cake", unit_price: "40.00", quantity: 2 }], "80.00", "BBD");
  assert.equal(s, "Order ZB-1042\n• 2 x Black cake: BBD $80.00\nTotal: BBD $80.00");
  assert.equal(waLink("+1 (246) 555-1234", "Hi order ZB-1"), "https://wa.me/12465551234?text=Hi%20order%20ZB-1");
});
