import "server-only";
import { hasFeature } from "./entitlements";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dailySummary } from "./journeys";
import { alertOwner } from "./nightly";
import { summaryWindow } from "./summary-window";

type Admin = SupabaseClient;
const PAID = ["paid", "ready", "fulfilled"];

/** Build one business's summary for today. */
export async function summaryFor(admin: Admin, b: { id: string; name: string; slug: string; currency: string }, now = Date.now()) {
  const w = summaryWindow(now);
  const [{ data: paid }, { count: newOrders }, { data: unpaid }, { count: ready }, { data: msgs }] = await Promise.all([
    admin.from("orders").select("total").eq("business_id", b.id).in("status", PAID).gte("paid_at", w.start).lt("paid_at", w.end),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", b.id).gte("created_at", w.start).lt("created_at", w.end),
    admin.from("orders").select("total").eq("business_id", b.id).eq("status", "awaiting_payment"),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("status", "ready"),
    admin.from("messages").select("customer_id, direction").eq("business_id", b.id).gte("created_at", new Date(now - 2 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(500),
  ]);
  const last = new Map<string, string>();
  for (const m of msgs ?? []) if (m.customer_id && !last.has(m.customer_id)) last.set(m.customer_id, m.direction);
  return dailySummary({
    shop: b.name, currency: b.currency, day: w.label,
    sales: (paid ?? []).reduce((s, o) => s + Number(o.total), 0), paidOrders: paid?.length ?? 0, newOrders: newOrders ?? 0,
    unpaid: unpaid?.length ?? 0, unpaidTotal: (unpaid ?? []).reduce((s, o) => s + Number(o.total), 0),
    ready: ready ?? 0, waiting: [...last.values()].filter((d) => d === "in").length,
    link: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/dashboard/${b.slug}`,
  });
}

/** Daily run (with the posts cron, 8am Barbados): every business with the summary on and an owner phone. Once per day each. */
export async function runSummaries(admin: Admin, now = Date.now()) {
  const { date } = summaryWindow(now);
  const { data: list, error } = await admin.from("businesses").select("id, name, slug, currency, contact_phone").eq("daily_summary", true).not("contact_phone", "is", null);
  if (error) return { sent: 0, error: error.message };
  let sent = 0;
  for (const b of list ?? []) {
    const { count } = await admin.from("subscriptions").select("business_id", { count: "exact", head: true }).eq("business_id", b.id).in("status", ["trial", "active", "past_due"]);
    if (!count) continue;
    // The daily summary comes with Growth and up.
    if (!(await hasFeature(b.id, "daily_summary", admin))) continue;
    if (await alertOwner(admin, b.id, "other", `summary:${date}`, await summaryFor(admin, b, now))) sent++;
  }
  return { sent };
}
