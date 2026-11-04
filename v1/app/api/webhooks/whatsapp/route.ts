import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInbound, verifyMetaSignature } from "@/lib/whatsapp";
import { extractOrderCode, orderSummary } from "@/lib/order-text";
import { ensurePaymentLink, sendFromBusiness } from "@/lib/payments";
import { upsertCustomer } from "@/lib/customers";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Incoming WhatsApp messages. Replies to order codes with the summary and a Fygaro link. */
export async function POST(req: Request) {
  const raw = await req.text();
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("bad signature", { status: 401 });
  }
  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  for (const msg of parseInbound(JSON.parse(raw))) {
    const { error: dup } = await admin.from("webhook_events").insert({
      provider: "whatsapp", external_id: msg.messageId, payload: msg,
    });
    if (dup) continue; // already handled (Meta retries)

    const { data: integ } = await admin
      .from("integrations")
      .select("business_id")
      .eq("provider", "whatsapp")
      .eq("config->>phone_number_id", msg.phoneNumberId)
      .maybeSingle();
    if (!integ) continue;
    const businessId = integ.business_id as string;

    const customerId = await upsertCustomer(admin, businessId, msg.from, { name: msg.name, optIn: true });
    const code = extractOrderCode(msg.text);

    let orderId: string | null = null;
    let reply: string | null = null;

    if (code) {
      const { data: order } = await admin
        .from("orders")
        .select("id, code, status, total, currency, customer_id, order_items(name, unit_price, quantity)")
        .eq("business_id", businessId)
        .eq("code", code)
        .maybeSingle<any>();
      if (order) {
        orderId = order.id;
        if (!order.customer_id && customerId) {
          await admin.from("orders").update({ customer_id: customerId }).eq("id", order.id);
          await admin.from("customers").update({ stage: "ordered" }).eq("id", customerId).eq("stage", "new");
        }
        if (order.status === "paid") {
          reply = `Order ${order.code} is already paid. Thank you! We'll message you when it's ready.`;
        } else if (["cancelled", "fulfilled"].includes(order.status)) {
          reply = `Order ${order.code} is ${order.status}. Reply here if you need help.`;
        } else {
          const url = await ensurePaymentLink(admin, order.id);
          const summary = orderSummary(order.code, order.order_items, order.total, order.currency);
          reply = url
            ? `Thanks! Here's your order:\n${summary}\n\nPay securely here: ${url}\n\nReply PICKUP or DELIVERY so we know how to get it to you.`
            : `Thanks! Here's your order:\n${summary}\n\nWe'll send your payment link shortly.`;
        }
      }
    }

    const { count: priorInbound } = await admin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("customer_id", customerId).eq("direction", "in");

    await admin.from("messages").insert({
      business_id: businessId, customer_id: customerId, order_id: orderId,
      channel: "whatsapp", direction: "in", body: msg.text, external_id: msg.messageId,
    });

    // Pickup or delivery answer for the customer's latest open order.
    if (!reply && /\b(pickup|pick up|delivery)\b/i.test(msg.text) && customerId) {
      const fulfillment = /deliver/i.test(msg.text) ? "delivery" : "pickup";
      const { data: open } = await admin
        .from("orders").select("id, code").eq("business_id", businessId).eq("customer_id", customerId)
        .in("status", ["awaiting_confirmation", "awaiting_payment", "paid"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (open) {
        await admin.from("orders").update({ fulfillment }).eq("id", open.id);
        orderId = open.id;
        reply = `Got it, ${fulfillment} for order ${open.code}.`;
      }
    }

    // Only greet first-time chatters; everything else waits for a human in the inbox.
    if (!reply && !code && (priorInbound ?? 0) === 0) {
      const { data: biz } = await admin.from("businesses").select("slug").eq("id", businessId).single();
      reply = `Hi${msg.name ? " " + msg.name.split(" ")[0] : ""}! Browse and order here: ${site}/s/${biz?.slug}\nA team member will also reply soon.`;
    }

    if (reply) await sendFromBusiness(admin, businessId, msg.from, reply, { customerId, orderId });
  }

  return NextResponse.json({ ok: true });
}
