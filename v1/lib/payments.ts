import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaymentUrl } from "./fygaro";
import { sendWhatsAppText } from "./whatsapp";

type Admin = SupabaseClient;

export async function getIntegration(admin: Admin, businessId: string, provider: "fygaro" | "whatsapp") {
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
  refs: { customerId?: string | null; orderId?: string | null } = {},
) {
  const wa = await getIntegration(admin, businessId, "whatsapp");
  if (!wa?.config.phone_number_id) return { ok: false, error: "WhatsApp not connected" };
  const res = await sendWhatsAppText({ phoneNumberId: wa.config.phone_number_id, accessToken: wa.secret, to, body });
  await admin.from("messages").insert({
    business_id: businessId,
    customer_id: refs.customerId ?? null,
    order_id: refs.orderId ?? null,
    channel: "whatsapp",
    direction: "out",
    body,
    external_id: res.id ?? null,
  });
  return res;
}
