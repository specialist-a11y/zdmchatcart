import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readyMessage } from "./journeys";
import { sendFromBusiness } from "./payments";
import { insideServiceWindow } from "./whatsapp";
import { sendTemplate } from "./nightly";
import { money } from "./order-text";

type Admin = SupabaseClient;

/** When did this customer last write to the business? Free text is only allowed within 24 hours of it. */
export async function lastInboundAt(admin: Admin, customerId: string | null | undefined) {
  if (!customerId) return null;
  const { data } = await admin.from("messages").select("created_at").eq("customer_id", customerId).eq("direction", "in")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

/** "Your order is ready" on WhatsApp. Free text inside the 24-hour window, else the approved Order ready template. */
export async function sendReadyMessage(admin: Admin, orderId: string) {
  const { data: o } = await admin.from("orders")
    .select("id, business_id, code, total, currency, fulfillment, customer_id, customers(name, phone), businesses(name, address)")
    .eq("id", orderId).maybeSingle<any>();
  if (!o) return { ok: false, error: "Order not found" };
  const phone = o.customers?.phone;
  if (!phone) return { ok: false, error: "No customer phone on this order" };
  const shop = o.businesses?.name ?? "us";
  const res = insideServiceWindow(await lastInboundAt(admin, o.customer_id))
    ? await sendFromBusiness(admin, o.business_id, phone, readyMessage({ code: o.code, name: o.customers?.name, fulfillment: o.fulfillment, shop, address: o.businesses?.address }), { customerId: o.customer_id, orderId: o.id })
    : await sendTemplate(admin, o.business_id, phone, "order_ready", { name: o.customers?.name, code: o.code, total: money(o.total, o.currency), shop }, { customerId: o.customer_id, orderId: o.id });
  if (res.ok) await admin.from("orders").update({ ready_notified_at: new Date().toISOString() }).eq("id", o.id);
  else if (/template/i.test(res.error ?? "")) return { ok: false, error: "More than 24 hours since they last wrote. Add an approved Order ready template on the WhatsApp page." };
  return res;
}
