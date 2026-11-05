import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ShopClient from "./ShopClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string; template?: string }> };

async function load(slug: string) {
  const supabase = await createClient();
  let { data: business, error } = await supabase
    .from("businesses")
    .select("id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url, meta_pixel_id, site_template, hero_image_url")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    // Before migration 0012: no template columns yet.
    ({ data: business, error } = await supabase
      .from("businesses")
      .select("id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url, meta_pixel_id")
      .eq("slug", slug)
      .maybeSingle() as any);
  }
  if (error) {
    const fallback = await supabase
      .from("businesses")
      .select("id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number")
      .eq("slug", slug)
      .maybeSingle();
    business = fallback.data as any;
  }
  if (!business) return null;
  const q = (cols: string) => supabase.from("products").select(cols).eq("business_id", business!.id).eq("active", true).order("sort_order").order("created_at");
  let { data: products, error: pErr } = await q("id, name, description, price, image_url, stock, kind, category, price_note, variants");
  if (pErr) products = (await q("id, name, description, price, image_url, stock")).data;
  return { business, products: products ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  return data ? { title: `${data.business.name} | Order on WhatsApp`, description: data.business.tagline ?? undefined } : {};
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ref, template } = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  // ?template= previews another look (used by the template picker); it changes nothing for real.
  return <ShopClient business={data.business as any} products={data.products as any} attribution={ref ?? null} previewTemplate={template ?? null} />;
}
