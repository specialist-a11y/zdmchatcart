import { createAdminClient } from "@/lib/supabase/admin";
import { checkReceiptToken, receiptModel } from "@/lib/receipt";
import { renderReceipt } from "@/lib/receipt-image";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/part-payments";

export const runtime = "nodejs";

/** PNG receipt for a paid order. WhatsApp fetches this URL when we send the receipt image. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (id === "demo" && process.env.NODE_ENV !== "production") {
    // ?part=1 shows a part payment, ?logo=<https url> a logo.
    const q = new URL(req.url).searchParams;
    const part = q.get("part") ? { order: { ...DEMO.order, paid_at: null }, amountPaid: 40, lastMethod: "1st Pay / bank transfer" } : {};
    return renderReceipt(receiptModel({ ...DEMO, ...part }), q.get("logo"));
  }
  if (!/^[0-9a-f-]{36}$/.test(id) || !checkReceiptToken(id, t)) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const sel = "id, code, total, currency, fulfillment, created_at, paid_at, fygaro_transaction_id, customers(name), order_items(name, unit_price, quantity)";
  // amount_paid (0026) and logo_url may be missing on older databases: fall back step by step.
  let { data: o, error } = await admin.from("orders").select(`${sel}, amount_paid, businesses(name, address, logo_url)`).eq("id", id).maybeSingle<any>();
  if (error) ({ data: o } = await admin.from("orders").select(`${sel}, businesses(name, address)`).eq("id", id).maybeSingle<any>());
  if (!o || (!o.paid_at && !(Number(o.amount_paid ?? 0) > 0))) return new Response("Not found", { status: 404 });

  let lastMethod: string | null = null;
  if (!o.paid_at) {
    const { data: last } = await admin.from("order_payments").select("method").eq("order_id", o.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    lastMethod = last ? METHOD_LABEL[last.method as PaymentMethod] ?? null : null;
  }
  return renderReceipt(receiptModel({
    business: o.businesses, order: o, items: o.order_items ?? [], customerName: o.customers?.name,
    amountPaid: o.amount_paid, lastMethod,
    vatRate: process.env.RECEIPT_VAT_RATE ? Number(process.env.RECEIPT_VAT_RATE) : null,
  }), o.businesses?.logo_url);
}

// Sample shown at /api/receipts/demo in development only.
const DEMO = {
  business: { name: "Island Crumb Bakery", address: "Holetown, St James" },
  order: { code: "IC-1048", total: 90, currency: "BBD", fulfillment: "pickup", created_at: "2026-11-03T13:41:00Z", paid_at: "2026-11-03T13:43:00Z", fygaro_transaction_id: "7f3a9b02e1c21" },
  items: [{ name: "Coconut sweetbread", unit_price: 25, quantity: 2 }, { name: "Black cake", unit_price: 40, quantity: 1 }],
  customerName: "Tara Best",
  vatRate: 0.175,
};
