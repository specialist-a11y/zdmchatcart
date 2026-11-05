import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import ShopClient from "./ShopClient";
import { cleanHours, openState } from "@/lib/hours";
import { bestsellers } from "@/lib/shop-front";
import { displayPrice } from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string; template?: string; theme?: string }> };

/** Loaded once per request (metadata and page share it). */
const load = cache(async (slug: string) => {
  const supabase = await createClient();
  // Newest columns first; fall back if a migration hasn't run yet (0016 shop front, 0015 hours, 0013 hero text, 0012 templates, 0003 public info).
  const base = "id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number";
  const info = `${base}, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url, meta_pixel_id`;
  const hero = `${info}, site_template, hero_image_url, hero_headline, hero_subheadline, hero_text`;
  let business: any = null;
  for (const cols of [
    `${hero}, hours, closed_until, closed_note, shop_theme, special_text, special_ends_at, announcement, delivery_zones, pickup_enabled, slot_minutes`,
    `${hero}, hours, closed_until, closed_note`, hero, `${info}, site_template, hero_image_url`, info, base,
  ]) {
    const { data, error } = await supabase.from("businesses").select(cols).eq("slug", slug).maybeSingle();
    if (!error) { business = data; break; }
  }
  if (!business) return null;
  const q = (cols: string) => supabase.from("products").select(cols).eq("business_id", business!.id).eq("active", true).order("sort_order").order("created_at");
  const p1 = "id, name, description, price, image_url, stock, kind, category, price_note, variants";
  let products: any[] | null = null;
  for (const cols of [`${p1}, featured, images, ready_days, lead_days, pairs_with, badge`, `${p1}, featured`, p1, "id, name, description, price, image_url, stock"]) {
    const { data, error } = await q(cols);
    if (!error) { products = data as any[]; break; }
  }
  // Bestsellers come from real paid orders in the last 30 days (server key only; orders are private).
  let best: string[] = [];
  if (hasServiceRoleKey()) {
    const { data: items } = await createAdminClient().from("order_items").select("product_id, quantity, orders!inner(status, paid_at)")
      .eq("business_id", business.id).in("orders.status", ["paid", "ready", "fulfilled"]).gte("orders.paid_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(2000);
    best = [...bestsellers((items ?? []) as any)];
  }
  return { business, products: products ?? [], best };
});

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return {};
  const b = data.business;
  const image = b.hero_image_url || data.products.find((p: any) => p.image_url)?.image_url || b.logo_url || undefined;
  const description = b.tagline || b.description || `Order from ${b.name} on WhatsApp.`;
  const url = `${site()}/s/${b.slug}`;
  return {
    title: `${b.name} | Order on WhatsApp`,
    description,
    alternates: site() ? { canonical: url } : undefined,
    openGraph: { title: b.name, description, url: site() ? url : undefined, siteName: b.name, type: "website", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title: b.name, description, images: image ? [image] : undefined },
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ref, template, theme } = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  // ?template= and ?theme= preview another look (used by the Website page); they change nothing for real.
  const b: any = data.business;
  const open = openState(cleanHours(b.hours), { closedUntil: b.closed_until, closedNote: b.closed_note });
  // Product data for Google: name, photo, price and stock.
  const ld = {
    "@context": "https://schema.org", "@type": "Store", name: b.name, description: b.description ?? b.tagline ?? undefined, image: b.logo_url ?? undefined,
    address: b.address ? { "@type": "PostalAddress", streetAddress: b.address.replace(/\n/g, ", ") } : undefined, url: site() ? `${site()}/s/${b.slug}` : undefined,
    makesOffer: data.products.filter((p: any) => displayPrice(p).amount > 0).slice(0, 50).map((p: any) => ({
      "@type": "Offer", price: displayPrice(p).amount.toFixed(2), priceCurrency: b.currency,
      availability: p.stock === 0 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemOffered: { "@type": "Product", name: p.name, description: p.description ?? undefined, image: p.image_url ?? undefined },
    })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <ShopClient business={b} products={data.products as any} attribution={ref ?? null} previewTemplate={template ?? null} previewTheme={theme ?? null}
        openNow={open.label ? open : null} best={data.best} />
    </>
  );
}
