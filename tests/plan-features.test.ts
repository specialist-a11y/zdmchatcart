import { test } from "node:test";
import assert from "node:assert/strict";
import { entitlementsFrom, firstInvoice, has, plansWith, sectionOpen } from "../lib/plan-features.ts";

const starter = { id: "starter", name: "Starter", rank: 10, features: [] as string[], video_clips: 0 };
const growth = { id: "growth", name: "Growth", rank: 20, features: ["ig_autoreplies", "cart_recovery"], video_clips: 0 };
const aio = { id: "all-in-one", name: "All-in-One", rank: 40, features: ["ig_autoreplies", "reporting", "ads"], video_clips: 0 };
const gv = { id: "growth-video", name: "Growth + Video", rank: 50, features: ["ig_autoreplies"], video_clips: 10 };

test("Starter gets core sections only", () => {
  const e = entitlementsFrom(starter, "active");
  assert.equal(sectionOpen(e, "orders"), true);
  assert.equal(sectionOpen(e, "inbox"), true);
  assert.equal(sectionOpen(e, "autoreplies"), false);
  assert.equal(sectionOpen(e, "ads"), false);
  assert.equal(sectionOpen(e, "videos"), false);
  assert.equal(has(e, "reporting"), false);
});

test("Growth opens IG auto-replies, not ads", () => {
  const e = entitlementsFrom(growth, "active");
  assert.equal(sectionOpen(e, "autoreplies"), true);
  assert.equal(sectionOpen(e, "ads"), false);
});

test("a plan with video clips always has Videos", () => {
  assert.equal(sectionOpen(entitlementsFrom(gv, "active"), "videos"), true);
});

test("unknown feature keys are ignored", () => {
  assert.deepEqual(entitlementsFrom({ ...starter, features: ["hack"] }, "active").features, []);
});

test("waiting for first payment: only setup sections open, no features", () => {
  const e = entitlementsFrom(aio, "pending_payment");
  assert.equal(e.live, false);
  assert.equal(sectionOpen(e, "products"), true);
  assert.equal(sectionOpen(e, "billing"), true);
  assert.equal(sectionOpen(e, "orders"), false);
  assert.equal(sectionOpen(e, "ads"), false);
  assert.equal(has(e, "ads"), false);
});

test("past due keeps working, paused and cancelled don't", () => {
  assert.equal(entitlementsFrom(aio, "past_due").live, true);
  assert.equal(entitlementsFrom(aio, "paused").live, false);
  assert.equal(entitlementsFrom(aio, "cancelled").live, false);
  assert.equal(entitlementsFrom(null, "active").live, false);
});

test("plansWith lists the cheapest plans first", () => {
  assert.deepEqual(plansWith([gv, aio, growth, starter], "ig_autoreplies").map((p) => p.id), ["growth", "all-in-one", "growth-video"]);
  assert.deepEqual(plansWith([gv, aio, { ...growth, active: false }], "ig_autoreplies").map((p) => p.id), ["all-in-one", "growth-video"]);
});

test("first invoice is setup plus first month", () => {
  const fi = firstInvoice({ name: "Starter", monthly_price: 150, setup_fee: 1500 });
  assert.equal(fi.amount, 1650);
  assert.match(fi.description, /setup/);
  assert.equal(firstInvoice({ name: "X", monthly_price: 300, setup_fee: 0 }).description, "X: first month");
});

test("Starter is limited to the core; Growth adds cart recovery, summary and bot automation", async () => {
  const { entitlementsFrom, has, sectionOpen } = await import("../lib/plan-features.ts");
  const starter = entitlementsFrom({ id: "starter", name: "Starter", features: [] }, "active");
  for (const k of ["cart_recovery", "daily_summary", "wa_automations", "ig_autoreplies", "reporting", "marketing_autopilot", "ads", "videos"] as const) assert.equal(has(starter, k), false, k);
  assert.equal(sectionOpen(starter, "autoreplies"), false);
  assert.equal(sectionOpen(starter, "ads"), false);
  assert.equal(sectionOpen(starter, "orders"), true);
  const growth = entitlementsFrom({ id: "growth", name: "Growth", features: ["ig_autoreplies", "cart_recovery", "daily_summary", "wa_automations"] }, "active");
  for (const k of ["cart_recovery", "daily_summary", "wa_automations", "ig_autoreplies"] as const) assert.equal(has(growth, k), true, k);
  assert.equal(has(growth, "reporting"), false);
});
