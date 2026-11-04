"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { changePlan, logEvent } from "@/lib/zdm-billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Client").split("@")[0];

async function requireBillingAdmin(slug: string) {
  const ctx = await requireMembership(slug);
  if (ctx.role !== "owner" && ctx.role !== "admin") redirect(`/dashboard/${slug}/billing?msg=${encodeURIComponent("Only the account owner or an admin can change billing")}`);
  return ctx;
}

/** Upgrades start now (prorated Fygaro link); downgrades wait for renewal. Choosing the current plan cancels a scheduled change. */
export async function requestPlanChange(f: FormData) {
  const slug = str(f, "slug");
  const { user, business } = await requireBillingAdmin(slug);
  const path = `/dashboard/${slug}/billing`;
  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("id, active").eq("id", str(f, "plan")).maybeSingle();
  if (!plan?.active) redirect(`${path}?msg=${encodeURIComponent("Pick a plan")}`);
  let note: string;
  try {
    const { preview, invoice } = await changePlan(admin, { businessId: business.id, toPlanId: plan!.id, actor: { id: user.id, name: who(user) }, byClient: true, reason: "Changed by client" });
    note = preview.direction === "same" ? "You're staying on your current plan." :
      preview.timing === "renewal" ? `Done. Your new plan starts on ${preview.effectiveOn}. You keep everything you have until then.` :
      invoice?.payment_url ? `Upgraded. Your new features are on now. Pay the BBD $${preview.chargeNow.toFixed(2)} difference below.` : "Upgraded. ZDMINC will send the invoice for the difference.";
  } catch (e: any) {
    note = e?.message ?? "Couldn't change the plan";
  }
  redirect(`${path}?msg=${encodeURIComponent(note)}`);
}

export async function saveBillingDetails(f: FormData) {
  const slug = str(f, "slug");
  const { user, business } = await requireBillingAdmin(slug);
  const email = str(f, "billing_email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`/dashboard/${slug}/billing?msg=${encodeURIComponent("That email doesn't look right")}`);
  const admin = createAdminClient();
  await admin.from("businesses").update({
    billing_name: str(f, "billing_name") || null, billing_email: email || null, billing_address: str(f, "billing_address") || null,
  }).eq("id", business.id);
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "contact", "Billing details updated by client");
  redirect(`/dashboard/${slug}/billing?msg=${encodeURIComponent("Billing details saved")}`);
}
