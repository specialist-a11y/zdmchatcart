import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, availability, overbooked, holdsUnits, pickupOptions, priceRentalCart, rentalLine, schedule, validateDates, cleanIncludes, expandKits, kitFree, kitsFrom } from "../lib/rental.ts";

const projector = { id: "p", name: "4K Projector", price: 90, stock: 2, active: true, rental: true, rental_unit: "day", deposit: 100, min_days: 1 };
const backyard = { id: "b", name: "Backyard Movie Night", price: 210, stock: 1, active: true, rental: true, rental_unit: "night", deposit: 0, min_days: 1 };
const popcorn = { id: "c", name: "Popcorn kernels", price: 12, stock: 10, active: true, rental: false };

test("dates", () => {
  assert.equal(addDays("2026-11-30", 2), "2026-12-02");
  assert.equal(validateDates("2026-11-14", 2, "2026-11-05"), null);
  assert.match(validateDates("2026-11-04", 1, "2026-11-05")!, /passed/);
  assert.match(validateDates("2026-11-05", 1, "2026-11-05", 1)!, /at least 1 day ahead/);
  assert.match(validateDates("2026-11-14", 0, "2026-11-05")!, /how many/);
  assert.match(validateDates("2026-11-14", 31, "2026-11-05")!, /up to 30/);
  assert.match(validateDates("bad", 1, "2026-11-05")!, /Pick your rental date/);
});

test("availability counts overlapping bookings, return day is free", () => {
  const bookings = [
    { product_id: "p", quantity: 1, start: "2026-11-14", end: "2026-11-16" },
    { product_id: "p", quantity: 1, start: "2026-11-15", end: "2026-11-16" },
    { product_id: "b", quantity: 1, start: "2026-11-10", end: "2026-11-11" },
  ];
  assert.deepEqual(availability([projector, backyard], bookings, "2026-11-14", "2026-11-15"), { p: 1, b: 1 });
  assert.deepEqual(availability([projector], bookings, "2026-11-14", "2026-11-17"), { p: 0 });
  assert.deepEqual(availability([projector], bookings, "2026-11-16", "2026-11-17"), { p: 2 });
  // one cleaning day after each return
  assert.deepEqual(availability([projector], bookings, "2026-11-16", "2026-11-17", 1), { p: 0 });
  assert.deepEqual(availability([backyard], bookings, "2026-11-11", "2026-11-12", 1), { b: 0 });
});

test("rental cart: price x days, deposit line, mixed with a normal product", () => {
  const r = priceRentalCart([{ productId: "p", quantity: 2 }, { productId: "c", quantity: 1 }], [projector, popcorn], 3, { p: 2 });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.items, [
    { product_id: "p", name: "4K Projector · 3 days", unit_price: 270, quantity: 2 },
    { product_id: "c", name: "Popcorn kernels", unit_price: 12, quantity: 1 },
    { product_id: null, name: "Refundable deposit", unit_price: 100, quantity: 1 },
  ]);
  // One deposit per booking, not per unit.
  assert.equal(r.subtotal, 540 + 12 + 100);
  assert.equal(r.deposit, 100);
});

test("rental cart: booked, too few, minimum days, nights", () => {
  assert.deepEqual(priceRentalCart([{ productId: "b", quantity: 1 }], [backyard], 1, { b: 0 }), { error: "Backyard Movie Night is already booked on those dates. Try other dates." });
  assert.deepEqual(priceRentalCart([{ productId: "p", quantity: 2 }], [projector], 1, { p: 1 }), { error: "Only 1 4K Projector free on those dates." });
  assert.deepEqual(priceRentalCart([{ productId: "p", quantity: 1 }], [{ ...projector, min_days: 2 }], 1, { p: 2 }), { error: "4K Projector is rented for at least 2 days." });
  const r = priceRentalCart([{ productId: "b", quantity: 1 }], [backyard], 2, { b: 1 });
  assert.ok(!("error" in r) && r.unit === "night" && r.items[0].name === "Backyard Movie Night · 2 nights");
});

test("unpaid orders hold units for 24 hours", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(holdsUnits("paid", "2026-10-01T00:00:00Z", now), true);
  assert.equal(holdsUnits("awaiting_payment", "2026-11-05T01:00:00Z", now), true);
  assert.equal(holdsUnits("awaiting_payment", "2026-11-04T01:00:00Z", now), false);
  assert.equal(holdsUnits("cancelled", "2026-11-05T11:00:00Z", now), false);
});

test("line, pickup times, schedule", () => {
  assert.equal(rentalLine({ rental_start: "2026-11-14", rental_end: "2026-11-16", rental_days: 2, pickup_time: "10:00 AM" }), "Rental: pick up Sat 14 Nov at 10:00 AM, return Mon 16 Nov (2 days)");
  assert.equal(rentalLine({ rental_start: null, rental_end: null }), null);
  assert.deepEqual(pickupOptions("9:00 AM, 12 noon\n4:00 PM,"), ["9:00 AM", "12 noon", "4:00 PM"]);
  const s = schedule([{ id: 1, rental_start: "2026-11-14", rental_end: "2026-11-16" }], "2026-11-13", 5);
  assert.deepEqual(s.map((d) => [d.date, d.pickups.length, d.returns.length]), [["2026-11-14", 1, 0], ["2026-11-16", 0, 1]]);
});

test("overbooked spots two bookings for the last unit", () => {
  const b = [{ product_id: "b", quantity: 1, start: "2026-11-14", end: "2026-11-15" }, { product_id: "b", quantity: 1, start: "2026-11-14", end: "2026-11-15" }];
  assert.deepEqual(overbooked([backyard, projector], b, "2026-11-14", "2026-11-15"), ["b"]);
  assert.deepEqual(overbooked([backyard], b.slice(1), "2026-11-14", "2026-11-15"), []);
});

test("deposit: the highest deposit in the booking, charged once", () => {
  const screen = { id: "s", name: "Screen", price: 80, stock: 1, active: true, rental: true, rental_unit: "night", deposit: 20, min_days: 1 };
  const pkg = { ...backyard, id: "k", deposit: 50 };
  const r = priceRentalCart([{ productId: "k", quantity: 1 }, { productId: "s", quantity: 1 }], [pkg, screen], 1, { k: 1, s: 1 });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.deposit, 50);
});

const P = "11111111-1111-1111-1111-111111111111", S = "22222222-2222-2222-2222-222222222222", T = "33333333-3333-3333-3333-333333333333", K = "44444444-4444-4444-4444-444444444444";

test("packages: clean the item list", () => {
  assert.deepEqual(cleanIncludes([{ id: P, qty: 1 }, { id: P, qty: 3 }, { id: K, qty: 1 }, { id: "x", qty: 1 }, { id: S, qty: 0 }, { id: T, qty: 99 }], K), [{ id: P, qty: 1 }, { id: T, qty: 20 }]);
  assert.deepEqual(cleanIncludes("nope"), []);
});

test("packages: one level, only this shop's rental items", () => {
  const kits = kitsFrom([{ id: K, includes: [{ id: P, qty: 1 }, { id: S, qty: 1 }, { id: "55555555-5555-5555-5555-555555555555", qty: 1 }] }, { id: P }, { id: S, includes: [{ id: T, qty: 1 }] }, { id: T }]);
  // S is a package itself, so it can't sit inside K; the unknown id is dropped.
  assert.deepEqual(kits[K], [{ id: P, qty: 1 }]);
  assert.deepEqual(kits[S], [{ id: T, qty: 1 }]);
});

test("packages: booking a package holds its items, and a booked item blocks the package", () => {
  const kits = { [K]: [{ id: P, qty: 1 }, { id: T, qty: 2 }] };
  const products = [{ id: K, stock: 1 }, { id: P, stock: 1 }, { id: T, stock: 2 }];
  // Package booked: the projector and both tents are out too.
  const pkgBooked = expandKits([{ product_id: K, quantity: 1, start: "2026-11-14", end: "2026-11-15" }], kits);
  assert.deepEqual(kitFree(availability(products, pkgBooked, "2026-11-14", "2026-11-15"), kits), { [K]: 0, [P]: 0, [T]: 0 });
  // One tent rented on its own: the package needs two, so it's not free; the projector still is.
  const tentOut = expandKits([{ product_id: T, quantity: 1, start: "2026-11-14", end: "2026-11-15" }], kits);
  assert.deepEqual(kitFree(availability(products, tentOut, "2026-11-14", "2026-11-15"), kits), { [K]: 0, [P]: 1, [T]: 1 });
  // Next day everything is free again.
  assert.deepEqual(kitFree(availability(products, pkgBooked, "2026-11-15", "2026-11-16"), kits), { [K]: 1, [P]: 1, [T]: 2 });
  // Clash check sees the projector double-booked through the package.
  const both = expandKits([{ product_id: K, quantity: 1, start: "2026-11-14", end: "2026-11-15" }, { product_id: P, quantity: 1, start: "2026-11-14", end: "2026-11-15" }], kits);
  assert.deepEqual(overbooked(products, both, "2026-11-14", "2026-11-15"), [P]);
});

test("packages: the cart can't take the package and its item when only one is free", () => {
  const kits = { k: [{ id: "p", qty: 1 }] };
  const pkg = { ...backyard, id: "k" };
  const one = { ...projector, stock: 1 };
  const free = kitFree({ k: 1, p: 1 }, kits);
  assert.deepEqual(priceRentalCart([{ productId: "k", quantity: 1 }, { productId: "p", quantity: 1 }], [pkg, one], 1, free, kits),
    { error: "Not enough 4K Projector free on those dates for everything in your cart. Try other dates or remove an item." });
  assert.ok(!("error" in priceRentalCart([{ productId: "k", quantity: 1 }], [pkg, one], 1, free, kits)));
});
