import { test } from "node:test";
import assert from "node:assert/strict";
import { bbDate, monthGrid, monthRange, parseMonth, shiftMonth } from "../lib/calendar.ts";

test("November 2026 starts on a Sunday", () => {
  const g = monthGrid(2026, 11);
  assert.deepEqual(g[0].slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(g[0][6], "2026-11-01");
  assert.equal(g.flat().filter(Boolean).length, 30);
  assert.equal(g.every((w) => w.length === 7), true);
});

test("month keys", () => {
  assert.equal(parseMonth("2026-13", "2026-11-05").key, "2026-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.deepEqual(monthRange("2026-11"), { start: "2026-11-01T04:00:00.000Z", end: "2026-12-01T04:00:00.000Z" });
  assert.equal(bbDate("2026-11-06T02:00:00Z"), "2026-11-05");
});
