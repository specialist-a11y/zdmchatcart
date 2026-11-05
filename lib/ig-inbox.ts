import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IgMessage } from "./autoreply";
import { getIntegration } from "./payments";
import { igProfile, sendIgMessage } from "./instagram";

type Admin = SupabaseClient;

/** Find or create the customer behind an Instagram user id. */
async function igCustomer(admin: Admin, businessId: string, igsid: string, token: string) {
  const { data: found } = await admin.from("customers").select("id").eq("business_id", businessId).eq("instagram_id", igsid).maybeSingle();
  if (found) {
    await admin.from("customers").update({ last_seen_at: new Date().toISOString() }).eq("id", found.id);
    return found.id as string;
  }
  const p = await igProfile(token, igsid);
  const row = { business_id: businessId, instagram_id: igsid, name: p.name ?? (p.username ? `@${p.username}` : null), last_seen_at: new Date().toISOString() };
  let { data: made, error } = await admin.from("customers").insert({ ...row, instagram_username: p.username ?? null }).select("id").single();
  if (error && /instagram_username/.test(error.message)) ({ data: made } = await admin.from("customers").insert(row).select("id").single());
  return (made?.id as string | undefined) ?? null;
}

/** Store an Instagram DM in the inbox. Echoes of messages we sent from the CRM are skipped. */
export async function recordIgMessage(admin: Admin, m: IgMessage) {
  const { error: dup } = await admin.from("webhook_events").insert({ provider: "instagram_dm", external_id: m.mid, payload: m });
  if (dup) return; // Meta retried
  const { data: integ } = await admin.from("integrations").select("business_id").eq("provider", "instagram").eq("status", "connected")
    .filter("config->>ig_id", "eq", m.igUserId).maybeSingle();
  if (!integ) return;
  const businessId = integ.business_id as string;
  if (m.isEcho) {
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("external_id", m.mid);
    if (count) return;
  }
  const ig = await getIntegration(admin, businessId, "instagram");
  if (!ig) return;
  const customerId = await igCustomer(admin, businessId, m.isEcho ? m.recipientId : m.senderId, ig.secret);
  await admin.from("messages").insert({
    business_id: businessId, customer_id: customerId, channel: "instagram", direction: m.isEcho ? "out" : "in",
    body: m.text.slice(0, 4000), external_id: m.mid, created_at: new Date(m.at).toISOString(),
  });
}

/** Reply to a customer's Instagram DM from the inbox, and log it. */
export async function sendIgFromBusiness(admin: Admin, businessId: string, customerId: string, body: string) {
  const ig = await getIntegration(admin, businessId, "instagram");
  if (!ig?.config.page_id) return { ok: false, error: "Instagram isn't connected" };
  const { data: c } = await admin.from("customers").select("instagram_id").eq("id", customerId).eq("business_id", businessId).maybeSingle();
  if (!c?.instagram_id) return { ok: false, error: "This customer hasn't messaged you on Instagram" };
  const res = await sendIgMessage(ig.secret, ig.config.page_id, c.instagram_id, body);
  await admin.from("messages").insert({ business_id: businessId, customer_id: customerId, channel: "instagram", direction: "out", body, external_id: res.ok ? res.id ?? null : null });
  return res;
}
