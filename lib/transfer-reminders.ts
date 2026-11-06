import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePaymentLink, sendFromBusiness } from "./payments";
import { insideServiceWindow } from "./whatsapp";
import { money } from "./order-text";

/**
 * Customers who chose bank transfer but haven't sent proof after 3 hours get one reminder,
 * with the card link as the easy alternative. Free text, so only inside WhatsApp's 24-hour window.
 * Runs from both daily crons (Vercel Hobby has no hourly crons); transfer_reminded_at stops repeats.
 */
export async function transferReminders(admin: SupabaseClient, now = Date.now()) {
  const { data: due, error } = await admin.from("orders")
    .select("id, business_id, code, total, currency, customer_id, customers(phone)")
    .eq("payment_method", "transfer").eq("status", "awaiting_payment").is("transfer_reminded_at", null)
    .lt("created_at", new Date(now - 3 * 3600e3).toISOString())
    .gt("created_at", new Date(now - 47 * 3600e3).toISOString())
    .limit(200);
  if (error) return { sent: 0, error: error.message }; // before migration 0018
  let sent = 0;
  for (const o of (due ?? []) as any[]) {
    await admin.from("orders").update({ transfer_reminded_at: new Date().toISOString() }).eq("id", o.id);
    if (!o.customers?.phone || !o.customer_id) continue;
    const { data: last } = await admin.from("messages").select("created_at").eq("customer_id", o.customer_id).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!insideServiceWindow(last?.created_at)) continue;
    const url = await ensurePaymentLink(admin, o.id).catch(() => null);
    const res = await sendFromBusiness(admin, o.business_id, o.customers.phone,
      `Just checking on order ${o.code} (${money(o.total, o.currency)}). If you've made the bank transfer, reply with the screenshot or reference number.${url ? `\nOr pay by card in a minute here: ${url}` : ""}`,
      { customerId: o.customer_id, orderId: o.id }).catch(() => null);
    if (res && (res as any).ok !== false) sent++;
  }
  return { sent, checked: due?.length ?? 0 };
}
