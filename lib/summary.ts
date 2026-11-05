import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dailySummary } from "./journeys";
import { alertOwner } from "./nightly";

type Admin = SupabaseClient;
const PAID = ["paid", "ready", "fulfilled"];

/** Start of today in Barbados (UTC-4), as an ISO time. */
export function barbadosDayStart(now = Date.now()) {
  const local = new Date(now - 4 * 3600_000);
  return { iso: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 4 * 3600_000).toISOString(), date: local.toISOString().slice(0, 10) };
}

/** Build one business's summary for today. */
export async function summaryFor(admin: Admin, b: { id: string; name: string; slug: string; currency: string }, now = Date.now()) {
  const { iso } = barbadosDayStart(now);
  const [{ data: paid }, { count: newOrders }, { data: unpaid }, { count: ready }, { data: msgs }] = await Promise.all([
    admin.from("orders").select("total").eq("business_id", b.id).in("status", PAID).gte("paid_at", iso),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", b.id).gte("created_at", iso),
    admin.from("orders").select("total").eq("business_id", b.id).eq("status", "awaiting_payment"),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "ready"),
    admin.from("messages").select("customer_id, direction").eq("business_id", b.id).gte("created_at", new Date(now - 2 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(500),
  ]);
  const last = new Map<string, string>();
  for (const m of msgs ?? []) if (m.customer_id && !last.has(m.customer_id)) last.set(m.customer_id, m.direction);
  return dailySummary({
    shop: b.name, currency: b.currency,
    sales: (paid ?? []).reduce((s, o) => s + Number(o.total), 0), paidOrders: paid?.length ?? 0, newOrders: newOrders ?? 0,
    unpaid: unpaid?.length ?? 0, unpaidTotal: (unpaid ?? []).reduce((s, o) => s + Number(o.total), 0),
    ready: ready ?? 0, waiting: [...last.values()].filter((d) => d === "in").length,
    link: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/dashboard/${b.slug}`,
  });
}

/** 8pm run: every business with the summary on and an owner phone. Once per day each. */
export async function runSummaries(admin: Admin, now = Date.now()) {
  const { date } = barbadosDayStart(now);
  const { data: list, error } = await admin.from("businesses").select("id, name, slug, currency, contact_phone").eq("daily_summary", true).not("contact_phone", "is", null);
  if (error) return { sent: 0, error: error.message };
  let sent = 0;
  for (const b of list ?? []) {
    const { count } = await admin.from("subscriptions").select("business_id", { count: "exact", head: true }).eq("business_id", b.id).in("status", ["trial", "active", "past_due"]);
    if (!count) continue;
    if (await alertOwner(admin, b.id, "other", `summary:${date}`, await summaryFor(admin, b, now))) sent++;
  }
  return { sent };
}
