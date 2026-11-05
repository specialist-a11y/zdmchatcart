import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceCart, waLink } from "@/lib/order-text";
import { upsertCustomer } from "@/lib/customers";
import { template } from "@/lib/catalog";
import { cleanHours } from "@/lib/hours";
import { readZones, sharedReadyDays, slotOptions } from "@/lib/shop-front";

const Body = z.object({
  slug: z.string().min(2).max(41),
  items: z.array(z.object({ productId: z.string().uuid(), variantId: z.string().regex(/^[a-z0-9]{2,12}$/i).optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  optIn: z.boolean().optional(),
  marketing: z.boolean().optional(),
  attribution: z.string().trim().max(60).optional(),
  fbc: z.string().trim().regex(/^fb\.1\.\d+\.[\w-]{10,250}$/).optional(),
  fulfillment: z.enum(["pickup", "delivery"]).optional(),
  zoneId: z.string().regex(/^[a-z0-9]{1,12}$/i).optional(),
  slot: z.string().datetime().optional(),
  address: z.string().trim().max(300).optional(),
});

/** Public: turn a website cart into an order with a code, then hand back a WhatsApp link. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();

  // New columns fall back gracefully until migration 0012 has run.
  let { data: business, error: bizErr } = await admin
    .from("businesses")
    .select("id, currency, whatsapp_number, site_template, hours, delivery_zones, slot_minutes")
    .eq("slug", body.slug)
    .maybeSingle<any>();
  if (bizErr) ({ data: business, error: bizErr } = await admin.from("businesses").select("id, currency, whatsapp_number, site_template").eq("slug", body.slug).maybeSingle<any>());
  if (bizErr) business = (await admin.from("businesses").select("id, currency, whatsapp_number").eq("slug", body.slug).maybeSingle()).data as typeof business;
  if (!business?.whatsapp_number) return NextResponse.json({ error: "This shop is not taking orders yet." }, { status: 404 });

  const ids = body.items.map((i) => i.productId);
  let { data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants, ready_days, lead_days").eq("business_id", business.id).in("id", ids);
  if (catErr) ({ data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants").eq("business_id", business.id).in("id", ids) as any);
  if (catErr) catalog = (await admin.from("products").select("id, name, price, stock, active").eq("business_id", business.id).in("id", ids)).data as typeof catalog;
  const priced = priceCart(body.items, catalog ?? []);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 409 });

  // Pickup or delivery from the checkout: the zone's fee comes from the business, never the browser.
  let fee = 0;
  let zoneName: string | null = null;
  if (body.fulfillment === "delivery" && body.zoneId) {
    const zone = readZones(business.delivery_zones).find((z) => z.id === body.zoneId);
    if (!zone) return NextResponse.json({ error: "That delivery area isn't available. Pick another." }, { status: 409 });
    fee = zone.fee;
    zoneName = zone.name;
  }
  let slotAt: string | null = null;
  if (body.slot) {
    const hours = cleanHours(business.hours);
    const want = Date.parse(body.slot);
    const ok = slotOptions(hours, {
      now: Date.now() - 20 * 60_000, slotMinutes: business.slot_minutes ?? 120, max: 60, days: 14,
      leadDays: Math.max(0, ...(catalog ?? []).map((p: any) => p.lead_days ?? 0)), readyDays: sharedReadyDays((catalog ?? []) as any),
    }).some((x) => Date.parse(x.iso) === want);
    if (!ok) return NextResponse.json({ error: "That time is no longer available. Pick another." }, { status: 409 });
    slotAt = new Date(want).toISOString();
  }
  const total = Math.round((priced.subtotal + fee) * 100) / 100;

  // Optional: shopper gave their number, so we can link the order to a CRM record now.
  let customerId: string | null = null;
  const phone = body.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 7) {
    customerId = await upsertCustomer(admin, business.id, phone, { name: body.name, optIn: body.optIn, marketing: body.marketing });
    if (customerId) await admin.from("customers").update({ stage: "ordered" }).eq("id", customerId).eq("stage", "new");
  }

  const { data: code, error: codeErr } = await admin.rpc("next_order_code", { bid: business.id });
  if (codeErr || !code) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      business_id: business.id,
      code,
      customer_id: customerId,
      source: "web",
      subtotal: priced.subtotal,
      total,
      fulfillment: body.fulfillment ?? null,
      currency: business.currency,
      attribution: body.attribution ?? null,
      meta_fbc: body.fbc ?? null,
    })
    .select("id")
    .single();
  if (error || !order) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });

  // Delivery shows as its own line, so every summary, receipt and total includes it.
  await admin.from("order_items").insert([
    ...priced.items.map((i) => ({ ...i, order_id: order.id, business_id: business.id })),
    ...(fee > 0 ? [{ name: `Delivery (${zoneName})`, unit_price: fee, quantity: 1, product_id: null, order_id: order.id, business_id: business.id }] : []),
  ]);
  if (slotAt || zoneName || body.address) {
    await admin.from("orders").update({ slot_at: slotAt, delivery_zone: zoneName, delivery_address: body.address ?? null }).eq("id", order.id);
  }

  return NextResponse.json({
    code,
    whatsappUrl: waLink(business.whatsapp_number, `${template(business.site_template).greeting} ${code}`),
  });
}
