"use server";

import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Save this browser's notification subscription for the signed-in member. */
export async function savePushSubscription(slug: string, sub: Sub) {
  const { user, business } = await requireMembership(slug);
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "That browser didn't give a valid subscription." };
  const { error } = await createAdminClient().from("push_subscriptions").upsert({
    user_id: user.id, business_id: business.id, endpoint: sub.endpoint.slice(0, 1000), p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100),
  }, { onConflict: "endpoint" });
  return error ? { error: /push_subscriptions/.test(error.message) ? "Notifications need migration 0031_push_notifications.sql first." : error.message } : { ok: true };
}

/** Turn notifications off for this browser. */
export async function removePushSubscription(slug: string, endpoint: string) {
  const { user } = await requireMembership(slug);
  await createAdminClient().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  return { ok: true };
}
