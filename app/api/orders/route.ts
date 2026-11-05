import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceCart, waLink } from "@/lib/order-text";
import { upsertCustomer } from "@/lib/customers";
import { template } from "@/lib/catalog";

const Body = z.object({
  slug: z.string().min(2).max(41),
  items: z.array(z.object({ productId: z.string().uuid(), variantId: z.string().regex(/^[a-z0-9]{2,12}$/i).optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  optIn: z.boolean().optional(),
  marketing: z.boolean().optional(),
  attribution: z.string().trim().max(60).optional(),
  fbc: z.string().trim().regex(/^fb\.1\.\d+\.[\w-]{10,250}$/).optional(),
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
    .select("id, currency, whatsapp_number, site_template")
    .eq("slug", body.slug)
    .maybeSingle();
  if (bizErr) business = (await admin.from("businesses").select("id, currency, whatsapp_number").eq("slug", body.slug).maybeSingle()).data as typeof business;
  if (!business?.whatsapp_number) return NextResponse.json({ error: "This shop is not taking orders yet." }, { status: 404 });

  const ids = body.items.map((i) => i.productId);
  let { data: catalog, error: catErr } = await admin.from("products").select("id, name, price, stock, active, variants").eq("business_id", business.id).in("id", ids);
  if (catErr) catalog = (await admin.from("products").select("id, name, price, stock, active").eq("business_id", business.id).in("id", ids)).data as typeof catalog;
  const priced = priceCart(body.items, catalog ?? []);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 409 });

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
      total: priced.subtotal,
      currency: business.currency,
      attribution: body.attribution ?? null,
      meta_fbc: body.fbc ?? null,
    })
    .select("id")
    .single();
  if (error || !order) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });

  await admin.from("order_items").insert(
    priced.items.map((i) => ({ ...i, order_id: order.id, business_id: business.id })),
  );

  return NextResponse.json({
    code,
    whatsappUrl: waLink(business.whatsapp_number, `${template(business.site_template).greeting} ${code}`),
  });
}
