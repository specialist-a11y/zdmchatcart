import { test } from "node:test";
import assert from "node:assert/strict";
import { awayDue, cleanHours, fmt, hoursSummary, matchFaq, openState, splitKeywords } from "../lib/hours.ts";

const H = cleanHours({ mon: [], tue: [["07:00", "17:00"]], wed: [["07:00", "17:00"]], thu: [["07:00", "17:00"]], fri: [["07:00", "17:00"]], sat: [["06:00", "13:00"]], sun: [["bad", "x"]] });
// Barbados is UTC-4. 2026-11-05 is a Thursday.
const bb = (iso: string) => Date.parse(`${iso}-04:00`);

test("clean hours drops bad ranges", () => {
  assert.equal(H.sun, undefined);
  assert.deepEqual(cleanHours({ mon: [["10:00", "09:00"]] }), {});
});

test("open state", () => {
  assert.equal(openState(H, { now: bb("2026-11-05T10:00:00") }).label, "Open now, until 5pm");
  assert.equal(openState(H, { now: bb("2026-11-05T06:00:00") }).label, "Closed, opens 7am today");
  assert.equal(openState(H, { now: bb("2026-11-05T18:00:00") }).label, "Closed, opens tomorrow 7am");
  assert.equal(openState(H, { now: bb("2026-11-08T12:00:00") }).label, "Closed, opens Tue 7am"); // Sunday
  assert.equal(openState({}, { now: bb("2026-11-08T12:00:00") }).reason, "unknown");
  const hol = openState(H, { now: bb("2026-12-26T10:00:00"), closedUntil: "2026-12-28", closedNote: "Closed for Christmas" });
  assert.equal(hol.open, false);
  assert.equal(hol.label, "Closed for Christmas. Back 29 Dec");
});

test("summary groups days", () => {
  assert.equal(hoursSummary(H), "Mon closed · Tue to Fri 7am to 5pm · Sat 6am to 1pm · Sun closed");
  assert.equal(fmt("13:30"), "1:30pm");
});

test("faq matching", () => {
  const faqs = [
    { id: "a", keywords: ["deliver", "delivery"], answer: "We deliver" },
    { id: "b", keywords: ["price", "how much"], answer: "Prices" },
    { id: "c", keywords: ["delivery fee"], answer: "BBD 15" },
  ];
  assert.equal(matchFaq("Do you do DELIVERY?", faqs)?.id, "a");
  assert.equal(matchFaq("what's the delivery fee", faqs)?.id, "c");
  assert.equal(matchFaq("How much is black cake", faqs)?.id, "b");
  assert.equal(matchFaq("priceless", faqs), null);
  assert.deepEqual(splitKeywords("Delivery, deliver,\nX, delivery"), ["delivery", "deliver"]);
});

test("away once per 12 hours", () => {
  const now = Date.now();
  assert.equal(awayDue(null, now), true);
  assert.equal(awayDue(new Date(now - 3600_000).toISOString(), now), false);
});
