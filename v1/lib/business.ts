import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Business = {
  id: string;
  name: string;
  slug: string;
  whatsapp_number: string | null;
  currency: string;
  order_prefix: string;
  brand_color: string;
  tagline: string | null;
  logo_url: string | null;
};

/** Load a business by slug for the signed-in user, or 404 if they are not a member. */
export async function requireMembership(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: business } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle<Business>();
  if (!business) notFound();
  const { data: member } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", business.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) notFound();
  return { supabase, user, business, role: member.role as "owner" | "admin" | "staff" };
}
