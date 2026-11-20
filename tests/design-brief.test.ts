import { test } from "node:test";
import assert from "node:assert/strict";
import { briefText, conceptHeadline, readBrief } from "../lib/design-brief.ts";

const form = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (Array.isArray(o[k]) ? (o[k] as string[])[0] : o[k]) ?? null,
  getAll: (k: string) => (Array.isArray(o[k]) ? o[k] : o[k] ? [o[k]] : []) as unknown[],
});

test("reads a design brief and keeps only known choices", () => {
  const b = readBrief(form({ about: "Outdoor movie night rentals in Barbados.", style: "cinematic", primary: "#ff4757", accent: "nope", pages: ["Home", "Gallery", "Hacker"], features: ["Online booking"], timing: "Within a month" }), "Starlight");
  assert.ok(!("error" in b));
  if ("error" in b) return;
  assert.equal(b.business, "Starlight");
  assert.equal(b.style, "cinematic");
  assert.equal(b.accent, "#FECA57");
  assert.deepEqual(b.pages, ["Home", "Gallery"]);
  assert.match(briefText(b), /Style: Dark and cinematic[\s\S]*Pages: Home, Gallery[\s\S]*Must have: Online booking/);
  assert.ok(!/undefined|false/.test(briefText(b)));
});

test("needs a short description", () => {
  assert.ok("error" in readBrief(form({ about: "hi" }), "X"));
});

test("concept headline", () => {
  assert.equal(conceptHeadline("Outdoor movie nights in Barbados. Book online.", "Starlight"), "Outdoor movie nights in Barbados");
  assert.equal(conceptHeadline("We do things", "Starlight"), "Starlight");
});
