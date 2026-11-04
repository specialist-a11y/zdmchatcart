import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildPaymentUrl, verifyFygaroSignature } from "../lib/fygaro.ts";
import { verifyMetaSignature, parseInbound } from "../lib/whatsapp.ts";

const SECRET = "test-secret";

test("payment URL carries a valid HS256 JWT with amount, currency and reference", () => {
  const url = new URL(buildPaymentUrl({
    buttonUrl: "https://fygaro.com/en/pb/abc123",
    keyId: "key-1", secret: SECRET, amount: 90, currency: "BBD", reference: "order-uuid", now: 1_800_000_000,
  }));
  const [h, p, s] = url.searchParams.get("jwt")!.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepEqual(header, { alg: "HS256", typ: "JWT", kid: "key-1" });
  assert.equal(payload.amount, "90.00");
  assert.equal(payload.currency, "BBD");
  assert.equal(payload.custom_reference, "order-uuid");
  assert.ok(payload.exp > payload.nbf);
  const expected = createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  assert.equal(s, expected);
  assert.equal(url.pathname, "/en/pb/abc123");
});

test("Fygaro hook signature: accepts valid, rejects tampered, stale or malformed", () => {
  const body = JSON.stringify({ transactionId: "t1", amount: "90.00", currency: "BBD", customReference: "o1" });
  const t = 1_800_000_000;
  const sig = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyFygaroSignature(body, `t=${t},v1=${sig}`, SECRET, t), true);
  assert.equal(verifyFygaroSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, SECRET, t), true, "any v1 may match");
  assert.equal(verifyFygaroSignature(body + " ", `t=${t},v1=${sig}`, SECRET, t), false, "tampered body");
  assert.equal(verifyFygaroSignature(body, `t=${t},v1=${sig}`, SECRET, t + 301), false, "stale");
  assert.equal(verifyFygaroSignature(body, `t=${t},v1=${sig}`, "wrong", t), false, "wrong secret");
  assert.equal(verifyFygaroSignature(body, null, SECRET, t), false);
  assert.equal(verifyFygaroSignature(body, "garbage", SECRET, t), false);
});

test("Meta webhook signature and inbound text parsing", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "1111" },
      contacts: [{ wa_id: "12465551234", profile: { name: "Tara Best" } }],
      messages: [
        { from: "12465551234", id: "wamid.1", type: "text", text: { body: "Hi! I'd like to place order zb-1042" } },
        { from: "12465551234", id: "wamid.2", type: "image", image: {} },
      ],
    } }] }],
  };
  const raw = JSON.stringify(payload);
  const header = "sha256=" + createHmac("sha256", "app-secret").update(raw).digest("hex");
  assert.equal(verifyMetaSignature(raw, header, "app-secret"), true);
  assert.equal(verifyMetaSignature(raw, header, "other"), false);
  const msgs = parseInbound(payload);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0], { phoneNumberId: "1111", from: "12465551234", name: "Tara Best", messageId: "wamid.1", text: "Hi! I'd like to place order zb-1042" });
});
