import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { bestsellers } from "@/lib/shop-front";

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/** Shop, products, bestsellers and live domain, loaded once per request (metadata and page share it). */
export const loadShop = cache(async (slug: string) => {
  const supabase = await createClient();
  // Newest columns first; fall back if a migration hasn't run yet (0021 rentals, 0018 bank transfer, 0017 SEO, 0016 shop front, 0015 hours, 0013 hero text, 0012 templates, 0003 public info).
  const base = "id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number";
  const info = `${base}, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url, meta_pixel_id`;
  const hero = `${info}, site_template, hero_image_url, hero_headline, hero_subheadline, hero_text`;
  const front = `${hero}, hours, closed_until, closed_note, shop_theme, special_text, special_ends_at, announcement, delivery_zones, pickup_enabled, slot_minutes`;
  let business: any = null;
  const seo = `${front}, seo_title, seo_description, google_verification`;
  const pay = `${seo}, bank_transfer_enabled`;
  for (const cols of [`${pay}, rental_agreement_url, rental_pickup_times, rental_lead_days`, pay, seo, front, `${hero}, hours, closed_until, closed_note`, hero, `${info}, site_template, hero_image_url`, info, base]) {
    const { data, error } = await supabase.from("businesses").select(cols).eq("slug", slug).maybeSingle();
    if (!error) { business = data; break; }
  }
  if (!business) return null;
  const q = (cols: string) => supabase.from("products").select(cols).eq("business_id", business!.id).eq("active", true).order("sort_order").order("created_at");
  const p1 = "id, name, description, price, image_url, stock, kind, category, price_note, variants";
  let products: any[] | null = null;
  for (const cols of [`${p1}, featured, images, ready_days, lead_days, pairs_with, badge, slug, rental, rental_unit, deposit, min_days`, `${p1}, featured, images, ready_days, lead_days, pairs_with, badge, slug`, `${p1}, featured, images, ready_days, lead_days, pairs_with, badge`, `${p1}, featured`, p1, "id, name, description, price, image_url, stock"]) {
    const { data, error } = await q(cols);
    if (!error) { products = data as any[]; break; }
  }
  const [{ data: domain }, best] = await Promise.all([
    supabase.rpc("domain_for_shop", { p_slug: slug }).then((r) => r, () => ({ data: null })),
    bestFor(business.id),
  ]);
  const live = typeof domain === "string" && domain ? domain : null;
  // Plan features the shop page needs (read with the server key).
  const { getEntitlements } = await import("@/lib/entitlements");
  const { has } = await import("@/lib/plan-features");
  const ent = await getEntitlements(business.id).catch(() => null);
  const features = { cartRecovery: !ent || has(ent, "cart_recovery") };
  return { business, products: products ?? [], best, domain: live, urls: shopUrls(slug, live), features };
});

/** Bestsellers come from real paid orders in the last 30 days (server key only; orders are private). */
async function bestFor(businessId: string) {
  if (!hasServiceRoleKey()) return [] as string[];
  const { data: items } = await createAdminClient().from("order_items").select("product_id, quantity, orders!inner(status, paid_at)")
    .eq("business_id", businessId).in("orders.status", ["paid", "ready", "fulfilled"]).gte("orders.paid_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(2000);
  return [...bestsellers((items ?? []) as any)];
}

/** Canonical addresses: the shop's own domain when it has one, otherwise the ZDM ChatCart link. */
export function shopUrls(slug: string, domain: string | null) {
  const home = domain ? `https://${domain}` : `${site()}/s/${slug}`;
  return {
    home,
    product: (p: { id: string; slug?: string | null }) => `${home}/p/${p.slug || p.id}`,
    /** Path used in the browser for this request (custom domains have no /s/slug prefix). */
    path: (onCustomDomain: boolean) => (onCustomDomain ? "" : `/s/${slug}`),
  };
}

/** True when this request came in on the shop's own domain. */
export function onOwnDomain(host: string | null, domain: string | null) {
  return !!host && !!domain && host.toLowerCase().replace(/:\d+$/, "") === domain;
}
