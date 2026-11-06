import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, availability, overbooked, holdsUnits, pickupOptions, priceRentalCart, rentalLine, schedule, validateDates } from "../lib/rental.ts";

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
    { product_id: null, name: "Refundable deposit", unit_price: 200, quantity: 1 },
  ]);
  assert.equal(r.subtotal, 540 + 12 + 200);
  assert.equal(r.deposit, 200);
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
