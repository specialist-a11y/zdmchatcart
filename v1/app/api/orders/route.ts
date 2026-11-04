import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceCart, waLink } from "@/lib/order-text";
import { upsertCustomer } from "@/lib/customers";

const Body = z.object({
  slug: z.string().min(2).max(41),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  optIn: z.boolean().optional(),
  attribution: z.string().trim().max(60).optional(),
});

/** Public: turn a website cart into an order with a code, then hand back a WhatsApp link. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();

  const { data: business } = await admin
    .from("businesses")
    .select("id, currency, whatsapp_number")
    .eq("slug", body.slug)
    .maybeSingle();
  if (!business?.whatsapp_number) return NextResponse.json({ error: "This shop is not taking orders yet." }, { status: 404 });

  const { data: catalog } = await admin
    .from("products")
    .select("id, name, price, stock, active")
    .eq("business_id", business.id)
    .in("id", body.items.map((i) => i.productId));
  const priced = priceCart(body.items, catalog ?? []);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 409 });

  // Optional: shopper gave their number, so we can link the order to a CRM record now.
  let customerId: string | null = null;
  const phone = body.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 7) {
    customerId = await upsertCustomer(admin, business.id, phone, { name: body.name, optIn: body.optIn });
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
    })
    .select("id")
    .single();
  if (error || !order) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });

  await admin.from("order_items").insert(
    priced.items.map((i) => ({ ...i, order_id: order.id, business_id: business.id })),
  );

  return NextResponse.json({
    code,
    whatsappUrl: waLink(business.whatsapp_number, `Hi! I'd like to place order ${code}`),
  });
}
