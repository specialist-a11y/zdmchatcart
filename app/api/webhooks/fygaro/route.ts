import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFygaroSignature, type FygaroHookPayload } from "@/lib/fygaro";
import { sendReceipt } from "@/lib/payments";
import { markInvoicePaid } from "@/lib/zdm-billing";
import { sendPurchaseEvent } from "@/lib/meta";

/**
 * Fygaro Hook: called after a successful payment.
 * 1. Find the business by the Fygaro-Key-ID header, 2. verify the signature with its secret,
 * 3. match customReference (our order id), check the amount, 4. mark paid and send a WhatsApp receipt.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const keyId = req.headers.get("fygaro-key-id");
  const signature = req.headers.get("fygaro-signature");
  if (!keyId || !signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const admin = createAdminClient();

  // ZDMINC's own Fygaro account: clients paying their ZDM ChatCart invoices.
  if (process.env.ZDM_FYGARO_KEY_ID && keyId === process.env.ZDM_FYGARO_KEY_ID) {
    if (!process.env.ZDM_FYGARO_SECRET || !verifyFygaroSignature(raw, signature, process.env.ZDM_FYGARO_SECRET)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
    const payload = JSON.parse(raw) as FygaroHookPayload;
    const { error: dup } = await admin.from("webhook_events").insert({ provider: "fygaro-zdm", external_id: payload.transactionId, payload });
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
    if (payload.customReference) await markInvoicePaid(admin, payload.customReference, payload.amount, payload.transactionId);
    return NextResponse.json({ ok: true });
  }

  const { data: integ } = await admin
    .from("integrations")
    .select("business_id")
    .eq("provider", "fygaro")
    .eq("config->>key_id", keyId)
    .maybeSingle();
  if (!integ) return NextResponse.json({ error: "unknown key" }, { status: 401 });
  const { data: sec } = await admin
    .from("integration_secrets")
    .select("secret")
    .eq("business_id", integ.business_id)
    .eq("provider", "fygaro")
    .maybeSingle();
  if (!sec || !verifyFygaroSignature(raw, signature, sec.secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as FygaroHookPayload;
  // Idempotency: Fygaro may retry; the unique (provider, external_id) stops double processing.
  const { error: dup } = await admin.from("webhook_events").insert({
    provider: "fygaro",
    business_id: integ.business_id,
    external_id: payload.transactionId,
    payload,
  });
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  const orderId = payload.customReference;
  if (!orderId) return NextResponse.json({ ok: true, note: "no customReference" });
  const { data: order } = await admin
    .from("orders")
    .select("id, code, total, currency, customer_id, customers(phone)")
    .eq("id", orderId)
    .eq("business_id", integ.business_id)
    .maybeSingle<any>();
  if (!order) return NextResponse.json({ ok: true, note: "order not found" });

  if (Math.round(Number(payload.amount) * 100) < Math.round(Number(order.total) * 100)) {
    await admin.from("orders").update({ note: `Fygaro paid ${payload.amount} ${payload.currency}, less than total. Check manually.` }).eq("id", order.id);
    return NextResponse.json({ ok: true, note: "amount mismatch" });
  }

  const { data: changed } = await admin.rpc("mark_order_paid", { p_order: order.id, p_txn: payload.transactionId });
  // Tell Meta about the sale (skipped quietly if the shop has no Pixel / Conversions API token).
  if (changed) await sendPurchaseEvent(admin, order.id).catch(() => null);
  // Receipt image on WhatsApp (text fallback inside sendReceipt).
  if (changed && order.customers?.phone) await sendReceipt(admin, order.id).catch(() => null);
  return NextResponse.json({ ok: true });
}
