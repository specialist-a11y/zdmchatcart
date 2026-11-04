import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ShopClient from "./ShopClient";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> };

async function load(slug: string) {
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, slug, tagline, logo_url, brand_color, currency, whatsapp_number")
    .eq("slug", slug)
    .maybeSingle();
  if (!business) return null;
  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, price, image_url, stock")
    .eq("business_id", business.id)
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  return { business, products: products ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  return data ? { title: `${data.business.name} | Order on WhatsApp`, description: data.business.tagline ?? undefined } : {};
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const data = await load(slug);
  if (!data) notFound();
  return <ShopClient business={data.business} products={data.products} attribution={ref ?? null} />;
}
