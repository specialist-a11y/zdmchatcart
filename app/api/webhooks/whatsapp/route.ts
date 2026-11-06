import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";
import { downloadWhatsAppMedia, parseInbound, verifyMetaSignature } from "@/lib/whatsapp";
import { extractOrderCode, money, needsPrice, orderReply } from "@/lib/order-text";
import { rentalLine } from "@/lib/rental";
import { ensurePaymentLink, getIntegration, sendFromBusiness } from "@/lib/payments";
import { claimsPaid, findReference, proofPath, transferInstructions, wantsTransfer } from "@/lib/transfer";
import { setConsent, upsertCustomer } from "@/lib/customers";
import { consentCommand, startReply, stopReply } from "@/lib/journeys";
import { awayDue, awayText, cleanHours, matchFaq, openState } from "@/lib/hours";
import { recordZdmInbound } from "@/lib/zdm-whatsapp";

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

    // Messages to ZDMINC's own number are clients talking to the team, not shoppers.
    if (process.env.ZDM_WA_PHONE_NUMBER_ID && msg.phoneNumberId === process.env.ZDM_WA_PHONE_NUMBER_ID) {
      await recordZdmInbound(admin, msg);
      continue;
    }

    const { data: integ } = await admin
      .from("integrations")
      .select("business_id")
      .eq("provider", "whatsapp")
      .eq("config->>phone_number_id", msg.phoneNumberId)
      .maybeSingle();
    if (!integ) continue;
    const businessId = integ.business_id as string;

    const customerId = await upsertCustomer(admin, businessId, msg.from, { name: msg.name, optIn: true });

    // STOP / START: switch marketing off or on, and confirm once.
    const consent = consentCommand(msg.text);
    if (consent && customerId) {
      await admin.from("messages").insert({
        business_id: businessId, customer_id: customerId, channel: "whatsapp", direction: "in", body: msg.text, external_id: msg.messageId,
      });
      if (await setConsent(admin, customerId, consent)) {
        const { data: biz } = await admin.from("businesses").select("name").eq("id", businessId).single();
        await sendFromBusiness(admin, businessId, msg.from, consent === "stop" ? stopReply(biz?.name ?? "us") : startReply(biz?.name ?? "us"), { customerId });
      }
      continue;
    }
    // Bank transfer (migration 0018): on only with bank details saved.
    const { data: bank } = await admin.from("businesses").select("bank_transfer_enabled, bank_details").eq("id", businessId).maybeSingle<any>();
    const transferOn = !!(bank?.bank_transfer_enabled && bank.bank_details?.trim());
    const code = extractOrderCode(msg.text);

    let orderId: string | null = null;
    let reply: string | null = null;

    if (code) {
      // products(kind) tells bookings from orders; fall back without it if the join isn't available.
      const find = (cols: string, items: string) => admin.from("orders").select(`id, code, status, total, currency, customer_id, fulfillment${cols}, order_items(${items})`)
        .eq("business_id", businessId).eq("code", code).maybeSingle<any>();
      const extra = ", payment_method, rental_start, rental_end, rental_days, rental_unit, pickup_time, deposit";
      let { data: order, error: findErr } = await find(extra, "name, unit_price, quantity, products(kind)");
      if (findErr) ({ data: order, error: findErr } = await find("", "name, unit_price, quantity, products(kind)"));
      if (findErr) order = (await find("", "name, unit_price, quantity")).data;
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
          const items = order.order_items ?? [];
          // Price-on-request items: the owner sets the price first, then sends the link from the order page.
          const url = needsPrice(items) ? null : await ensurePaymentLink(admin, order.id);
          const hasProducts = !order.fulfillment && !order.rental_start && items.some((i: any) => i.products?.kind !== "service");
          const anyServices = items.some((i: any) => i.products?.kind === "service");
          const rental = rentalLine(order, order.rental_unit ?? "day");
          const dep = rental && Number(order.deposit ?? 0) > 0 ? "\nThe deposit is refunded when everything comes back in good condition." : "";
          if (transferOn && order.payment_method === "transfer" && !needsPrice(items)) {
            // Chose bank transfer on the website: send the bank details with the order code as reference.
            if (order.status === "awaiting_confirmation") await admin.from("orders").update({ status: "awaiting_payment" }).eq("id", order.id);
            const base = orderReply({ code: order.code, items, total: order.total, currency: order.currency, paymentUrl: null, hasProducts: false, anyServices });
            reply = `${base.split("\n\n")[0]}${rental ? `\n${rental}${dep}` : ""}\n\n${transferInstructions({ code: order.code, amount: money(order.total, order.currency) }, bank.bank_details, url)}${hasProducts ? "\n\nReply PICKUP or DELIVERY so we know how to get it to you." : ""}`;
          } else {
            reply = orderReply({
              code: order.code, items, total: order.total, currency: order.currency, paymentUrl: url,
              // Already chose pickup or delivery at checkout, so don't ask again.
              hasProducts, anyServices,
            });
            if (rental) reply = reply.replace("\n\n", `\n${rental}${dep}\n\n`);
            if (url && transferOn) reply = reply.replace(url, `${url}\nOr reply TRANSFER to pay by bank transfer (1st Pay or any bank).`);
          }
          const { data: when } = await admin.from("orders").select("slot_at, delivery_address").eq("id", order.id).maybeSingle();
          if (order.fulfillment || when?.slot_at) {
            const t = when?.slot_at ? new Date(when.slot_at).toLocaleString("en-GB", { timeZone: "America/Barbados", weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "") : null;
            reply += `\n\n${order.fulfillment === "delivery" ? "Delivery" : order.fulfillment === "pickup" ? "Pickup" : "Time"}${t ? `: ${t}` : ""}${order.fulfillment === "delivery" && when?.delivery_address ? ` to ${when.delivery_address}` : ""}.`;
          }
        }
      }
    }

    const { count: priorInbound } = await admin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("customer_id", customerId).eq("direction", "in");

    await admin.from("messages").insert({
      business_id: businessId, customer_id: customerId, order_id: orderId,
      channel: "whatsapp", direction: "in", body: msg.media ? `[Photo]${msg.text ? " " + msg.text : ""}` : msg.text, external_id: msg.messageId,
    });

    // Bank transfer: switch to transfer, or receive the screenshot / reference for the latest unpaid order.
    if (!reply && !code && transferOn && customerId) {
      const { data: open } = await admin
        .from("orders").select("id, code, total, currency, status, payment_method")
        .eq("business_id", businessId).eq("customer_id", customerId)
        .in("status", ["awaiting_confirmation", "awaiting_payment", "transfer_pending"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (open) {
        const ref = msg.media ? null : findReference(msg.text);
        if (open.status !== "transfer_pending" && !msg.media && wantsTransfer(msg.text)) {
          await admin.from("orders").update({ payment_method: "transfer", status: "awaiting_payment" }).eq("id", open.id);
          orderId = open.id;
          reply = transferInstructions({ code: open.code, amount: money(open.total, open.currency) }, bank.bank_details, await ensurePaymentLink(admin, open.id));
        } else if (open.payment_method === "transfer" && (msg.media || ref)) {
          const patch: Record<string, unknown> = { status: "transfer_pending", transfer_submitted_at: new Date().toISOString() };
          if (ref) patch.transfer_reference = ref;
          if (msg.media) {
            const wa = await getIntegration(admin, businessId, "whatsapp");
            const file = wa?.secret ? await downloadWhatsAppMedia(msg.media.id, wa.secret) : null;
            if (file) {
              const path = proofPath(businessId, open.id, file.mime.split("/")[1] ?? "jpg");
              const up = await admin.storage.from("transfer-proofs").upload(path, file.bytes, { contentType: file.mime, upsert: false });
              if (!up.error) { patch.transfer_proof_path = path; patch.transfer_proof_hash = createHash("sha256").update(file.bytes).digest("hex"); }
            }
            if (msg.text) { const capRef = findReference(msg.text); if (capRef) patch.transfer_reference = capRef; }
          }
          await admin.from("orders").update(patch).eq("id", open.id);
          orderId = open.id;
          reply = `Thank you! We've got your ${msg.media ? "screenshot" : "reference"} for order ${open.code}. We'll check our account and send your receipt as soon as it shows.`;
        } else if (open.payment_method === "transfer" && open.status === "awaiting_payment" && claimsPaid(msg.text)) {
          orderId = open.id;
          reply = `Thanks! To match your payment to order ${open.code}, please send the screenshot or the transfer reference number.`;
        }
      }
    }

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

    // Automations (migration 0015): FAQ keyword answers, then the away message when closed.
    if (!reply && !code) {
      const { data: faqs } = await admin.from("whatsapp_faqs").select("id, keywords, answer, active, hits").eq("business_id", businessId).eq("active", true);
      const faq = matchFaq(msg.text, (faqs ?? []) as any);
      if (faq) {
        reply = faq.answer;
        await admin.from("whatsapp_faqs").update({ hits: ((faq as any).hits ?? 0) + 1 }).eq("id", faq.id);
      }
    }
    let biz: any = null;
    if (!reply && !code) {
      const { data } = await admin.from("businesses").select("slug, name, hours, away_enabled, away_message, closed_until, closed_note").eq("id", businessId).maybeSingle();
      biz = data;
      const state = biz ? openState(cleanHours(biz.hours), { closedUntil: biz.closed_until, closedNote: biz.closed_note }) : null;
      if (biz?.away_enabled && state && !state.open && customerId) {
        const { data: c } = await admin.from("customers").select("away_sent_at").eq("id", customerId).maybeSingle();
        if (awayDue(c?.away_sent_at)) {
          reply = awayText(biz.away_message, state, biz.name).replace("{shop_link}", `${site}/s/${biz.slug}`);
          await admin.from("customers").update({ away_sent_at: new Date().toISOString() }).eq("id", customerId);
        }
      }
    }

    // Only greet first-time chatters; everything else waits for a human in the inbox.
    if (!reply && !code && (priorInbound ?? 0) === 0) {
      if (!biz) biz = (await admin.from("businesses").select("slug").eq("id", businessId).single()).data;
      reply = `Hi${msg.name ? " " + msg.name.split(" ")[0] : ""}! Browse and order here: ${site}/s/${biz?.slug}\nA team member will also reply soon.`;
    }

    if (reply) await sendFromBusiness(admin, businessId, msg.from, reply, { customerId, orderId });
  }

  return NextResponse.json({ ok: true });
}
