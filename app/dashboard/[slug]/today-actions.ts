"use server";

import { revalidatePath } from "next/cache";
import { back, str } from "@/lib/crm-actions";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePaymentLink, sendFromBusiness } from "@/lib/payments";
import { insideServiceWindow } from "@/lib/whatsapp";
import { lastInboundAt } from "@/lib/followups";
import { sendTemplate } from "@/lib/nightly";
import { money, needsPrice, orderSummary } from "@/lib/order-text";

/** "Send link" on a Today item: the payment link on WhatsApp, or the cart reminder template after 24 hours. */
export async function nudgeOrder(f: FormData) {
  const slug = str(f, "slug");
  const { business } = await requireMembership(slug);
  const home = `/dashboard/${slug}`;
  const admin = createAdminClient();
  const { data: o } = await admin.from("orders")
    .select("id, code, total, currency, customer_id, customers(name, phone, opted_out_at), order_items(name, unit_price, quantity)")
    .eq("business_id", business.id).eq("code", str(f, "code")).maybeSingle<any>();
  if (!o) back(home, "Order not found");
  if (!o.customers?.phone) back(home, `${o.code} has no customer phone yet`);
  if (needsPrice(o.order_items ?? [])) back(`${home}/orders/${o.code}`, "Set the prices first, then send the link");
  const url = await ensurePaymentLink(admin, o.id);
  if (!url) back(home, "Connect Fygaro in Settings first");
  const res = insideServiceWindow(await lastInboundAt(admin, o.customer_id))
    ? await sendFromBusiness(admin, business.id, o.customers.phone, `${orderSummary(o.code, o.order_items, o.total, o.currency)}\n\nPay securely here: ${url}`, { customerId: o.customer_id, orderId: o.id })
    : await sendTemplate(admin, business.id, o.customers.phone, "cart_reminder", { name: o.customers.name, code: o.code, total: money(o.total, o.currency), link: url, shop: business.name }, { customerId: o.customer_id, orderId: o.id });
  if (res.ok) await admin.from("orders").update({ reminder_sent_at: new Date().toISOString() }).eq("id", o.id);
  revalidatePath(home);
  back(home, res.ok ? `Payment link sent for ${o.code}` : /template/i.test(res.error ?? "")
    ? `${o.code}: more than 24 hours since they wrote. Add an approved Cart reminder template on the WhatsApp page.`
    : `Not sent: ${res.error}`);
}
