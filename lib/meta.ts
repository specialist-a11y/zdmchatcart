import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhone } from "./audience";

/**
 * Meta Conversions API: tell Meta a WhatsApp/Fygaro order was paid, so ads can optimise for
 * purchases and retargeting can leave out people who already bought. Needs the business's
 * Pixel ID (businesses.meta_pixel_id) and a Conversions API token (integration_secrets provider "meta").
 */
type Db = SupabaseClient;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function sendPurchaseEvent(admin: Db, orderId: string) {
  const { data: o } = await admin.from("orders")
    .select("id, business_id, total, currency, paid_at, meta_fbc, attribution, customers(phone, email), businesses(slug, meta_pixel_id)")
    .eq("id", orderId).maybeSingle<any>();
  const pixel = o?.businesses?.meta_pixel_id;
  if (!o || !pixel) return { ok: false, skipped: "no pixel" };
  const { data: sec } = await admin.from("integration_secrets").select("secret").eq("business_id", o.business_id).eq("provider", "meta").maybeSingle();
  if (!sec?.secret) return { ok: false, skipped: "no conversions API token" };
  const phone = normalizePhone(o.customers?.phone);
  const email = normalizeEmail(o.customers?.email);
  const user_data: Record<string, unknown> = { external_id: [sha256(o.id)] };
  if (phone) user_data.ph = [sha256(phone)];
  if (email) user_data.em = [sha256(email)];
  if (o.meta_fbc) user_data.fbc = o.meta_fbc;
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.parse(o.paid_at ?? new Date().toISOString()) / 1000),
      event_id: `order-${o.id}`, // same id the browser would use, so Meta de-duplicates
      action_source: "website",
      event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${o.businesses.slug}`,
      user_data,
      custom_data: { value: Number(o.total), currency: o.currency, order_id: o.id, content_category: o.attribution ?? undefined },
    }],
  };
  const version = process.env.META_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(sec.secret)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, json: async () => ({ error: { message: String(e) } }) }) as any);
  const json: any = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: json?.error?.message ?? "Meta rejected the event" };
}

/** Consented past customers as Meta's hashed customer-list CSV (phone, email). */
export async function consentedCustomerCsv(admin: Db, businessId: string) {
  const { data } = await admin.from("customers").select("phone, email").eq("business_id", businessId).eq("marketing_opt_in", true);
  const rows = (data ?? []).map((c) => {
    const p = normalizePhone(c.phone), e = normalizeEmail(c.email);
    return [p ? sha256(p) : "", e ? sha256(e) : ""];
  }).filter(([p, e]) => p || e);
  return { count: rows.length, csv: ["phone,email", ...rows.map((r) => r.join(","))].join("\n") + "\n" };
}
