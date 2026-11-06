"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePaymentLink, sendFromBusiness } from "@/lib/payments";
import { sendIgFromBusiness } from "@/lib/ig-inbox";
import { createOrderFor, readPick } from "@/lib/manual-order";
import { needsPrice, orderSummary } from "@/lib/order-text";
import { str } from "@/lib/crm-actions";

type Channel = "whatsapp" | "instagram";
const to = (slug: string, c: string, m: string): never => redirect(`/dashboard/${slug}/inbox?c=${c}&msg=${encodeURIComponent(m)}`);

/** Send text to a customer on the channel of the conversation. */
async function sendOn(admin: ReturnType<typeof createAdminClient>, businessId: string, customer: { id: string; phone: string | null }, channel: Channel, body: string, orderId?: string) {
  if (channel === "instagram") return sendIgFromBusiness(admin, businessId, customer.id, body);
  if (!customer.phone) return { ok: false, error: "This customer has no WhatsApp number" };
  return sendFromBusiness(admin, businessId, customer.phone, body, { customerId: customer.id, orderId: orderId ?? null, sentBy: "person" });
}

async function load(slug: string, customerId: string) {
  const { supabase, business } = await requireMembership(slug);
  const { data: c } = await supabase.from("customers").select("id, phone").eq("id", customerId).eq("business_id", business.id).maybeSingle();
  if (!c) to(slug, customerId, "Customer not found");
  return { business, customer: c! as { id: string; phone: string | null }, admin: createAdminClient() };
}

export async function reply(f: FormData) {
  const slug = str(f, "slug"), cid = str(f, "customer_id");
  const body = str(f, "body").slice(0, 4000);
  if (!body) to(slug, cid, "Write a message first");
  const { business, customer, admin } = await load(slug, cid);
  const res = await sendOn(admin, business.id, customer, str(f, "channel") === "instagram" ? "instagram" : "whatsapp", body);
  to(slug, cid, res.ok ? "Sent" : `Not sent: ${res.error ?? "it was refused"}`);
}

/** The payment link for the customer's open order, in the chat. */
export async function sendPayLink(f: FormData) {
  const slug = str(f, "slug"), cid = str(f, "customer_id");
  const { business, customer, admin } = await load(slug, cid);
  const { data: o } = await admin.from("orders").select("id, code, total, currency, order_items(name, unit_price, quantity)")
    .eq("business_id", business.id).eq("customer_id", cid).eq("code", str(f, "code")).maybeSingle<any>();
  if (!o) to(slug, cid, "Order not found");
  if (needsPrice(o.order_items ?? [])) redirect(`/dashboard/${slug}/orders/${o.code}?msg=${encodeURIComponent("Set the prices first, then send the link")}`);
  const url = await ensurePaymentLink(admin, o.id);
  if (!url) to(slug, cid, "Connect Fygaro in Settings first");
  const res = await sendOn(admin, business.id, customer, str(f, "channel") === "instagram" ? "instagram" : "whatsapp",
    `${orderSummary(o.code, o.order_items, o.total, o.currency)}\n\nPay securely here: ${url}`, o.id);
  to(slug, cid, res.ok ? `Payment link for ${o.code} sent` : `Not sent: ${res.error}`);
}

/** Make an order from the chat, then send the summary and payment link. */
export async function createOrderFromChat(f: FormData) {
  const slug = str(f, "slug"), cid = str(f, "customer_id");
  const { business, customer, admin } = await load(slug, cid);
  const channel: Channel = str(f, "channel") === "instagram" ? "instagram" : "whatsapp";
  const lines = [0, 1, 2, 3, 4].flatMap((i) => {
    const pick = readPick(str(f, `item${i}`));
    const qty = Math.max(1, Math.min(99, Math.round(Number(str(f, `qty${i}`)) || 1)));
    return pick ? [{ ...pick, quantity: qty }] : [];
  });
  const fulfillment = str(f, "fulfillment");
  const made = await createOrderFor(admin, {
    businessId: business.id, currency: business.currency, customerId: cid, lines, source: channel,
    fulfillment: fulfillment === "pickup" || fulfillment === "delivery" ? fulfillment : null, note: str(f, "note"),
  });
  if ("error" in made) to(slug, cid, `Order not made: ${made.error}`);
  const ok = made as Exclude<typeof made, { error: string }>;
  if (f.get("send") !== "on") to(slug, cid, `Order ${ok.code} made`);
  const priceLater = needsPrice(ok.items);
  const url = priceLater || !(ok.total > 0) ? null : await ensurePaymentLink(admin, ok.id);
  const text = `${orderSummary(ok.code, ok.items, ok.total, business.currency)}\n\n${url ? `Pay securely here: ${url}` : priceLater ? "We'll confirm the price and send your payment link shortly." : "We'll send your payment link shortly."}`;
  const res = await sendOn(admin, business.id, customer, channel, text, ok.id);
  to(slug, cid, res.ok ? `Order ${ok.code} made and sent${url ? " with the payment link" : ""}` : `Order ${ok.code} made, but not sent: ${res.error}`);
}
