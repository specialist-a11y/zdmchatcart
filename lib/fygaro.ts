import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Fygaro Links: a payment button URL plus a signed JWT that pre-fills the amount
 * and our order id (custom_reference). JWT pre-fill needs the Fygaro Pro plan or above.
 * Docs: https://help.fygaro.com/en-us/article/h78p9y/
 */

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export type PaymentLinkInput = {
  buttonUrl: string; // the Fygaro Link (button) URL created in the Fygaro dashboard
  keyId: string; // Fygaro API public key, sent as the JWT "kid"
  secret: string; // Fygaro API secret, used to sign
  amount: number;
  currency: string;
  reference: string; // our order id, comes back as customReference in the webhook
  expiresInSeconds?: number;
  now?: number; // unix seconds, for tests
};

export function buildPaymentUrl(input: PaymentLinkInput): string {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: input.keyId };
  const payload = {
    amount: input.amount.toFixed(2),
    currency: input.currency,
    custom_reference: input.reference,
    nbf: now - 60,
    exp: now + (input.expiresInSeconds ?? 3 * 24 * 3600),
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = b64url(createHmac("sha256", input.secret).update(unsigned).digest());
  const url = new URL(input.buttonUrl);
  url.searchParams.set("jwt", `${unsigned}.${signature}`);
  return url.toString();
}

/**
 * Verify a Fygaro Hook request.
 * Header "Fygaro-Signature: t=<unix>,v1=<hex>[,v1=<hex>]"; message = t + "." + raw body;
 * HMAC-SHA256 hex with the API secret; reject if the timestamp is more than 5 minutes off.
 * Docs: https://help.fygaro.com/en-us/article/payment-button-hook-1wkui1k/
 */
export function verifyFygaroSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader) return false;
  let t: string | undefined;
  const v1: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t") t = v;
    else if (k === "v1" && v) v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const exp = Buffer.from(expected, "utf8");
  return v1.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    return got.length === exp.length && timingSafeEqual(got, exp);
  });
}

export type FygaroHookPayload = {
  transactionId: string;
  reference?: string;
  customReference?: string | null;
  currency: string;
  amount: string;
  createdAt?: string;
  client?: { name?: string; email?: string; phone?: string };
};
