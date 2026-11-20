import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/entitlements";
import { pickupOptions } from "@/lib/rental";
import { CORS, preflight } from "@/lib/cors";

export const OPTIONS = preflight;
export const revalidate = 60;

/**
 * Public: a shop's live catalog and booking settings, for the business's own website (e.g. a separate Starlight site).
 * Prices, packages and rules come from ChatCart, so the website always matches checkout and WhatsApp.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses")
    .select("id, name, slug, currency, whatsapp_number, logo_url, brand_color, public_email, instagram, opening_hours, delivery_info, bank_transfer_enabled, rental_agreement_url, rental_pickup_times, rental_lead_days")
    .eq("slug", slug).maybeSingle<any>();
  if (!b) return NextResponse.json({ error: "Shop not found" }, { status: 404, headers: CORS });
  const [{ data: eve }, { data: fy }, ent] = await Promise.all([
    admin.from("businesses").select("rental_eve_pickup, rental_deposit_mode").eq("id", b.id).maybeSingle<any>().then((r) => r, () => ({ data: null })),
    admin.from("integrations").select("status, config").eq("business_id", b.id).eq("provider", "fygaro").maybeSingle<any>(),
    getEntitlements(b.id, admin).catch(() => null),
  ]);
  const cols = "id, name, description, price, image_url, images, stock, category, featured, badge, slug, rental, rental_unit, deposit, min_days, sort_order";
  let { data: products, error }: { data: any[] | null; error: any } = await admin.from("products").select(`${cols}, includes`).eq("business_id", b.id).eq("active", true).order("sort_order").order("created_at");
  if (error) ({ data: products } = await admin.from("products").select(cols).eq("business_id", b.id).eq("active", true).order("sort_order").order("created_at"));

  return NextResponse.json({
    shop: {
      name: b.name, slug: b.slug, currency: b.currency, whatsapp: b.whatsapp_number, logo: b.logo_url, color: b.brand_color,
      email: b.public_email, instagram: b.instagram, hours: b.opening_hours, delivery: b.delivery_info,
      takingOrders: !!b.whatsapp_number && (ent ? ent.live : true),
      pay: { card: fy?.status === "connected" && !!fy?.config?.button_url, transfer: !!b.bank_transfer_enabled },
      rental: {
        agreementUrl: b.rental_agreement_url, pickupTimes: pickupOptions(b.rental_pickup_times),
        leadDays: b.rental_lead_days ?? 0, evePickup: !!eve?.rental_eve_pickup,
        depositMode: eve?.rental_deposit_mode === "booking" ? "booking" : "refundable",
      },
    },
    products: (products ?? []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description, price: Number(p.price), image: p.image_url, images: p.images ?? [],
      category: p.category, featured: !!p.featured, badge: p.badge, rental: !!p.rental, unit: p.rental_unit ?? "day",
      deposit: Number(p.deposit ?? 0), minDays: p.min_days ?? 1, stock: p.stock,
      includes: Array.isArray(p.includes) ? p.includes : [],
    })),
  }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", ...CORS } });
}
