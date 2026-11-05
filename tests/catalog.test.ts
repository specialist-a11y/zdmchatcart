import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanVariants, displayPrice, readVariants, splitKey, cartKey, template } from "../lib/catalog.ts";
import { priceCart } from "../lib/order-text.ts";

let n = 0;
const id = () => `v${++n}x`;

test("editor variants: blanks dropped, names and prices required, ids kept unique", () => {
  const ok = cleanVariants([{ name: "6 inch", price: "45" }, { name: "", price: "" }, { id: "abc", name: "8 inch", price: 65.5 }], id);
  assert.ok(Array.isArray(ok));
  assert.equal((ok as any).length, 2);
  assert.equal((ok as any)[1].id, "abc");
  assert.match((cleanVariants([{ name: "", price: "10" }], id) as any).error, /needs a name/);
  assert.match((cleanVariants([{ name: "Large", price: "" }], id) as any).error, /price/);
  const dup = cleanVariants([{ id: "abc", name: "A", price: 1 }, { id: "abc", name: "B", price: 2 }], id) as any[];
  assert.notEqual(dup[0].id, dup[1].id);
});

test("reading variants ignores junk", () => {
  assert.deepEqual(readVariants("nope"), []);
  assert.deepEqual(readVariants([{ id: "a1", name: "Small", price: "10" }, { id: "!", name: "x", price: 1 }, { id: "b2", name: "", price: 2 }]),
    [{ id: "a1", name: "Small", price: 10, available: true }]);
});

test("card price shows the cheapest available option", () => {
  assert.deepEqual(displayPrice({ price: 50 }), { amount: 50, from: false });
  assert.deepEqual(displayPrice({ price: 0, variants: [{ id: "a1", name: "S", price: 40 }, { id: "b2", name: "L", price: 30, available: false }, { id: "c3", name: "M", price: 45 }] }), { amount: 40, from: true });
  assert.deepEqual(displayPrice({ price: 0, variants: [{ id: "a1", name: "S", price: 40 }, { id: "c3", name: "M", price: 40 }] }), { amount: 40, from: false });
});

test("cart keys", () => {
  assert.deepEqual(splitKey(cartKey("p", "v1")), { productId: "p", variantId: "v1" });
  assert.deepEqual(splitKey(cartKey("p")), { productId: "p", variantId: null });
  assert.equal(template("nope").id, "classic");
});

const cake = { id: "c", name: "Black cake", price: 0, stock: 3, active: true, variants: [{ id: "s6", name: "6 inch", price: 45 }, { id: "s8", name: "8 inch", price: 65 }, { id: "s10", name: "10 inch", price: 90, available: false }] };
const bread = { id: "b", name: "Salt bread", price: 1.5, stock: null, active: true };

test("pricing uses the option's price and name", () => {
  const r = priceCart([{ productId: "c", variantId: "s8", quantity: 1 }, { productId: "c", variantId: "s6", quantity: 1 }, { productId: "b", quantity: 6 }], [cake, bread]) as any;
  assert.equal(r.subtotal, 119);
  assert.deepEqual(r.items.map((i: any) => i.name), ["Black cake (8 inch)", "Black cake (6 inch)", "Salt bread"]);
});

test("pricing rejects missing, unavailable or stale options and counts stock across options", () => {
  assert.match((priceCart([{ productId: "c", quantity: 1 }], [cake]) as any).error, /Pick an option/);
  assert.match((priceCart([{ productId: "c", variantId: "s10", quantity: 1 }], [cake]) as any).error, /isn't available/);
  assert.match((priceCart([{ productId: "b", variantId: "zz", quantity: 1 }], [bread]) as any).error, /has changed/);
  assert.match((priceCart([{ productId: "c", variantId: "s6", quantity: 2 }, { productId: "c", variantId: "s8", quantity: 2 }], [cake]) as any).error, /Only 3 left/);
});
