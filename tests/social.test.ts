import { test } from "node:test";
import assert from "node:assert/strict";

process.env.META_APP_SECRET = "test-secret";
const { makeState, readState, pickPage } = await import("../lib/social.ts");

test("social state round-trips and expires", () => {
  const now = 1_800_000_000_000;
  const s = makeState("island-crumb", "user-1", now);
  assert.deepEqual(readState(s, now + 60_000), { slug: "island-crumb", userId: "user-1" });
  assert.equal(readState(s, now + 16 * 60_000), null);
});

test("social state rejects tampering", () => {
  const s = makeState("island-crumb", "user-1");
  const [body, mac] = s.split(".");
  const evil = Buffer.from(JSON.stringify({ s: "other-shop", u: "user-1", t: Date.now() })).toString("base64url");
  assert.equal(readState(`${evil}.${mac}`), null);
  assert.equal(readState(`${body}.x${mac.slice(1)}`), null);
  assert.equal(readState("nonsense"), null);
});

test("prefers the Page with Instagram linked", () => {
  const pages = [{ id: "1", name: "Old page", access_token: "a" }, { id: "2", name: "Island Crumb", access_token: "b", instagram_business_account: { id: "9", username: "islandcrumb" } }];
  assert.equal(pickPage(pages)?.id, "2");
  assert.equal(pickPage(pages, "1")?.id, "1");
  assert.equal(pickPage([]), null);
});
