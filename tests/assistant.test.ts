import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogFacts, looksLikeQuestion } from "../lib/assistant-text.ts";

test("only product-style questions get an AI answer", () => {
  assert.equal(looksLikeQuestion("How much is the black cake?"), true);
  assert.equal(looksLikeQuestion("do you deliver to St Philip"), true);
  assert.equal(looksLikeQuestion("what sizes do you have"), true);
  assert.equal(looksLikeQuestion("thanks!"), false);
  assert.equal(looksLikeQuestion("ok"), false);
  assert.equal(looksLikeQuestion("Ill come by later"), false);
});

test("catalog facts list prices, options and sold out", () => {
  const t = catalogFacts([
    { name: "Black Cake", price: 60, category: "Cakes", stock: 3, description: "Rum soaked" },
    { name: "Cupcakes", price: 0, variants: [{ id: "s6", name: "Box of 6", price: 24, available: true }, { id: "s12", name: "Box of 12", price: 45, available: false }] },
    { name: "Sorrel", price: 15, stock: 0 },
    { name: "Projector", price: 120, rental: true, rental_unit: "day" },
  ], "BBD");
  assert.match(t, /Black Cake \[Cakes\]: BBD 60\.00 · Rum soaked/);
  assert.match(t, /Box of 12 BBD 45\.00 \(not available now\)/);
  assert.match(t, /Sorrel: BBD 15\.00 · sold out/);
  assert.match(t, /Projector: BBD 120\.00 per day/);
});
