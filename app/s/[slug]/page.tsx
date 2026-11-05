import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ShopClient from "./ShopClient";
import { cleanHours, openState } from "@/lib/hours";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string; template?: string }> };

async function load(slug: string) {
  const supabase = await createClient();
  // Newest columns first; fall back if a migration hasn't run yet (0013 hero text, 0012 templates, 0003 public info).
  const base = "id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number";
  const info = `${base}, description, address, opening_hours, delivery_info, public_email, instagram, facebook, website_url, meta_pixel_id`;
  let business: any = null;
  for (const cols of [`${info}, site_template, hero_image_url, hero_headline, hero_subheadline, hero_text, hours, closed_until, closed_note`, `${info}, site_template, hero_image_url, hero_headline, hero_subheadline, hero_text`, `${info}, site_template, hero_image_url`, info, base]) {
    const { data, error } = await supabase.from("businesses").select(cols).eq("slug", slug).maybeSingle();
    if (!error) { business = data; break; }
  }
  if (!business) return null;
  const q = (cols: string) => supabase.from("products").select(cols).eq("business_id", business!.id).eq("active", true).order("sort_order").order("created_at");
  let { data: products, error: pErr } = await q("id, name, description, price, image_url, stock, kind, category, price_note, variants, featured");
  if (pErr) ({ data: products, error: pErr } = await q("id, name, description, price, image_url, stock, kind, category, price_note, variants"));
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
  const b: any = data.business;
  const open = openState(cleanHours(b.hours), { closedUntil: b.closed_until, closedNote: b.closed_note });
  return <ShopClient business={b} products={data.products as any} attribution={ref ?? null} previewTemplate={template ?? null} openNow={open.label ? open : null} />;
}
