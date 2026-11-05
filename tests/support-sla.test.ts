import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessHours, nextOpen, replyBy, teamOnline, whenLabel } from "../lib/support-sla.ts";

// Barbados is UTC-4: 9am local = 13:00 UTC. 2026-11-05 is a Thursday.
const bb = (iso: string) => Date.parse(`${iso}-04:00`);

test("online during weekday hours only", () => {
  assert.equal(teamOnline(bb("2026-11-05T10:00:00")), true);
  assert.equal(teamOnline(bb("2026-11-05T08:59:00")), false);
  assert.equal(teamOnline(bb("2026-11-05T17:00:00")), false);
  assert.equal(teamOnline(bb("2026-11-07T11:00:00")), false); // Saturday
});

test("next open skips nights and weekends", () => {
  assert.equal(nextOpen(bb("2026-11-05T20:00:00")), bb("2026-11-06T09:00:00"));
  assert.equal(nextOpen(bb("2026-11-06T18:00:00")), bb("2026-11-09T09:00:00")); // Friday evening -> Monday
  assert.equal(nextOpen(bb("2026-11-05T07:00:00")), bb("2026-11-05T09:00:00"));
});

test("4 business hours", () => {
  assert.equal(addBusinessHours(bb("2026-11-05T10:00:00"), 4), bb("2026-11-05T14:00:00"));
  assert.equal(addBusinessHours(bb("2026-11-05T15:00:00"), 4), bb("2026-11-06T11:00:00"));
  assert.equal(addBusinessHours(bb("2026-11-07T12:00:00"), 4), bb("2026-11-09T13:00:00"));
  assert.equal(replyBy(new Date(bb("2026-11-05T16:30:00")).toISOString(), bb("2026-11-05T16:31:00")), bb("2026-11-06T12:30:00"));
});

test("labels", () => {
  const now = bb("2026-11-05T10:00:00");
  assert.equal(whenLabel(bb("2026-11-05T14:00:00"), now), "today 2pm");
  assert.equal(whenLabel(bb("2026-11-09T09:30:00"), now), "Mon 9:30am");
});
