import { test } from "node:test";
import assert from "node:assert/strict";
import { asksCatalog, asksLocation, catalogCaption, isReturning, welcomeBack, whatsappImage } from "../lib/wa-intents.ts";

test("catalog questions", () => {
  for (const t of ["Can I see your catalog?", "what do you have", "Send me the price list", "show me your items", "what do you rent", "can you send pictures"]) assert.ok(asksCatalog(t), t);
  for (const t of ["Hi! I'd like to book order SCE-1002", "how much is the projector", "thanks"]) assert.ok(!asksCatalog(t), t);
});

test("location questions", () => {
  for (const t of ["Where are you located?", "what's the address", "send me the pin", "where do I pick up", "directions please"]) assert.ok(asksLocation(t), t);
  for (const t of ["Do you deliver?", "how much", "I'd like to book"]) assert.ok(!asksLocation(t), t);
});

test("returning customers and welcome back", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(isReturning(null, now), false);
  assert.equal(isReturning("2026-11-20T09:00:00Z", now), false);
  assert.equal(isReturning("2026-11-10T09:00:00Z", now), true);
  assert.equal(welcomeBack("Tara Best", "Starlight"), "Great to see you again, Tara! Welcome back to Starlight.");
  assert.equal(welcomeBack(null, "Starlight"), "Great to see you again! Welcome back to Starlight.");
});

test("catalog captions and WhatsApp image links", () => {
  assert.equal(catalogCaption({ name: "Backyard Movie Night", price: 210, description: "Projector, screen, popcorn.", rental: true, rental_unit: "night" }, "BBD"),
    "*Backyard Movie Night*\nBBD $210 per night\nProjector, screen, popcorn.");
  assert.ok(whatsappImage("https://x.supabase.co/a/b.jpg"));
  assert.ok(!whatsappImage("https://x.supabase.co/a/b.webp"));
});
