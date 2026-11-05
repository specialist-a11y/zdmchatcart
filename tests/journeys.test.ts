import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, cartReminderText, consentCommand, fillTemplate, placeholderCount, readyMessage, reminderDue, templateValues } from "../lib/journeys.ts";

test("STOP and START are whole-message commands", () => {
  assert.equal(consentCommand("STOP"), "stop");
  assert.equal(consentCommand(" Stop. "), "stop");
  assert.equal(consentCommand("unsubscribe"), "stop");
  assert.equal(consentCommand("START"), "start");
  assert.equal(consentCommand("stop by at 3 for my cake"), null);
  assert.equal(consentCommand("IC-1048"), null);
  assert.equal(consentCommand(""), null);
});

test("ready message for pickup and delivery", () => {
  assert.match(readyMessage({ code: "IC-1", name: "Renee Clarke", shop: "Island Crumb", address: "Hastings" }), /^Hi Renee! .*ready for pickup at Hastings/);
  assert.match(readyMessage({ code: "IC-1", fulfillment: "delivery", shop: "Island Crumb" }), /on its way/);
});

test("cart reminder includes link and STOP", () => {
  const t = cartReminderText({ code: "IC-2", shop: "Island Crumb", paymentUrl: "https://pay/x" });
  assert.match(t, /https:\/\/pay\/x/);
  assert.match(t, /STOP/);
});

test("reminder window is 20 to 47 hours", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const h = (n: number) => new Date(now - n * 3600_000).toISOString();
  assert.equal(reminderDue(h(10), now), false);
  assert.equal(reminderDue(h(21), now), true);
  assert.equal(reminderDue(h(47.5), now), false);
});

test("templates fill in order", () => {
  const vals = templateValues(["name", "code", "link"], { name: "Tara Best", code: "IC-9" });
  assert.deepEqual(vals, ["Tara", "IC-9", "-"]);
  assert.equal(fillTemplate("Hi {{1}}, order {{2}}. {{4}}", vals), "Hi Tara, order IC-9. {{4}}");
  assert.equal(placeholderCount("Hi {{1}} {{3}}"), 3);
});

test("ago", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(ago(new Date(now - 40 * 60000).toISOString(), now), "40m");
  assert.equal(ago(new Date(now - 3 * 3600_000).toISOString(), now), "3h");
  assert.equal(ago(new Date(now - 72 * 3600_000).toISOString(), now), "3d");
});

test("daily summary", async () => {
  const { dailySummary } = await import("../lib/journeys.ts");
  const t = dailySummary({ shop: "Island Crumb", currency: "BBD", sales: 640, paidOrders: 9, newOrders: 11, unpaid: 1, unpaidTotal: 90, ready: 4, waiting: 0, link: "https://x" });
  assert.match(t, /Sales: BBD 640.00 from 9 paid orders/);
  assert.match(t, /Unpaid: 1 \(BBD 90.00\)/);
  assert.doesNotMatch(t, /Chats waiting/);
  assert.match(dailySummary({ shop: "A", currency: "BBD", sales: 0, paidOrders: 0, newOrders: 0, unpaid: 0, unpaidTotal: 0, ready: 0, waiting: 0, link: "x" }), /quiet day/);
});
