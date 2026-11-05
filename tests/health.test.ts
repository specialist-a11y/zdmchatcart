import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenState, walletLow } from "../lib/health.ts";

const now = Date.parse("2026-11-05T12:00:00Z");
const inDays = (d: number) => Math.floor((now + d * 86_400_000) / 1000);

test("token states", () => {
  assert.equal(tokenState(null, now).state, "unknown");
  assert.equal(tokenState({ is_valid: false }, now).state, "expired");
  assert.equal(tokenState({ is_valid: true, expires_at: 0 }, now).state, "ok");
  assert.equal(tokenState({ is_valid: true, expires_at: 0, data_access_expires_at: inDays(5) }, now).state, "soon");
  assert.equal(tokenState({ is_valid: true, expires_at: inDays(60) }, now).state, "ok");
  assert.equal(tokenState({ is_valid: true, expires_at: inDays(-1) }, now).state, "expired");
  assert.equal(tokenState({ is_valid: true, expires_at: inDays(1.5) }, now).label, "Expires in 1 day");
});

test("wallet low", () => {
  assert.equal(walletLow(40, null), true);
  assert.equal(walletLow(80, null), false);
  assert.equal(walletLow(80, 1500), true); // 3 days of 1500/month is 150
});
