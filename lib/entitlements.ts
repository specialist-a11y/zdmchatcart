import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createAdminClient, hasServiceRoleKey } from "./supabase/admin";
import { entitlementsFrom, FEATURE_KEYS, has, type Entitlements, type FeatureKey } from "./plan-features";

/** The business's plan, status and unlocked features. Read with the server key so it can't be spoofed from the browser. */
export async function getEntitlements(businessId: string, admin: SupabaseClient = createAdminClient()): Promise<Entitlements> {
  // Without the server key, subscriptions can't be read. Don't lock every shop out: keep everything on.
  if (!hasServiceRoleKey()) return { planId: null, planName: null, status: null, features: [...FEATURE_KEYS], live: true };
  const { data, error } = await admin
    .from("subscriptions")
    .select("status, plans!subscriptions_plan_id_fkey(id, name, features, video_clips)")
    .eq("business_id", businessId)
    .maybeSingle<any>();
  if (error) {
    // Before migration 0019 there are no plan features yet: keep everything on, as it was.
    const { data: old } = await admin.from("subscriptions").select("status, plans!subscriptions_plan_id_fkey(id, name, video_clips)").eq("business_id", businessId).maybeSingle<any>();
    const e = entitlementsFrom(old?.plans ? { ...old.plans, features: [...FEATURE_KEYS] } : null, old?.status ?? null);
    return old?.plans ? e : { ...e, live: true, features: [...FEATURE_KEYS] };
  }
  return entitlementsFrom(data?.plans ?? null, data?.status ?? null);
}

export async function hasFeature(businessId: string, key: FeatureKey, admin?: SupabaseClient) {
  return has(await getEntitlements(businessId, admin), key);
}

/** For server actions: stop if the plan doesn't include the feature. */
export async function requireFeature(businessId: string, key: FeatureKey, backTo: string) {
  if (!(await hasFeature(businessId, key))) {
    redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}msg=${encodeURIComponent("That's not on your plan. See Plan and billing to upgrade.")}`);
  }
}

/** For server actions in a gated section: true when the plan opens it (staff viewing as the client always pass). */
export async function sectionAllowed(slug: string, navKey: string) {
  const { requireMembership } = await import("./business");
  const { sectionOpen } = await import("./plan-features");
  const { business, viewingAsStaff } = await requireMembership(slug);
  return viewingAsStaff || sectionOpen(await getEntitlements(business.id), navKey);
}
