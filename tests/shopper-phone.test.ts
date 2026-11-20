import { test } from "node:test";
import assert from "node:assert/strict";
import { shopperPhone } from "../lib/shopper-phone.ts";

test("shopperPhone adds the area code and country code", () => {
  assert.equal(shopperPhone("555 1234"), "12465551234");
  assert.equal(shopperPhone("(246) 555-1234"), "12465551234");
  assert.equal(shopperPhone("+1 246 555 1234"), "12465551234");
  assert.equal(shopperPhone("1 868 555 1234"), "18685551234");
  assert.equal(shopperPhone("+44 7700 900123"), "447700900123");
});

test("shopperPhone rejects numbers that can't be right", () => {
  assert.equal(shopperPhone(""), null);
  assert.equal(shopperPhone("12345"), null);
  assert.equal(shopperPhone("246555123"), null);
  assert.equal(shopperPhone("0044 7700 900123"), null);
});
