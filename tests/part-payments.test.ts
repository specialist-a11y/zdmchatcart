import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPayment, balanceDue } from "../lib/part-payments.ts";

test("a part payment leaves a balance", () => {
  assert.deepEqual(applyPayment(260, 0, "100"), { amount: 100, paid: 100, balance: 160, full: false });
  assert.equal(balanceDue(260, 100), 160);
});

test("the last payment clears the order", () => {
  assert.deepEqual(applyPayment(260, 100, "160.00"), { amount: 160, paid: 260, balance: 0, full: true });
  assert.deepEqual(applyPayment("210.50", "10.25", "$200.25"), { amount: 200.25, paid: 210.5, balance: 0, full: true });
});

test("amounts that can't be right are refused", () => {
  assert.ok("error" in applyPayment(260, 0, ""));
  assert.ok("error" in applyPayment(260, 0, "0"));
  assert.ok("error" in applyPayment(260, 100, "161"));
  assert.ok("error" in applyPayment(260, 260, "1"));
});
