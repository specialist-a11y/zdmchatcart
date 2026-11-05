"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/zdm-billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ROLES = ["admin", "staff"] as const;
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

async function guard(slug: string) {
  const ctx = await requireMembership(slug);
  const back = (m: string): never => redirect(`/dashboard/${slug}/settings?msg=${encodeURIComponent(m)}#team`);
  if (ctx.role !== "owner" && ctx.role !== "admin") back("Only the owner or an admin can manage the team");
  if (!hasServiceRoleKey()) back("Team invites need the server key set up. Ask ZDMINC.");
  return { ...ctx, admin: createAdminClient(), back };
}
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Someone").split("@")[0];

/** Invite someone by email. Existing ZDM ChatCart logins are added straight away. Seats come from the plan. */
export async function inviteMember(f: FormData) {
  const slug = str(f, "slug");
  const { admin, business, user, role: myRole, back } = await guard(slug);
  const email = str(f, "email").toLowerCase();
  const role = ROLES.includes(str(f, "role") as any) ? str(f, "role") : "staff";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back("That email doesn't look right");
  if (role === "admin" && myRole !== "owner") back("Only the owner can add admins");
  const [{ count }, { data: sub }] = await Promise.all([
    admin.from("business_members").select("user_id", { count: "exact", head: true }).eq("business_id", business.id),
    admin.from("subscriptions").select("plans!subscriptions_plan_id_fkey(seats)").eq("business_id", business.id).maybeSingle<any>(),
  ]);
  const seats = sub?.plans?.seats ?? 2;
  if ((count ?? 0) >= seats) back(`All ${seats} seats on your plan are used. Remove someone, or upgrade in Plan and billing.`);

  let userId: string | null = null;
  const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site()}/auth/callback?next=/dashboard/${slug}` });
  if (invite.data.user) userId = invite.data.user.id;
  else {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  if (!userId) back(`Couldn't invite ${email}: ${invite.error?.message ?? "unknown error"}`);
  const { error } = await admin.from("business_members").insert({ business_id: business.id, user_id: userId, role });
  if (error?.code === "23505") back(`${email} is already on your team`);
  if (error) back(error.message);
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "team", `Added ${email} as ${role}`);
  revalidatePath(`/dashboard/${slug}/settings`);
  back(invite.data.user ? `Invite sent to ${email}. They'll get an email to set up their login.` : `${email} already had a login, so they're added. They'll see ${business.name} when they sign in.`);
}

export async function changeRole(f: FormData) {
  const slug = str(f, "slug");
  const { admin, business, user, role: myRole, back } = await guard(slug);
  const target = str(f, "user_id");
  const role = ROLES.includes(str(f, "role") as any) ? str(f, "role") : "staff";
  if (myRole !== "owner") back("Only the owner can change roles");
  if (target === user.id) back("You can't change your own role");
  const { data: m } = await admin.from("business_members").select("role").eq("business_id", business.id).eq("user_id", target).maybeSingle();
  if (!m || m.role === "owner") back("The owner's role can't be changed here. Ask ZDMINC to transfer ownership.");
  await admin.from("business_members").update({ role }).eq("business_id", business.id).eq("user_id", target);
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "team", `Role changed to ${role}`);
  revalidatePath(`/dashboard/${slug}/settings`);
  back("Role updated");
}

export async function removeMember(f: FormData) {
  const slug = str(f, "slug");
  const { admin, business, user, role: myRole, back } = await guard(slug);
  const target = str(f, "user_id");
  if (target === user.id) back("You can't remove yourself");
  const { data: m } = await admin.from("business_members").select("role").eq("business_id", business.id).eq("user_id", target).maybeSingle();
  if (!m) back("Not on the team");
  if (m!.role === "owner") back("The owner can't be removed");
  if (m!.role === "admin" && myRole !== "owner") back("Only the owner can remove an admin");
  await admin.from("business_members").delete().eq("business_id", business.id).eq("user_id", target);
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "team", "Removed a team member");
  revalidatePath(`/dashboard/${slug}/settings`);
  back("Removed. They can't open this account any more.");
}
