import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkOrderToken } from "@/lib/order-link";
import { ensurePaymentLink } from "@/lib/payments";
import { receiptUrl } from "@/lib/receipt";
import { money } from "@/lib/order-text";
import { mapsLink, prettyDate, unitLabel } from "@/lib/rental";
import { balanceDue, dueNow } from "@/lib/part-payments";
import { rentalSettings } from "@/lib/rental-server";
import ProofUpload from "./ProofUpload";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CSS = `
.op{max-width:560px;margin:0 auto;padding:20px 16px 48px;font-family:'DM Sans',system-ui,sans-serif;color:#0B0F0E;font-size:16px;line-height:1.5}
.op h1,.op h2{font-family:'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;line-height:1.1;margin:0}
.op h1{font-size:34px}.op h2{font-size:22px}
.op-card{background:#fff;border:1px solid #e3e6e5;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;margin-top:14px}
.op-head{display:flex;align-items:center;gap:12px}
.op-head img{width:56px;height:56px;object-fit:contain;border-radius:12px;background:#0B0F0E;padding:4px}
.op-row{display:flex;justify-content:space-between;gap:12px}
.op-muted{color:#5b6461;font-size:14px}
.op-status{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:14px}
.op-stack{display:flex;flex-direction:column;gap:10px}
.op-label{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:14px}
.op input{font:inherit;font-size:16px;min-height:44px;padding:8px 10px;border:1px solid #cfd5d3;border-radius:10px;background:#fff}
.op-btn{display:flex;align-items:center;justify-content:center;min-height:50px;border-radius:12px;border:2px solid #0B0F0E;background:#0B0F0E;color:#fff;font-weight:700;font-size:17px;text-decoration:none;cursor:pointer}
.op-btn.ghost{background:#fff;color:#0B0F0E}
.op-pre{white-space:pre-wrap;background:#f4f6f5;border-radius:10px;padding:12px;font-size:15px;margin:0}
.op-err{color:#b42318;font-weight:700;margin:0}
body{background:#f4f6f5}
`;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t = "" } = await searchParams;
  if (!checkOrderToken(id, t)) notFound();
  const admin = createAdminClient();
  const sel = "id, business_id, code, status, total, currency, amount_paid, paid_at, payment_method, payment_url, rental_start, rental_end, rental_days, rental_unit, pickup_time, deposit, fulfillment, slot_at, created_at, businesses(name, slug, logo_url, brand_color, bank_details, bank_transfer_enabled, whatsapp_number, public_email), order_items(name, unit_price, quantity)";
  let { data: o, error } = await admin.from("orders").select(`${sel}, deposit_kind`).eq("id", id).maybeSingle<any>();
  if (error) ({ data: o } = await admin.from("orders").select(sel).eq("id", id).maybeSingle<any>());
  if (!o) notFound();
  const b = o.businesses ?? {};
  const accent = /^#[0-9a-f]{6}$/i.test(b.brand_color ?? "") ? b.brand_color : "#0B0F0E";
  const paid = !!o.paid_at || ["paid", "ready", "fulfilled"].includes(o.status);
  const paidSoFar = paid ? Number(o.total) : Number(o.amount_paid ?? 0);
  const balance = paid ? 0 : balanceDue(o.total, paidSoFar);
  const open = !paid && !["cancelled", "abandoned"].includes(o.status);
  const priceToConfirm = (o.order_items ?? []).some((i: any) => Number(i.unit_price) === 0);
  const bankOn = !!(b.bank_transfer_enabled && b.bank_details?.trim());
  const pending = o.status === "transfer_pending";
  // Card link for the balance (made on first visit, then reused).
  const payUrl = open && !pending && !priceToConfirm && balance > 0 ? await ensurePaymentLink(admin, o.id).catch(() => null) : null;
  // Booking deposit: the deposit first, then the balance at pickup.
  const booking = o.deposit_kind === "booking" && Number(o.deposit ?? 0) > 0;
  const due = paid ? 0 : dueNow(o);
  const depositDue = booking && paidSoFar < Number(o.deposit);
  // Once they've paid something, show where to collect.
  const pin = o.rental_start && (paid || paidSoFar > 0) ? mapsLink((await rentalSettings(admin, o.business_id)).pickupMap) : null;
  const call = b.whatsapp_number ? `+${String(b.whatsapp_number).replace(/\D/g, "")}` : null;

  const status = o.status === "cancelled" ? ["Cancelled", "#fde8e7", "#b42318"]
    : paid ? ["Paid", "#dcf8c6", "#146c43"]
    : pending ? ["Payment being checked", "#e6efff", "#1D5FD1"]
    : booking && paidSoFar > 0 ? ["Date secured", "#dcf8c6", "#146c43"]
    : paidSoFar > 0 ? ["Part paid", "#fff4d6", "#8a5a00"]
    : priceToConfirm ? ["We'll confirm the price", "#fff4d6", "#8a5a00"]
    : ["Waiting for payment", "#fff4d6", "#8a5a00"];

  return (
    <main className="op">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="op-head">
        {b.logo_url && <img src={b.logo_url} alt="" />}
        <div><b style={{ fontSize: 18 }}>{b.name}</b><div className="op-muted">Keep this page. It shows your order and payment.</div></div>
      </div>

      <div className="op-card">
        <div className="op-row" style={{ alignItems: "center" }}>
          <h1>Order {o.code}</h1>
          <span className="op-status" style={{ background: status[1], color: status[2] }}>{status[0]}</span>
        </div>
        {(o.order_items ?? []).map((i: any, n: number) => (
          <div key={n} className="op-row"><span>{i.quantity} x {i.name}</span><span>{Number(i.unit_price) ? money(Number(i.unit_price) * i.quantity, o.currency) : "Price to confirm"}</span></div>
        ))}
        {o.rental_start && (
          <p className="op-muted" style={{ margin: 0 }}>Pick up {prettyDate(o.rental_start)}{o.pickup_time ? ` at ${o.pickup_time}` : ""}. Return {prettyDate(o.rental_end)} ({o.rental_days} {unitLabel(o.rental_unit, o.rental_days)}).{Number(o.deposit) > 0 && !booking ? " The deposit is refunded when everything comes back in good condition." : ""}</p>
        )}
        <div className="op-row" style={{ borderTop: "1px solid #e3e6e5", paddingTop: 10 }}><b>Total</b><b>{money(o.total, o.currency)}</b></div>
        {booking && !paid && paidSoFar === 0 && <>
          <div className="op-row"><b>Deposit to secure your date</b><b>{money(o.deposit, o.currency)}</b></div>
          <div className="op-row"><span>Balance, due at pickup</span><span>{money(balance - Number(o.deposit), o.currency)}</span></div>
        </>}
        {paidSoFar > 0 && !paid && <>
          <div className="op-row"><span>{booking && paidSoFar >= Number(o.deposit) ? "Deposit paid" : "Paid so far"}</span><span>{money(paidSoFar, o.currency)}</span></div>
          <div className="op-row"><b>{booking ? "Balance, due at pickup" : "Balance to pay"}</b><b>{money(balance, o.currency)}</b></div>
        </>}
      </div>

      {paid && (
        <div className="op-card">
          <h2>Thank you!</h2>
          <p style={{ margin: 0 }}>Your payment is confirmed.{o.rental_start ? " See you at pickup." : ""}</p>
          <a className="op-btn ghost" href={receiptUrl(o.id)} target="_blank" rel="noreferrer">View your receipt</a>
        </div>
      )}

      {pin && (
        <div className="op-card">
          <h2>Pickup location</h2>
          <p style={{ margin: 0 }}>Pick up {prettyDate(o.rental_start)}{o.pickup_time ? ` at ${o.pickup_time}` : ""}. Bring everything back {prettyDate(o.rental_end)}.</p>
          <a className="op-btn" style={{ background: accent, borderColor: accent }} href={pin} target="_blank" rel="noreferrer">Open the pin in Google Maps</a>
        </div>
      )}

      {pending && (
        <div className="op-card">
          <h2>We got your payment proof</h2>
          <p style={{ margin: 0 }}>{b.name} will check their account and confirm. This page updates when it's done.</p>
        </div>
      )}

      {open && !pending && priceToConfirm && (
        <div className="op-card"><p style={{ margin: 0 }}>{b.name} will confirm the price and call you. Then you can pay here.</p></div>
      )}

      {open && !pending && !priceToConfirm && due > 0 && (
        <>
          {payUrl && (
            <div className="op-card">
              <h2>Pay by card</h2>
              <a className="op-btn" style={{ background: accent, borderColor: accent }} href={payUrl}>{depositDue ? `Pay the ${money(due, o.currency)} deposit now` : `Pay ${money(due, o.currency)} now`}</a>
              <span className="op-muted">Secure card payment by Fygaro. They email you a receipt.</span>
            </div>
          )}
          {bankOn && (
            <div className="op-card">
              <h2>{payUrl ? "Or pay by 1st Pay or bank transfer" : "Pay by 1st Pay or bank transfer"}</h2>
              <p style={{ margin: 0 }}>{depositDue ? "Send the deposit to secure your date. Use your order code as the reference." : "Use your order code as the reference."}</p>
              <pre className="op-pre">{b.bank_details.trim()}</pre>
              <div className="op-row"><span>{depositDue ? "Deposit to send now" : "Amount"}</span><b>{money(due, o.currency)}</b></div>
              <div className="op-row"><span>Reference</span><b>{o.code}</b></div>
              <p className="op-muted" style={{ margin: 0 }}>When it's sent, add your screenshot here. We confirm once it shows in our account.</p>
              <ProofUpload id={o.id} token={t} accent={accent} />
            </div>
          )}
          {!payUrl && !bankOn && (
            <div className="op-card"><p style={{ margin: 0 }}>{b.name} will call you to arrange payment.</p></div>
          )}
        </>
      )}

      <div className="op-card">
        <b>Questions?</b>
        <span>{call ? <>Call {b.name} on <a href={`tel:${call}`}>{call}</a></> : `Contact ${b.name}`}{b.public_email ? <> or email <a href={`mailto:${b.public_email}`}>{b.public_email}</a></> : null}.</span>
      </div>
    </main>
  );
}
