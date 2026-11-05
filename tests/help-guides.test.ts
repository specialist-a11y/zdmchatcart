import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDES, SECTIONS, searchGuides } from "../lib/help-guides.ts";

test("every guide has a unique id, a known section and steps", () => {
  assert.equal(new Set(GUIDES.map((g) => g.id)).size, GUIDES.length);
  for (const g of GUIDES) {
    assert.ok((SECTIONS as readonly string[]).includes(g.section), g.id);
    assert.ok(g.steps.length > 0, g.id);
    assert.ok(/^[a-z0-9-]+$/.test(g.id), g.id);
  }
});

test("search finds by title first, needs every word, and handles empty queries", () => {
  assert.equal(searchGuides("").length, GUIDES.length);
  assert.equal(searchGuides("fygaro")[0].id, "connect-fygaro");
  assert.equal(searchGuides("sizes")[0].id, "options");
  assert.ok(searchGuides("quote").some((g) => g.id === "price-on-request"));
  assert.equal(searchGuides("fygaro zzzz").length, 0);
});
