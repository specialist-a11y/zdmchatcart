import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adResults, round2 } from "./billing";

/**
 * Ad results come from two places: spend that ZDMINC logs from Meta Ads Manager (ad_spend),
 * and orders whose attribution matches the campaign's code (set when a shopper lands on /s/<slug>?ref=A-3).
 * Only orders that were paid count as sales.
 */
type Db = SupabaseClient;
export const PAID = ["paid", "ready", "fulfilled"];

export type CampaignRow = {
  id: string; business_id: string; code: string; name: string; kind: string; status: string; daily_budget: number;
  starts_on: string | null; ends_on: string | null; clip_id: string | null; caption: string | null; audience: string | null;
  client_note: string | null; created_at: string;
};
export type CampaignStats = CampaignRow & { spend: number; spendMonth: number; orders: number; sales: number; ordersMonth: number; salesMonth: number; roas: number | null; costPerOrder: number | null };

export async function campaignStats(db: Db, opts: { businessId?: string; monthStart: string }): Promise<CampaignStats[]> {
  let cq = db.from("ad_campaigns").select("*").order("created_at", { ascending: false });
  if (opts.businessId) cq = cq.eq("business_id", opts.businessId);
  const { data: campaigns } = await cq;
  if (!campaigns?.length) return [];
  const ids = campaigns.map((c) => c.id);
  const [{ data: spend }, { data: orders }] = await Promise.all([
    db.from("ad_spend").select("campaign_id, day, amount").in("campaign_id", ids),
    db.from("orders").select("business_id, attribution, total, status, created_at").in("attribution", [...new Set(campaigns.map((c) => c.code))]).in("status", PAID),
  ]);
  return campaigns.map((c: any) => {
    const sp = (spend ?? []).filter((s) => s.campaign_id === c.id);
    const os = (orders ?? []).filter((o) => o.business_id === c.business_id && o.attribution === c.code);
    const osMonth = os.filter((o) => o.created_at >= opts.monthStart);
    const total = round2(sp.reduce((n, s) => n + Number(s.amount), 0));
    const sales = round2(os.reduce((n, o) => n + Number(o.total), 0));
    return {
      ...c, daily_budget: Number(c.daily_budget),
      spend: total, spendMonth: round2(sp.filter((s) => s.day >= opts.monthStart.slice(0, 10)).reduce((n, s) => n + Number(s.amount), 0)),
      orders: os.length, sales, ordersMonth: osMonth.length, salesMonth: round2(osMonth.reduce((n, o) => n + Number(o.total), 0)),
      ...adResults(total, sales, os.length),
    };
  });
}

export function totals(rows: CampaignStats[]) {
  const spend = round2(rows.reduce((n, r) => n + r.spendMonth, 0));
  const sales = round2(rows.reduce((n, r) => n + r.salesMonth, 0));
  const orders = rows.reduce((n, r) => n + r.ordersMonth, 0);
  return { spend, sales, orders, ...adResults(spend, sales, orders) };
}

export const KIND: Record<string, string> = { boost: "Boost a video", retargeting: "Cart retargeting", launch: "New launch", other: "Other" };
export const STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "resolved"], needs_approval: ["Needs your OK", "sent"], changes_requested: ["Changes asked", "high"],
  approved: ["Approved", "paid"], running: ["Running", "paid"], paused: ["Paused", "resolved"], ended: ["Ended", "resolved"],
};
