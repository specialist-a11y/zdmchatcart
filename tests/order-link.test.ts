import { test } from "node:test";
import assert from "node:assert/strict";

process.env.RECEIPT_SECRET = "test-secret";
const { checkOrderToken, orderPath, orderToken, shopperEmail } = await import("../lib/order-link.ts");

const id = "8c85771d-9ed9-4c60-a24f-189e3992b990";

test("order links only open with their own token", () => {
  assert.equal(checkOrderToken(id, orderToken(id)), true);
  assert.equal(checkOrderToken(id, "wrong"), false);
  assert.equal(checkOrderToken("not-an-id", orderToken(id)), false);
  assert.match(orderPath(id), new RegExp(`^/o/${id}\\?t=`));
});

test("shopperEmail keeps real-looking addresses", () => {
  assert.equal(shopperEmail(" Tara@Example.com "), "tara@example.com");
  assert.equal(shopperEmail("tara@example"), null);
  assert.equal(shopperEmail("no at sign"), null);
});
