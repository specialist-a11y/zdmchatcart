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
  description: string | null;
  address: string | null;
  opening_hours: string | null;
  delivery_info: string | null;
  public_email: string | null;
  instagram: string | null;
  facebook: string | null;
  website_url: string | null;
};

export const BASE_BUSINESS_COLUMNS =
  "id, name, slug, whatsapp_number, currency, order_prefix, brand_color, logo_url, tagline";

/** Columns anyone may read (see 0003_client_account.sql). Private contact and billing fields are not here. */
export const PUBLIC_BUSINESS_COLUMNS =
  "id, name, slug, whatsapp_number, currency, order_prefix, brand_color, logo_url, tagline, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url";

/** Load a business by slug for the signed-in user, or 404 if they are not a member. */
export async function requireMembership(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let { data: business, error } = await supabase.from("businesses").select(PUBLIC_BUSINESS_COLUMNS).eq("slug", slug).maybeSingle<Business>();
  if (error) {
    const fallback = await supabase.from("businesses").select(BASE_BUSINESS_COLUMNS).eq("slug", slug).maybeSingle<Business>();
    business = fallback.data;
  }
  if (!business) notFound();
  const { data: member } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", business.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (member) return { supabase, user, business, role: member.role as "owner" | "admin" | "staff", viewingAsStaff: false };
  // ZDMINC staff can open any client's CRM ("View as client"). RLS gives them the same access.
  const { data: staff } = await supabase.from("platform_staff").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!staff) notFound();
  return { supabase, user, business, role: "admin" as const, viewingAsStaff: true };
}
