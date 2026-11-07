import { getEntitlements } from "@/lib/entitlements";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceCart, waLink } from "@/lib/order-text";
import { addDays, availability, expandKits, kitFree, overbooked, pickupOptions, priceRentalCart, validateDates, type Kits, type PricedLine, type RentalProduct } from "@/lib/rental";
import { loadBookings, loadRentalCatalog } from "@/lib/rental-server";
import { todayIn } from "@/lib/billing";
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
  paymentMethod: z.enum(["card", "transfer"]).optional(),
  rental: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().min(1).max(30),
    pickupTime: z.string().trim().max(40).optional(),
    agreed: z.boolean().optional(),
  }).optional(),
});

/** Public: turn a website cart into an order with a code, then hand back a WhatsApp link. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();

  // New columns fall back gracefully until the later migrations have run.
  let { data: business, error: bizErr } = await admin
    .from("businesses")
    .select("id, currency, whatsapp_number, site_template, hours, delivery_zones, slot_minutes, bank_transfer_enabled, bank_details, rental_agreement_url, rental_pickup_times, rental_lead_days, rental_buffer_days")
    .eq("slug", body.slug)
    .maybeSingle<any>();
  if (bizErr) ({ data: business, error: bizErr } = await admin.from("businesses").select("id, currency, whatsapp_number, site_template, hours, delivery_zones, slot_minutes").eq("slug", body.slug).maybeSingle<any>());
  if (bizErr) ({ data: business, error: bizErr } = await admin.from("businesses").select("id, currency, whatsapp_number, site_template").eq("slug", body.slug).maybeSingle<any>());
  if (bizErr) business = (await admin.from("businesses").select("id, currency, whatsapp_number").eq("slug", body.slug).maybeSingle()).data as typeof business;
  if (!business?.whatsapp_number) return NextResponse.json({ error: "This shop is not taking orders yet." }, { status: 404 });
  // Paused, cancelled or not yet paid for: the shop page stays up but takes no new orders.
  if (!(await getEntitlements(business.id, admin)).live) return NextResponse.json({ error: "This shop is not taking online orders right now. Message them on WhatsApp." }, { status: 403 });

  const ids = body.items.map((i) => i.productId);
  let { data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants, ready_days, lead_days, rental, rental_unit, deposit, min_days").eq("business_id", business.id).in("id", ids);
  if (catErr) ({ data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants, ready_days, lead_days").eq("business_id", business.id).in("id", ids) as any);
  if (catErr) ({ data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants").eq("business_id", business.id).in("id", ids) as any);
  if (catErr) catalog = (await admin.from("products").select("id, name, price, stock, active").eq("business_id", business.id).in("id", ids)).data as typeof catalog;
  // Rental items need dates, a free unit for every day, and the agreement if the shop has one.
  const rentals = ((catalog ?? []) as any[]).filter((p) => p.rental) as RentalProduct[];
  const rentalIds = new Set(rentals.map((p) => p.id));
  let rental: { start: string; end: string; days: number; unit: string; deposit: number; pickupTime: string | null; agreedAt: string | null } | null = null;
  const buffer = business.rental_buffer_days ?? 0;
  let rentalLines: PricedLine[] = [];
  let rentalTotal = 0;
  // All the shop's rental items, so packages can check the items inside them.
  let rentalCatalog: { products: { id: string; stock: number | null }[]; kits: Kits } = { products: rentals, kits: {} };
  if (rentals.length) {
    if (!body.rental) return NextResponse.json({ error: "Pick your rental dates first." }, { status: 400 });
    const bad = validateDates(body.rental.start, body.rental.days, todayIn(), business.rental_lead_days ?? 0);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    if (business.rental_agreement_url && !body.rental.agreed) return NextResponse.json({ error: "Please accept the rental agreement." }, { status: 400 });
    const times = pickupOptions(business.rental_pickup_times);
    if (times.length && !times.includes(body.rental.pickupTime ?? "")) return NextResponse.json({ error: "Pick a pickup time." }, { status: 400 });
    const end = addDays(body.rental.start, body.rental.days);
    rentalCatalog = await loadRentalCatalog(admin, business.id);
    const { kits } = rentalCatalog;
    const bookings = expandKits(await loadBookings(admin, business.id, body.rental.start, end, buffer), kits);
    const free = kitFree(availability(rentalCatalog.products, bookings, body.rental.start, end, buffer), kits);
    const r = priceRentalCart(body.items.filter((i) => rentalIds.has(i.productId)), rentals, body.rental.days, free, kits);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
    rentalLines = r.items;
    rentalTotal = r.subtotal;
    rental = { start: body.rental.start, end, days: body.rental.days, unit: r.unit, deposit: r.deposit, pickupTime: body.rental.pickupTime || null, agreedAt: body.rental.agreed ? new Date().toISOString() : null };
  }
  // Everything else (with sizes and stock limits) is priced as usual.
  const others = body.items.filter((i) => !rentalIds.has(i.productId));
  const plain = others.length ? priceCart(others, (catalog ?? []) as any[]) : { items: [], subtotal: 0 };
  if ("error" in plain) return NextResponse.json({ error: plain.error }, { status: 409 });
  const priced = { items: [...rentalLines, ...plain.items], subtotal: Math.round((rentalTotal + plain.subtotal) * 100) / 100 };

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

  const row = {
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
  };
  const transfer = body.paymentMethod === "transfer" && business.bank_transfer_enabled && business.bank_details?.trim();
  let { data: order, error } = await admin
    .from("orders")
    .insert({
      ...row,
      // Bank transfer only if the shop has it switched on with bank details saved.
      payment_method: transfer ? "transfer" : "card",
      ...(rental ? {
        rental_start: rental.start, rental_end: rental.end, rental_days: rental.days, rental_unit: rental.unit,
        pickup_time: rental.pickupTime, agreement_accepted_at: rental.agreedAt, deposit: rental.deposit,
      } : {}),
    })
    .select("id, created_at")
    .single();
  // Before 0018 and 0021: no payment method or rental columns yet. (Rentals can't be set up before 0021.)
  if (error && !rental && !transfer) ({ data: order, error } = await admin.from("orders").insert(row).select("id, created_at").single());
  if (error || !order) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });

  // Delivery shows as its own line, so every summary, receipt and total includes it.
  await admin.from("order_items").insert([
    ...priced.items.map((i) => ({ ...i, order_id: order.id, business_id: business.id })),
    ...(fee > 0 ? [{ name: `Delivery (${zoneName})`, unit_price: fee, quantity: 1, product_id: null, order_id: order.id, business_id: business.id }] : []),
  ]);
  if (slotAt || zoneName || body.address) {
    await admin.from("orders").update({ slot_at: slotAt, delivery_zone: zoneName, delivery_address: body.address ?? null }).eq("id", order.id);
  }

  // Two shoppers may have taken the last unit at the same moment: check again now both are saved, and give way if so.
  if (rental) {
    const after = await loadBookings(admin, business.id, rental.start, rental.end, buffer, undefined, { id: order.id, created_at: order.created_at });
    const clash = overbooked(rentalCatalog.products, expandKits(after, rentalCatalog.kits), rental.start, rental.end, buffer);
    if (clash.length) {
      await admin.from("orders").update({ status: "cancelled", note: "Cancelled automatically: those dates were booked at the same moment." }).eq("id", order.id);
      return NextResponse.json({ error: "Sorry, someone just booked those dates. Please pick other dates." }, { status: 409 });
    }
  }

  return NextResponse.json({
    code,
    whatsappUrl: waLink(business.whatsapp_number, rental ? `Hi! I'd like to book order ${code}` : `Hi! I'd like to place order ${code}`),
  });
}
