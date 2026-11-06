import { test } from "node:test";
import assert from "node:assert/strict";
import { codePrefix, shopAddress } from "../lib/signup.ts";

test("shop address is made web-safe", () => {
  assert.equal(shopAddress("Hoytes New Development"), "hoytes-new-development");
  assert.equal(shopAddress("  Café & Bakery!! "), "cafe-and-bakery");
  assert.equal(shopAddress("-island-crumb-"), "island-crumb");
  assert.ok(shopAddress("a".repeat(80)).length <= 41);
  assert.match(shopAddress("Starlight Cinema Experiences Barbados Limited"), /^[a-z0-9][a-z0-9-]{1,40}$/);
});

test("order code prefix from the business name", () => {
  assert.equal(codePrefix("Starlight Cinema Experiences"), "SCE");
  assert.equal(codePrefix("Hoytes"), "HO");
  assert.equal(codePrefix("A B C D E"), "ABCD");
  assert.equal(codePrefix(""), "");
});
