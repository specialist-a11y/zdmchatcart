import { test } from "node:test";
import assert from "node:assert/strict";
import { isYes, matchProducts, parseDate, pickNumbers, wantsToOrder } from "../lib/wa-order.ts";

const P = [
  { id: "cozy", name: "Cozy Movie Night" }, { id: "back", name: "Backyard Movie Night" }, { id: "small", name: "Small Event Cinema" },
  { id: "proj", name: "4K Projector with WiFi and Bluetooth" }, { id: "s14", name: "14ft Inflatable Mega Projector Screen" },
  { id: "s120", name: "120 inch Projector Screen and Stand" }, { id: "pop", name: "Vintage Popcorn Machine" },
  { id: "tent", name: "10 x 10 Tent" }, { id: "table", name: "Foldable Table (29 x 72 x 30 inch)" },
  { id: "chairs", name: "2 Inflatable Chairs (adults)" }, { id: "tee", name: "5 Kids Teepee Tents with Mattresses" },
];
const ids = (t: string) => matchProducts(t, P).map((p) => p.id);

test("wanting to order", () => {
  for (const t of ["I would like to rent the projector", "i want to book for saturday", "Can I rent the backyard package?", "how do I book", "rent the popcorn machine", "Id like to hire a screen"]) assert.ok(wantsToOrder(t), t);
  for (const t of ["Hi! I'd like to book order SCE-1002".replace(/book order/, "pay for"), "what's the rental agreement", "where are you", "thanks"]) assert.ok(!wantsToOrder(t), t);
});

test("finding products in a message", () => {
  assert.deepEqual(ids("I would like to rent the projector"), ["proj"]);
  assert.deepEqual(ids("the backyard movie night please"), ["back"]);
  assert.deepEqual(ids("projector and popcorn machine"), ["proj", "pop"]);
  assert.deepEqual(ids("the mega screen"), ["s14"]);
  assert.deepEqual(ids("a tent and the table"), ["tent", "table"]);
  assert.deepEqual(ids("teepee tents for my kids"), ["tee"]);
  assert.deepEqual(ids("I want to rent something"), []);
});

test("list numbers and yes", () => {
  assert.deepEqual(pickNumbers("1, 3", 5), [1, 3]);
  assert.deepEqual(pickNumbers("2 and 4", 5), [2, 4]);
  assert.deepEqual(pickNumbers("9", 5), []);
  assert.deepEqual(pickNumbers("the projector", 5), []);
  assert.ok(isYes("Yes please")); assert.ok(isYes("ok")); assert.ok(!isYes("no"));
});

test("dates from chat messages", () => {
  const today = "2026-11-20"; // a Friday
  assert.equal(parseDate("19 Dec", today), "2026-12-19");
  assert.equal(parseDate("December 19th", today), "2026-12-19");
  assert.equal(parseDate("on the 19/12", today), "2026-12-19");
  assert.equal(parseDate("2026-12-19", today), "2026-12-19");
  assert.equal(parseDate("5 Jan", today), "2027-01-05");
  assert.equal(parseDate("tomorrow", today), "2026-11-21");
  assert.equal(parseDate("this saturday", today), "2026-11-21");
  assert.equal(parseDate("friday", today), "2026-11-27");
  assert.equal(parseDate("31/02", today), null);
  assert.equal(parseDate("soon", today), null);
});
