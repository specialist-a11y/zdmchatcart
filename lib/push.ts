import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/** Browser notifications are on when the VAPID keys are set (see .env.example). */
export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return ready;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "https://zdmchatcart.vercel.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return (ready = true);
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Notify every browser where a member of this business turned notifications on. Dead subscriptions are removed. */
export async function pushToBusiness(admin: SupabaseClient, businessId: string, msg: PushMessage) {
  if (!setup()) return { sent: 0 };
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("business_id", businessId);
  if (error || !subs?.length) return { sent: 0 };
  const payload = JSON.stringify({ ...msg, body: msg.body.length > 160 ? `${msg.body.slice(0, 157)}...` : msg.body });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }));
  return { sent };
}
