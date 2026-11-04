import { createAdminClient } from "@/lib/supabase/admin";
import { checkReceiptToken, receiptModel } from "@/lib/receipt";
import { renderReceipt } from "@/lib/receipt-image";

export const runtime = "nodejs";

/** PNG receipt for a paid order. WhatsApp fetches this URL when we send the receipt image. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (id === "demo" && process.env.NODE_ENV !== "production") return renderReceipt(receiptModel(DEMO));
  if (!/^[0-9a-f-]{36}$/.test(id) || !checkReceiptToken(id, t)) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: o } = await admin
    .from("orders")
    .select("code, total, currency, fulfillment, created_at, paid_at, fygaro_transaction_id, businesses(name, address), customers(name), order_items(name, unit_price, quantity)")
    .eq("id", id).maybeSingle<any>();
  if (!o || !o.paid_at) return new Response("Not found", { status: 404 });

  return renderReceipt(receiptModel({
    business: o.businesses, order: o, items: o.order_items ?? [], customerName: o.customers?.name,
    vatRate: process.env.RECEIPT_VAT_RATE ? Number(process.env.RECEIPT_VAT_RATE) : null,
  }));
}

// Sample shown at /api/receipts/demo in development only.
const DEMO = {
  business: { name: "Island Crumb Bakery", address: "Holetown, St James" },
  order: { code: "IC-1048", total: 90, currency: "BBD", fulfillment: "pickup", created_at: "2026-11-03T13:41:00Z", paid_at: "2026-11-03T13:43:00Z", fygaro_transaction_id: "7f3a9b02e1c21" },
  items: [{ name: "Coconut sweetbread", unit_price: 25, quantity: 2 }, { name: "Black cake", unit_price: 40, quantity: 1 }],
  customerName: "Tara Best",
  vatRate: 0.175,
};
