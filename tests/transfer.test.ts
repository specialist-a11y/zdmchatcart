import { test } from "node:test";
import assert from "node:assert/strict";
import { transferInstructions, wantsTransfer, claimsPaid, findReference } from "../lib/transfer.ts";

test("transfer instructions carry amount, reference and card fallback", () => {
  const t = transferInstructions({ code: "IC-1048", amount: "BBD $85.00" }, "CIBC Caribbean\nIsland Crumb Bakery Ltd\nAcct 100234567", "https://pay.example/x");
  assert.match(t, /Reference: IC-1048/);
  assert.match(t, /Acct 100234567/);
  assert.match(t, /BBD \$85\.00|85\.00/);
  assert.match(t, /Prefer card\? Pay here instead: https:\/\/pay\.example\/x/);
});

test("recognises customer intent", () => {
  assert.ok(wantsTransfer("Transfer"));
  assert.ok(wantsTransfer("bank transfer please"));
  assert.ok(wantsTransfer("can I use 1st pay?"));
  assert.ok(wantsTransfer("First Pay"));
  assert.equal(wantsTransfer("no transfer needed, I'll pay card"), false);
  assert.ok(claimsPaid("Done"));
  assert.ok(claimsPaid("I have sent it"));
  assert.equal(claimsPaid("when is it done?"), false);
});

test("finds transfer references, not amounts or order codes", () => {
  assert.equal(findReference("Ref 88231-ab"), "88231-AB");
  assert.equal(findReference("sent, TRX0042183"), "TRX0042183");
  assert.equal(findReference("I paid 85.00"), null);
  assert.equal(findReference("done thanks"), null);
});
