import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Till-style receipt sent as an image on WhatsApp when an order is paid.
 * The image URL carries a signed token so only the customer's link opens it.
 */
const key = () => process.env.RECEIPT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function receiptToken(orderId: string) {
  return createHmac("sha256", key()).update(`receipt:${orderId}`).digest("base64url").slice(0, 24);
}

export function checkReceiptToken(orderId: string, token: string) {
  if (!key() || !token) return false;
  const a = Buffer.from(receiptToken(orderId)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function receiptUrl(orderId: string) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${site}/api/receipts/${orderId}?t=${receiptToken(orderId)}`;
}

export type ReceiptInput = {
  business: { name: string; address?: string | null };
  order: { code: string; total: number | string; currency: string; fulfillment?: string | null; created_at: string; paid_at?: string | null; fygaro_transaction_id?: string | null };
  items: { name: string; unit_price: number | string; quantity: number }[];
  customerName?: string | null;
  vatRate?: number | null; // e.g. 0.175 when the business charges VAT and prices include it
  timeZone?: string;
};

const two = (n: number) => n.toFixed(2);

function when(iso: string, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Everything the image shows, worked out once (pure, tested). */
export function receiptModel(r: ReceiptInput) {
  const tz = r.timeZone ?? "America/Barbados";
  const lines = r.items.map((i) => ({ name: i.name.length > 30 ? i.name.slice(0, 29) + "…" : i.name, qty: i.quantity, unit: Number(i.unit_price), amount: Number(i.unit_price) * i.quantity }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const total = Number(r.order.total);
  const vat = r.vatRate ? total - total / (1 + r.vatRate) : null;
  const txn = r.order.fygaro_transaction_id;
  const cash = txn === "manual";
  const first = (r.customerName ?? "").trim().split(/\s+/)[0] || null;
  return {
    business: r.business.name.toUpperCase(),
    initials: r.business.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(""),
    address: r.business.address ?? null,
    code: r.order.code,
    date: when(r.order.created_at, tz),
    paid: r.order.paid_at ? when(r.order.paid_at, tz) : null,
    customer: r.customerName ? r.customerName.replace(/^(\S+)\s+(\S).*$/, "$1 $2.") : null,
    fulfilment: r.order.fulfillment === "delivery" ? "Delivery" : r.order.fulfillment === "pickup" ? "Pickup" : null,
    lines: lines.map((l) => ({ ...l, unit: two(l.unit), amount: two(l.amount) })),
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: two(subtotal),
    vat: vat == null ? null : { rate: `${+(r.vatRate! * 100).toFixed(2)}%`, amount: two(vat) },
    total: two(total),
    currency: r.order.currency,
    payment: cash ? "Cash / in person" : "Card link",
    ref: !txn || cash ? null : txn.length > 12 ? `${txn.slice(0, 4)}...${txn.slice(-3)}` : txn,
    thanks: first ? `Thank you, ${first}!` : "Thank you!",
    pickupNote: r.order.fulfillment === "delivery" ? "Keep this receipt for your delivery." : "Show this receipt at pickup.",
  };
}

/** Simple deterministic bar pattern from the order code (decorative, not a scannable symbology). */
export function barPattern(code: string) {
  const bars: { w: number; on: boolean }[] = [];
  for (const ch of `*${code}*`) {
    const h = ch.charCodeAt(0);
    for (let k = 0; k < 9; k++) bars.push({ w: (h >> (k % 7)) & 1 ? 3 : 1.5, on: k % 2 === 0 });
    bars.push({ w: 2, on: false });
  }
  return bars;
}
