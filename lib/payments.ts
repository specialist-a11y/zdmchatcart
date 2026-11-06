import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaymentUrl } from "./fygaro";
import { sendWhatsAppImage, sendWhatsAppText } from "./whatsapp";
import { money } from "./order-text";
import { receiptUrl } from "./receipt";

type Admin = SupabaseClient;

export async function getIntegration(admin: Admin, businessId: string, provider: "fygaro" | "whatsapp" | "instagram") {
  const [{ data: integ }, { data: sec }] = await Promise.all([
    admin.from("integrations").select("status, config").eq("business_id", businessId).eq("provider", provider).maybeSingle(),
    admin.from("integration_secrets").select("secret").eq("business_id", businessId).eq("provider", provider).maybeSingle(),
  ]);
  if (!integ || integ.status !== "connected" || !sec) return null;
  return { config: integ.config as Record<string, string>, secret: sec.secret as string };
}

/** Create (or reuse) the Fygaro payment link for an order and move it to awaiting_payment. */
export async function ensurePaymentLink(admin: Admin, orderId: string): Promise<string | null> {
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, total, currency, payment_url, status")
    .eq("id", orderId)
    .single();
  if (!order) return null;
  if (order.payment_url) return order.payment_url;
  if (!(Number(order.total) > 0)) return null;
  const fygaro = await getIntegration(admin, order.business_id, "fygaro");
  if (!fygaro?.config.button_url || !fygaro.config.key_id) return null;
  const url = buildPaymentUrl({
    buttonUrl: fygaro.config.button_url,
    keyId: fygaro.config.key_id,
    secret: fygaro.secret,
    amount: Number(order.total),
    currency: order.currency,
    reference: order.id,
  });
  await admin
    .from("orders")
    .update({
      payment_url: url,
      status: order.status === "awaiting_confirmation" ? "awaiting_payment" : order.status,
    })
    .eq("id", order.id);
  return url;
}

/** Send a WhatsApp message from a business and log it. Silently skips if WhatsApp is not connected. */
export async function sendFromBusiness(
  admin: Admin,
  businessId: string,
  to: string,
  body: string,
  refs: { customerId?: string | null; orderId?: string | null; sentBy?: "person" | "ai" } = {},
) {
  const wa = await getIntegration(admin, businessId, "whatsapp");
  if (!wa?.config.phone_number_id) return { ok: false, error: "WhatsApp not connected" };
  const res = await sendWhatsAppText({ phoneNumberId: wa.config.phone_number_id, accessToken: wa.secret, to, body });
  const row = {
    business_id: businessId,
    customer_id: refs.customerId ?? null,
    order_id: refs.orderId ?? null,
    channel: "whatsapp",
    direction: "out",
    body,
    external_id: res.id ?? null,
  };
  // sent_by (migration 0024) tells the AI assistant a person is talking; logged without it before then.
  const { error } = await admin.from("messages").insert((refs.sentBy ? { ...row, sent_by: refs.sentBy } : row) as typeof row);
  if (error && refs.sentBy) await admin.from("messages").insert(row);
  return res;
}

/**
 * Send the till-style receipt image for a paid order, with a short caption.
 * Falls back to a text receipt if the image can't be sent (for example no public site URL yet).
 */
export async function sendReceipt(admin: Admin, orderId: string) {
  const { data: o } = await admin
    .from("orders")
    .select("id, business_id, code, total, currency, customer_id, paid_at, customers(phone)")
    .eq("id", orderId).maybeSingle<any>();
  if (!o?.paid_at) return { ok: false, error: "Order isn't paid yet" };
  const to = o.customers?.phone;
  if (!to) return { ok: false, error: "No customer phone on this order" };
  const wa = await getIntegration(admin, o.business_id, "whatsapp");
  if (!wa?.config.phone_number_id) return { ok: false, error: "WhatsApp not connected" };
  const caption = `Payment received for order ${o.code}: ${money(o.total, o.currency)}. Thank you! Here's your receipt. We'll let you know when it's ready.`;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/^https:\/\//.test(site)) {
    const res = await sendWhatsAppImage({ phoneNumberId: wa.config.phone_number_id, accessToken: wa.secret, to, link: receiptUrl(o.id), caption });
    if (res.ok) {
      await admin.from("messages").insert({
        business_id: o.business_id, customer_id: o.customer_id, order_id: o.id,
        channel: "whatsapp", direction: "out", body: `[Receipt image] ${caption}`, external_id: res.id ?? null,
      });
      return res;
    }
  }
  return sendFromBusiness(admin, o.business_id, to, caption.replace(" Here's your receipt.", ""), { customerId: o.customer_id, orderId: o.id });
}
