import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The shopper's own order page (/o/<order id>?t=<token>), for customers who don't use WhatsApp.
 * The signed token means only the person given the link can open it.
 */
const key = () => process.env.RECEIPT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function orderToken(orderId: string) {
  return createHmac("sha256", key()).update(`order:${orderId}`).digest("base64url").slice(0, 24);
}

export function checkOrderToken(orderId: string, token: string) {
  if (!key() || !token || !/^[0-9a-f-]{36}$/.test(orderId)) return false;
  const a = Buffer.from(orderToken(orderId)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Path only, so it works on the ZDM ChatCart site and on a shop's own domain. */
export const orderPath = (orderId: string) => `/o/${orderId}?t=${orderToken(orderId)}`;

/** A plausible email address, lowercased, or null. */
export function shopperEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : null;
}
