import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, daysLeft, direction, previewChange, proration, reminderDue, todayIn } from "../lib/billing.ts";

const P = {
  aio: { id: "all-in-one", name: "All-in-One", monthly_price: 650, rank: 40 },
  aiov: { id: "all-in-one-video", name: "All-in-One + Video", monthly_price: 1450, rank: 60 },
  starter: { id: "starter", name: "Starter", monthly_price: 150, rank: 10 },
};

test("direction follows rank", () => {
  assert.equal(direction(P.aio, P.aiov), "upgrade");
  assert.equal(direction(P.aiov, P.starter), "downgrade");
  assert.equal(direction(P.aio, P.aio), "same");
});

test("days left counts today and clamps", () => {
  assert.deepEqual(daysLeft("2026-11-01", "2026-12-01", "2026-11-03"), { total: 30, left: 28 });
  assert.deepEqual(daysLeft("2026-11-01", "2026-12-01", "2026-12-05"), { total: 30, left: 0 });
  assert.deepEqual(daysLeft("2026-11-01", "2026-12-01", "2026-10-20"), { total: 30, left: 30 });
});

test("proration matches the design example (28 of 30 days, 1450 -> 650)", () => {
  assert.equal(proration(1450, 650, "2026-11-01", "2026-12-01", "2026-11-03"), -746.67);
  assert.equal(proration(650, 1450, "2026-11-01", "2026-12-01", "2026-11-03"), 746.67);
});

test("downgrade defaults to renewal with nothing charged now", () => {
  const p = previewChange({ from: P.aiov, to: P.aio, periodStart: "2026-11-01", periodEnd: "2026-12-01", today: "2026-11-03" });
  assert.equal(p.timing, "renewal");
  assert.equal(p.chargeNow, 0);
  assert.equal(p.nextInvoice, 650);
  assert.equal(p.effectiveOn, "2026-12-01");
});

test("downgrade now credits the unused days against the next invoice", () => {
  const p = previewChange({ from: P.aiov, to: P.aio, timing: "now", periodStart: "2026-11-01", periodEnd: "2026-12-01", today: "2026-11-03" });
  assert.equal(p.creditNow, 746.67);
  assert.equal(p.nextInvoice, 0); // 650 - 746.67 floors at 0; the rest stays as credit
});

test("upgrade now charges the prorated difference", () => {
  const p = previewChange({ from: P.aio, to: P.aiov, periodStart: "2026-11-01", periodEnd: "2026-12-01", today: "2026-11-03" });
  assert.equal(p.timing, "now");
  assert.equal(p.chargeNow, 746.67);
  assert.equal(p.nextInvoice, 1450);
});

test("addMonths clamps month ends", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-01", 1), "2026-12-01");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
});

test("reminders go out on day 3 and day 7, once each", () => {
  assert.equal(reminderDue("2026-11-01", "2026-11-02", 0), null);
  assert.equal(reminderDue("2026-11-01", "2026-11-04", 0), 1);
  assert.equal(reminderDue("2026-11-01", "2026-11-05", 1), null);
  assert.equal(reminderDue("2026-11-01", "2026-11-08", 1), 2);
  assert.equal(reminderDue("2026-11-01", "2026-11-20", 2), null);
});

test("todayIn formats as YYYY-MM-DD in Barbados time", () => {
  assert.equal(todayIn("America/Barbados", new Date("2026-11-04T02:30:00Z")), "2026-11-03");
});

import { contactOverage } from "../lib/billing.ts";
test("contacts over the allowance are billed per started block of 1,000", () => {
  assert.deepEqual(contactOverage(1000, 1000, 1000, 50), { over: 0, blocks: 0, amount: 0 });
  assert.deepEqual(contactOverage(1001, 1000, 1000, 50), { over: 1, blocks: 1, amount: 50 });
  assert.deepEqual(contactOverage(2400, 1000, 1000, 50), { over: 1400, blocks: 2, amount: 100 });
  assert.deepEqual(contactOverage(300, 1000, 1000, 50), { over: 0, blocks: 0, amount: 0 });
});

import { adResults, maxSpend } from "../lib/billing.ts";
test("ad return and cost per order match the design numbers", () => {
  assert.deepEqual(adResults(412, 1960, 34), { roas: 4.8, costPerOrder: 12.12 });
  assert.deepEqual(adResults(0, 0, 0), { roas: null, costPerOrder: null });
});
test("max spend is daily budget times days, inclusive", () => {
  assert.equal(maxSpend(20, "2026-12-01", "2026-12-20"), 400);
  assert.equal(maxSpend(20, null, "2026-12-20"), null);
});

import { audienceSummary, parseAudience, normalizePhone } from "../lib/audience.ts";
test("audience summary reads like a sentence", () => {
  const a = { area: "parishes", parishes: ["St Peter", "St James"], radius_km: null, age_min: 22, age_max: 55, gender: "all", interests: ["Local food", "Baking"], warm: ["cart_abandoners"], placements: ["instagram", "facebook"] };
  assert.equal(audienceSummary(a), "People aged 22 to 55 in St Peter and St James, who like local food and baking. Plus people who started an order but didn't pay. Shown on Instagram and Facebook.");
  assert.equal(audienceSummary({ ...a, area: "radius", radius_km: 10, interests: [], warm: [], placements: ["instagram"], gender: "women", age_max: 65 }, "Speightstown"),
    "Women aged 22 to 65+ within 10 km of Speightstown. Shown on Instagram.");
});
test("audience form parsing clamps and cleans", () => {
  const f: Record<string, string> = { area: "radius", radius_km: "500", age_min: "70", age_max: "16", gender: "x", interests: "food, , weddings" };
  const all: Record<string, string[]> = { placements: ["tiktok"], warm: ["shop_visitors", "hackers"], parishes: ["St Lucy"] };
  const a = parseAudience((k) => f[k] ?? "", (k) => all[k] ?? []);
  assert.deepEqual(a, { area: "radius", parishes: [], radius_km: 80, age_min: 18, age_max: 65, gender: "all", interests: ["food", "weddings"], warm: ["shop_visitors"], placements: ["instagram", "facebook"] });
});
test("phone normalising for Meta matching", () => {
  assert.equal(normalizePhone("+1 (246) 555-0123"), "12465550123");
  assert.equal(normalizePhone("555 0123"), "12465550123");
});

import { insights } from "../lib/insights.ts";
test("zero guesswork tips come from real orders", () => {
  const now = Date.parse("2026-11-03T15:00:00Z");
  const mk = (id: string, paidAt: string, items: [string, string][]) => ({ id, status: "paid", source: "web", total: 10, created_at: paidAt, paid_at: paidAt, order_items: items.map(([pid, name]) => ({ product_id: pid, name, quantity: 1, unit_price: 10 })) });
  // Saturdays 8am Barbados = 12:00 UTC
  const orders = [mk("1", "2026-10-31T12:10:00Z", [["p1", "Black cake"]]), mk("2", "2026-10-31T12:40:00Z", [["p1", "Black cake"], ["p2", "Sweetbread"]]), mk("3", "2026-10-24T12:20:00Z", [["p1", "Black cake"]])];
  const products = [{ id: "p1", name: "Black cake", active: true, created_at: "2026-01-01T00:00:00Z" }, { id: "p2", name: "Sweetbread", active: true, created_at: "2026-01-01T00:00:00Z" }, { id: "p3", name: "Bread pudding", active: true, created_at: "2026-01-01T00:00:00Z" }];
  const t = insights(orders, products, now);
  assert.equal(t.scale.title, "Black cake: in 3 paid orders.");
  assert.equal(t.kill.title, "Bread pudding: 0 orders in 30 days.");
  assert.equal(t.timing.title, "Saturday orders peak 8am to 10am.");
  assert.equal(insights([], products, now).scale.title, "Not enough sales yet.");
});
