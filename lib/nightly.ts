import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cartReminderText, reminderDue, templateValues } from "./journeys";
import { tokenState, walletLow, type TokenState } from "./health";
import { debugToken } from "./meta-token";
import { getIntegration, ensurePaymentLink, sendFromBusiness } from "./payments";
import { insideServiceWindow, sendWhatsAppTemplate } from "./whatsapp";
import { notifyClient, walletBalance } from "./zdm-billing";
import { money } from "./order-text";

type Admin = SupabaseClient;
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** Send an owner alert once per key. Logged in owner_alerts so the CRM can show it too. */
export async function alertOwner(admin: Admin, businessId: string, kind: "wallet_low" | "instagram_down" | "expiring" | "other", key: string, body: string) {
  const { error } = await admin.from("owner_alerts").insert({ business_id: businessId, kind, key, body, status: "skipped" });
  if (error) return false; // already sent for this key (or the table isn't there yet)
  const res = await notifyClient(admin, businessId, body);
  await admin.from("owner_alerts").update({ status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error ?? null }).eq("business_id", businessId).eq("key", key);
  return res.ok;
}

/** The newest approved template for a purpose, if the business has one. */
export async function approvedTemplate(admin: Admin, businessId: string, purpose: string) {
  const { data } = await admin.from("message_templates").select("name, language, params")
    .eq("business_id", businessId).eq("purpose", purpose).eq("status", "approved")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data as { name: string; language: string; params: string[] } | null;
}

/** Send a business's approved template to a customer and log it. */
export async function sendTemplate(admin: Admin, businessId: string, to: string, purpose: string,
  ctx: Parameters<typeof templateValues>[1], refs: { customerId?: string | null; orderId?: string | null } = {}) {
  const t = await approvedTemplate(admin, businessId, purpose);
  if (!t) return { ok: false, error: "No approved template for this yet" };
  const wa = await getIntegration(admin, businessId, "whatsapp");
  if (!wa?.config.phone_number_id) return { ok: false, error: "WhatsApp not connected" };
  const res = await sendWhatsAppTemplate({ phoneNumberId: wa.config.phone_number_id, accessToken: wa.secret, to, template: t.name, language: t.language, params: templateValues(t.params ?? [], ctx) });
  if (res.ok) await admin.from("messages").insert({ business_id: businessId, customer_id: refs.customerId ?? null, order_id: refs.orderId ?? null, channel: "whatsapp", direction: "out", body: `[Template ${t.name}]`, external_id: res.id ?? null });
  return res;
}

/** One reminder per unpaid order, 20 to 47 hours after it was made. Free text inside the 24-hour window, else an approved template. */
async function cartReminders(admin: Admin) {
  const since = new Date(Date.now() - 47 * 3600_000).toISOString();
  const { data: orders, error } = await admin.from("orders")
    .select("id, business_id, code, total, currency, created_at, customer_id, customers(name, phone, opted_out_at), businesses(name)")
    .in("status", ["awaiting_confirmation", "awaiting_payment"]).is("reminder_sent_at", null).gt("created_at", since).limit(500);
  if (error) return { sent: 0, error: error.message };
  let sent = 0;
  for (const o of (orders ?? []) as any[]) {
    if (!reminderDue(o.created_at) || !o.customers?.phone || o.customers.opted_out_at) continue;
    const { data: last } = await admin.from("messages").select("created_at").eq("customer_id", o.customer_id).eq("direction", "in")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const url = Number(o.total) > 0 ? await ensurePaymentLink(admin, o.id) : null;
    const shop = o.businesses?.name ?? "us";
    const res = insideServiceWindow(last?.created_at)
      ? await sendFromBusiness(admin, o.business_id, o.customers.phone, cartReminderText({ code: o.code, name: o.customers.name, shop, paymentUrl: url }), { customerId: o.customer_id, orderId: o.id })
      : await sendTemplate(admin, o.business_id, o.customers.phone, "cart_reminder", { name: o.customers.name, code: o.code, total: money(o.total, o.currency), link: url, shop }, { customerId: o.customer_id, orderId: o.id });
    // Marked either way, so a business without a template isn't retried every night.
    await admin.from("orders").update({ reminder_sent_at: new Date().toISOString() }).eq("id", o.id);
    if (res.ok) sent++;
  }
  return { sent };
}

/** Check one client's WhatsApp and Instagram tokens with Meta. Used by the nightly job and Settings. */
export async function connectionHealth(admin: Admin, businessId: string): Promise<Record<"whatsapp" | "instagram", TokenState | null>> {
  const out: Record<"whatsapp" | "instagram", TokenState | null> = { whatsapp: null, instagram: null };
  for (const p of ["whatsapp", "instagram"] as const) {
    const integ = await getIntegration(admin, businessId, p);
    if (integ) out[p] = tokenState(await debugToken(integ.secret));
  }
  return out;
}

async function ownerAlerts(admin: Admin) {
  let alerts = 0;
  const month = new Date().toISOString().slice(0, 7);

  // Low ad wallet: once per top-up.
  const { data: walletBiz } = await admin.from("businesses").select("id, slug, ad_budget_monthly").eq("ad_billing", "wallet");
  for (const b of walletBiz ?? []) {
    const bal = await walletBalance(admin, b.id);
    if (!walletLow(bal, b.ad_budget_monthly)) continue;
    const { data: top } = await admin.from("ad_wallet_entries").select("id").eq("business_id", b.id).eq("kind", "topup").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (await alertOwner(admin, b.id, "wallet_low", `wallet_low:${top?.id ?? "none"}`,
      `Your ad wallet is down to BBD $${bal.toFixed(2)}. Ads pause when it can't cover a day's budget. Top up here: ${site()}/dashboard/${b.slug}/ads`)) alerts++;
  }

  // WhatsApp and Instagram connections that stopped working or expire soon. One alert of each a month.
  const { data: integs } = await admin.from("integrations").select("business_id, provider, businesses(slug)").in("provider", ["whatsapp", "instagram"]).eq("status", "connected");
  for (const i of (integs ?? []) as any[]) {
    const sec = await getIntegration(admin, i.business_id, i.provider);
    if (!sec) continue;
    const st = tokenState(await debugToken(sec.secret));
    const name = i.provider === "instagram" ? "Instagram" : "WhatsApp";
    const link = `${site()}/dashboard/${i.businesses?.slug ?? ""}/settings`;
    if (st.state === "expired") {
      const what = i.provider === "instagram" ? "Comment auto-replies and scheduled posts are paused" : "Your bot can't reply to customers";
      if (await alertOwner(admin, i.business_id, i.provider === "instagram" ? "instagram_down" : "expiring", `${i.provider}_down:${month}`,
        `${name} has disconnected from ZDM ChatCart. ${what} until it's reconnected. Fix it in Settings: ${link}`)) alerts++;
    } else if (st.state === "soon") {
      if (await alertOwner(admin, i.business_id, "expiring", `${i.provider}_expiring:${month}`,
        `Your ${name} connection ${st.label.toLowerCase()}. Reconnect it in Settings so nothing stops: ${link}`)) alerts++;
    }
  }
  return { alerts };
}

export async function runNightly(admin: Admin) {
  const { data: stages, error } = await admin.rpc("run_stage_job");
  const reminders = await cartReminders(admin);
  const owners = await ownerAlerts(admin);
  return { stages: error ? { error: error.message } : stages, reminders, ...owners };
}
