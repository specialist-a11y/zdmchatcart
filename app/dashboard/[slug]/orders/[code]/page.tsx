import Link from "next/link";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePaymentLink, sendFromBusiness, sendReceipt } from "@/lib/payments";
import { receiptUrl } from "@/lib/receipt";
import { sendReadyMessage } from "@/lib/followups";
import { money, needsPrice, orderSummary, waLink } from "@/lib/order-text";
import { overbooked, prettyDate, withRental } from "@/lib/rental";
import { loadBookings } from "@/lib/rental-server";

const NEXT_STATUSES = ["awaiting_payment", "paid", "ready", "fulfilled", "cancelled"] as const;

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { slug, code } = await params;
  const { msg } = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  const { data: order } = await supabase
    .from("orders")
    .select("*, customers(id, name, phone), order_items(id, product_id, name, unit_price, quantity)")
    .eq("business_id", business.id)
    .eq("code", code)
    .maybeSingle();
  if (!order) notFound();
  const path = `/dashboard/${slug}/orders/${code}`;

  async function createLink() {
    "use server";
    const { business } = await requireMembership(slug); // re-check on every action
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id, total, order_items(unit_price)").eq("business_id", business.id).eq("code", code).single<any>();
    if (o && needsPrice(o.order_items ?? [])) redirect(`${path}?msg=${encodeURIComponent("Set the prices to confirm first")}`);
    if (o && !(Number(o.total) > 0)) redirect(`${path}?msg=${encodeURIComponent("This order's total is 0, so there's nothing to pay")}`);
    const url = o ? await ensurePaymentLink(admin, o.id) : null;
    redirect(`${path}?msg=${url ? "Payment link ready" : "Connect Fygaro in Settings first"}`);
  }

  async function sendLink() {
    "use server";
    const { business } = await requireMembership(slug);
    const admin = createAdminClient();
    const { data: o } = await admin
      .from("orders")
      .select("*, customers(phone), order_items(name, unit_price, quantity)")
      .eq("business_id", business.id).eq("code", code).single<any>();
    if (!o?.customers?.phone) redirect(`${path}?msg=No customer phone on this order yet`);
    if (needsPrice(o.order_items ?? [])) redirect(`${path}?msg=${encodeURIComponent("Set the prices to confirm first")}`);
    if (!(Number(o.total) > 0)) redirect(`${path}?msg=${encodeURIComponent("This order's total is 0, so there's nothing to pay")}`);
    const url = await ensurePaymentLink(admin, o.id);
    if (!url) redirect(`${path}?msg=Connect Fygaro in Settings first`);
    const res = await sendFromBusiness(
      admin, business.id, o.customers.phone,
      `${withRental(orderSummary(o.code, o.order_items, o.total, o.currency), o)}\n\nPay securely here: ${url}`,
      { customerId: o.customer_id, orderId: o.id },
    );
    redirect(`${path}?msg=${res.ok ? "Sent on WhatsApp" : encodeURIComponent("Not sent: " + res.error)}`);
  }

  /** Set prices for "price on request" items, recalculate the total, and optionally send the payment link. */
  async function setPrices(formData: FormData) {
    "use server";
    const { business } = await requireMembership(slug);
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id, status, order_items(id, unit_price, quantity)")
      .eq("business_id", business.id).eq("code", code).single<any>();
    if (!o) redirect(`${path}?msg=Order not found`);
    if (["paid", "fulfilled", "cancelled"].includes(o.status)) redirect(`${path}?msg=${encodeURIComponent(`This order is ${o.status}, so prices can't change`)}`);
    const updates: { id: string; price: number }[] = [];
    for (const it of o.order_items ?? []) {
      if (Number(it.unit_price) !== 0) continue;
      const raw = String(formData.get(`price_${it.id}`) ?? "").trim();
      if (!raw) continue;
      const price = Math.round(Number(raw) * 100) / 100;
      if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) redirect(`${path}?msg=${encodeURIComponent("Prices must be more than 0")}`);
      updates.push({ id: it.id, price });
    }
    if (!updates.length) redirect(`${path}?msg=${encodeURIComponent("Type a price for at least one item")}`);
    for (const u of updates) await admin.from("order_items").update({ unit_price: u.price }).eq("id", u.id).eq("order_id", o.id);
    const { data: items } = await admin.from("order_items").select("unit_price, quantity").eq("order_id", o.id);
    const cents = (items ?? []).reduce((s, i) => s + Math.round(Number(i.unit_price) * 100) * i.quantity, 0);
    // The total changed, so any old payment link is for the wrong amount.
    await admin.from("orders").update({ subtotal: cents / 100, total: cents / 100, payment_url: null }).eq("id", o.id);
    const done = !needsPrice(items ?? []);
    if (done && formData.get("send") === "on") {
      const { data: full } = await admin.from("orders").select("id, code, total, currency, customer_id, customers(phone), order_items(name, unit_price, quantity)").eq("id", o.id).single<any>();
      const phone = full?.customers?.phone;
      const url = phone && Number(full.total) > 0 ? await ensurePaymentLink(admin, o.id) : null;
      if (phone && url) {
        const res = await sendFromBusiness(admin, business.id, phone,
          `${orderSummary(full.code, full.order_items, full.total, full.currency)}\n\nPay securely here: ${url}`, { customerId: full.customer_id, orderId: o.id });
        redirect(`${path}?msg=${encodeURIComponent(`Prices set. Total ${money(cents / 100, full.currency)}. ${res.ok ? "Payment link sent on WhatsApp." : `Link not sent: ${res.error}`}`)}`);
      }
      redirect(`${path}?msg=${encodeURIComponent(`Prices set. Total ${money(cents / 100, full?.currency)}. ${!phone ? "No customer phone yet, so nothing was sent." : "Connect Fygaro in Settings to send a payment link."}`)}`);
    }
    redirect(`${path}?msg=${encodeURIComponent(done ? `Prices set. Total ${money(cents / 100, business.currency)}. Now send the payment link.` : "Saved. Some items still need a price.")}`);
  }

  async function resendReceipt() {
    "use server";
    const { business } = await requireMembership(slug);
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id").eq("business_id", business.id).eq("code", code).single();
    const res = o ? await sendReceipt(admin, o.id) : { ok: false, error: "Order not found" };
    redirect(`${path}?msg=${res.ok ? "Receipt sent on WhatsApp" : encodeURIComponent("Not sent: " + res.error)}`);
  }

  async function confirmTransfer() {
    "use server";
    const { business, role } = await requireMembership(slug);
    if (role === "staff") redirect(`${path}?msg=${encodeURIComponent("Only owners and admins can confirm a transfer")}`);
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id, transfer_reference").eq("business_id", business.id).eq("code", code).single();
    if (!o) redirect(path);
    const { data: changed } = await admin.rpc("mark_order_paid", { p_order: o.id, p_txn: `transfer:${o.transfer_reference ?? "confirmed"}` });
    if (changed) await sendReceipt(admin, o.id).catch(() => null);
    redirect(`${path}?msg=${encodeURIComponent(changed ? "Transfer confirmed. Receipt sent on WhatsApp." : "This order was already paid.")}`);
  }

  async function rejectTransfer() {
    "use server";
    const { business, role } = await requireMembership(slug);
    if (role === "staff") redirect(`${path}?msg=${encodeURIComponent("Only owners and admins can do this")}`);
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id, code, total, currency, customers(phone)").eq("business_id", business.id).eq("code", code).single<any>();
    if (!o) redirect(path);
    await admin.from("orders").update({ status: "awaiting_payment", transfer_submitted_at: null }).eq("id", o.id).eq("status", "transfer_pending");
    if (o.customers?.phone) {
      const url = await ensurePaymentLink(admin, o.id);
      await sendFromBusiness(admin, business.id, o.customers.phone,
        `We haven't received the transfer for order ${o.code} (${money(o.total, o.currency)}) yet. If you've sent it, please reply with the transfer reference number.${url ? `\nOr pay by card here: ${url}` : ""}`,
        { orderId: o.id }).catch(() => null);
    }
    redirect(`${path}?msg=${encodeURIComponent("Marked as not received. We've let the customer know.")}`);
  }

  async function setStatus(formData: FormData) {
    "use server";
    const { supabase, business } = await requireMembership(slug);
    const status = String(formData.get("status"));
    if (!(NEXT_STATUSES as readonly string[]).includes(status)) return;
    if (status === "paid") {
      // Manual "paid" (e.g. cash on pickup) goes through the same function as Fygaro, so stock and CRM stay right.
      const admin = createAdminClient();
      const { data: o } = await admin.from("orders").select("id").eq("business_id", business.id).eq("code", code).single();
      if (o) {
        const { data: changed } = await admin.rpc("mark_order_paid", { p_order: o.id, p_txn: "manual" });
        if (changed && formData.get("receipt") === "on") await sendReceipt(admin, o.id).catch(() => null);
      }
    } else {
      await supabase.from("orders").update({ status }).eq("business_id", business.id).eq("code", code);
      if (status === "ready" && formData.get("notify") === "on") {
        const admin = createAdminClient();
        const { data: o } = await admin.from("orders").select("id").eq("business_id", business.id).eq("code", code).single();
        const res = o ? await sendReadyMessage(admin, o.id) : { ok: false, error: "Order not found" };
        redirect(`${path}?msg=${encodeURIComponent(res.ok ? "Marked ready. The customer got a WhatsApp message." : `Marked ready. Message not sent: ${res.error}`)}`);
      }
    }
    revalidatePath(path);
  }

  async function notifyReady() {
    "use server";
    const { business } = await requireMembership(slug);
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id").eq("business_id", business.id).eq("code", code).single();
    const res = o ? await sendReadyMessage(admin, o.id) : { ok: false, error: "Order not found" };
    redirect(`${path}?msg=${encodeURIComponent(res.ok ? "Ready message sent on WhatsApp" : `Not sent: ${res.error}`)}`);
  }

  async function rentalStep(f: FormData) {
    "use server";
    const { business } = await requireMembership(slug);
    const step = String(f.get("step"));
    const now = new Date().toISOString();
    const patch = step === "out" ? { picked_up_at: now } : step === "back" ? { returned_at: now, status: "fulfilled" } : step === "deposit" ? { deposit_returned_at: now } : null;
    if (patch) await createAdminClient().from("orders").update(patch).eq("business_id", business.id).eq("code", code);
    redirect(`${path}?msg=${encodeURIComponent(step === "out" ? "Marked picked up" : step === "back" ? "Marked returned" : "Deposit marked as refunded")}`);
  }

  const customerPhone = order.customers?.phone as string | undefined;
  const toPrice = needsPrice(order.order_items) && !["paid", "fulfilled", "cancelled"].includes(order.status);
  const isTransfer = order.payment_method === "transfer";
  const admin = createAdminClient();
  const proofUrl = order.transfer_proof_path
    ? (await admin.storage.from("transfer-proofs").createSignedUrl(order.transfer_proof_path, 600)).data?.signedUrl ?? null
    : null;
  const { count: reused } = order.transfer_proof_hash
    ? await admin.from("orders").select("id", { count: "exact", head: true }).eq("transfer_proof_hash", order.transfer_proof_hash).neq("id", order.id)
    : { count: 0 };
  const summary = withRental(orderSummary(order.code, order.order_items, order.total, order.currency), order);
  // Rental: check nobody else holds the same units for these dates.
  let clash: string[] = [];
  if (order.rental_start && !["cancelled", "abandoned"].includes(order.status)) {
    const { data: biz } = await admin.from("businesses").select("rental_buffer_days").eq("id", business.id).single();
    const ids = order.order_items.map((i: any) => i.product_id).filter(Boolean);
    const { data: prods } = ids.length ? await admin.from("products").select("id, name, stock, rental").in("id", ids) : { data: [] as any[] };
    const bookings = await loadBookings(admin, business.id, order.rental_start, order.rental_end, biz?.rental_buffer_days ?? 0, order.id);
    const mine = order.order_items.filter((i: any) => i.product_id).map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, start: order.rental_start, end: order.rental_end }));
    clash = overbooked((prods ?? []).filter((p: any) => p.rental), bookings.concat(mine), order.rental_start, order.rental_end, biz?.rental_buffer_days ?? 0)
      .map((id) => (prods ?? []).find((p: any) => p.id === id)?.name ?? "an item");
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader n={num("orders")} title={`Order ${order.code}`} actions={<span className={`badge ${order.status}`}>{order.status.replace(/_/g, " ")}</span>} />
      {msg && <p className="ok">{msg}</p>}
      <div className="card stack">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead>
            <tbody>
              {order.order_items.map((i: any, n: number) => (
                <tr key={n}><td>{i.name}</td><td>{i.quantity}</td>
                  {Number(i.unit_price) === 0
                    ? <td colSpan={2}><span className="badge high">Price to confirm</span></td>
                    : <><td>{money(i.unit_price, order.currency)}</td><td>{money(i.unit_price * i.quantity, order.currency)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><strong>{toPrice ? `Total so far: ${money(order.total, order.currency)}` : `Total: ${money(order.total, order.currency)}`}</strong></p>
        <p className="muted">
          Customer: {order.customers?.name ?? "unknown"} {customerPhone ? `(+${customerPhone})` : "(waiting for their WhatsApp message)"}
          {" · "}Source: {order.source}{order.attribution ? ` · From: ${order.attribution}` : ""}
          {order.paid_at ? ` · Paid ${new Date(order.paid_at).toLocaleString("en-BB")}` : ""}
        </p>
        {(order.fulfillment || order.slot_at) && (
          <p style={{ margin: 0 }}><b>{order.fulfillment === "delivery" ? "Delivery" : order.fulfillment === "pickup" ? "Pickup" : "Time"}</b>
            {order.slot_at ? ` · ${new Date(order.slot_at).toLocaleString("en-GB", { timeZone: "America/Barbados", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}` : ""}
            {order.delivery_zone ? ` · ${order.delivery_zone}` : ""}{order.delivery_address ? ` · ${order.delivery_address}` : ""}</p>
        )}
      </div>

      {toPrice && (
        <form action={setPrices} className="card stack" style={{ borderColor: "#f2d9b8", background: "#fff8ec" }}>
          <h2 style={{ fontSize: 22 }}>Set prices</h2>
          <p className="muted" style={{ margin: 0 }}>These are price-on-request items. Enter the price for each (per item), then send the customer their payment link. Until then they were told you'll confirm the price.</p>
          {order.order_items.filter((i: any) => Number(i.unit_price) === 0).map((i: any) => (
            <label key={i.id} className="row" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <span>{i.quantity > 1 ? `${i.quantity} x ` : ""}{i.name}</span>
              <input name={`price_${i.id}`} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={`Price (${order.currency})`} style={{ maxWidth: 170 }} aria-label={`Price for ${i.name}`} />
            </label>
          ))}
          {customerPhone && (
            <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name="send" defaultChecked /> Send the payment link on WhatsApp once all prices are set
            </label>
          )}
          <button className="btn" style={{ alignSelf: "flex-start" }}>Save prices</button>
        </form>
      )}

      {order.rental_start && (
        <div className="card stack" style={clash.length ? { borderColor: "var(--coral)", borderWidth: 2 } : undefined}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 22 }}>Rental</h2>
            <span className={`badge ${order.returned_at ? "paid" : order.picked_up_at ? "high" : ""}`}>{order.returned_at ? "Returned" : order.picked_up_at ? "Out with customer" : "Not picked up yet"}</span>
          </div>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="kpi"><small>Pick up</small><b>{prettyDate(order.rental_start)}{order.pickup_time ? `, ${order.pickup_time}` : ""}</b></div>
            <div className="kpi"><small>Return</small><b>{prettyDate(order.rental_end)}</b></div>
            <div className="kpi"><small>Deposit</small><b>{Number(order.deposit) > 0 ? `${money(order.deposit, order.currency)}${order.deposit_returned_at ? " refunded" : ""}` : "None"}</b></div>
          </div>
          {clash.length > 0 && <p className="error" style={{ margin: 0 }}>Double booked: {clash.join(", ")} {clash.length > 1 ? "are" : "is"} held by another order on these dates. Check the rental schedule before confirming.</p>}
          <p className="muted" style={{ margin: 0 }}>{order.agreement_accepted_at ? `Rental agreement accepted ${new Date(order.agreement_accepted_at).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "No rental agreement on file for this order."}</p>
          <div className="row">
            {!order.picked_up_at && order.paid_at && <form action={rentalStep}><input type="hidden" name="step" value="out" /><button className="btn">Picked up</button></form>}
            {order.picked_up_at && !order.returned_at && <form action={rentalStep}><input type="hidden" name="step" value="back" /><button className="btn">Returned</button></form>}
            {order.returned_at && Number(order.deposit) > 0 && !order.deposit_returned_at && <form action={rentalStep}><input type="hidden" name="step" value="deposit" /><button className="btn secondary">Deposit refunded</button></form>}
            {customerPhone && !order.picked_up_at && <a className="btn secondary" target="_blank" rel="noreferrer" href={waLink(customerPhone, `Hi${order.customers?.name ? " " + order.customers.name : ""}! A reminder for order ${order.code}: pick up is ${prettyDate(order.rental_start)}${order.pickup_time ? ` at ${order.pickup_time}` : ""}. See you then!`)}>Pickup reminder</a>}
            {customerPhone && order.picked_up_at && !order.returned_at && <a className="btn secondary" target="_blank" rel="noreferrer" href={waLink(customerPhone, `Hi${order.customers?.name ? " " + order.customers.name : ""}! A reminder for order ${order.code}: please return everything on ${prettyDate(order.rental_end)}. Thank you!`)}>Return reminder</a>}
            <Link className="btn secondary" href={`/dashboard/${slug}/orders/rentals`}>Rental schedule</Link>
          </div>
        </div>
      )}

      {isTransfer && !order.paid_at && (
        <div className="card stack" style={{ borderColor: order.status === "transfer_pending" ? "var(--blue)" : undefined, borderWidth: order.status === "transfer_pending" ? 2 : undefined }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 22 }}>Bank transfer</h2>
            <span className={`badge ${order.status === "transfer_pending" ? "high" : ""}`}>{order.status === "transfer_pending" ? "Transfer to check" : "Waiting for the customer"}</span>
          </div>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="kpi"><small>Look for this amount</small><b>{money(order.total, order.currency)}</b></div>
            <div className="kpi"><small>Reference</small><b>{order.transfer_reference ?? order.code}</b></div>
            <div className="kpi"><small>Sent</small><b>{order.transfer_submitted_at ? new Date(order.transfer_submitted_at).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet"}</b></div>
          </div>
          {(reused ?? 0) > 0 && <p className="error" style={{ margin: 0 }}>Warning: this exact screenshot was already sent for {reused} other order{reused === 1 ? "" : "s"}. Check carefully.</p>}
          {proofUrl
            ? <a href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt={`Payment screenshot for order ${order.code}`} style={{ maxWidth: 280, maxHeight: 420, borderRadius: 12, border: "1px solid var(--line)" }} /></a>
            : order.status === "transfer_pending" && <p className="muted" style={{ margin: 0 }}>The customer sent a reference number, no screenshot.</p>}
          {order.status === "transfer_pending" && (
            <>
              <p style={{ margin: 0 }}><b>Check your bank account before confirming.</b> A screenshot can be edited; only money in your account counts.</p>
              <div className="row">
                <form action={confirmTransfer}><button className="btn blue">Money received: confirm and send receipt</button></form>
                <form action={rejectTransfer}><button className="btn secondary">Not received</button></form>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card stack">
        <h2 style={{ fontSize: 22 }}>Payment</h2>
        {order.payment_url ? (
          <p>Card payment link: <a href={order.payment_url} target="_blank" rel="noreferrer">open payment page</a></p>
        ) : (
          <p className="muted">No payment link yet.</p>
        )}
        <div className="row">
          {toPrice && <p className="muted" style={{ margin: 0 }}>Set the prices above first, then the payment link can be made.</p>}
          {!toPrice && !order.payment_url && <form action={createLink}><button className="btn">Create Fygaro link</button></form>}
          {customerPhone && !toPrice && order.status !== "paid" && (
            <form action={sendLink}><button className="btn coral">Send link on WhatsApp</button></form>
          )}
          {customerPhone && order.paid_at && (
            <form action={resendReceipt}><button className="btn secondary">{"Send receipt on WhatsApp"}</button></form>
          )}
          {order.paid_at && (
            <a className="btn secondary" target="_blank" rel="noreferrer" href={receiptUrl(order.id)}>View receipt</a>
          )}
          {!order.paid_at && !["cancelled", "fulfilled"].includes(order.status) && (
            <Link className="btn secondary" href={`${path}/qr`}>Show QR to pay by card</Link>
          )}
          {customerPhone && (
            <a className="btn secondary" target="_blank" rel="noreferrer"
               href={waLink(customerPhone, `${summary}${order.payment_url ? `\n\nPay securely here: ${order.payment_url}` : ""}`)}>
              Open chat with summary
            </a>
          )}
        </div>
      </div>

      <form action={setStatus} className="card row">
        <label style={{ flex: 1 }}>
          Update status
          <select name="status" defaultValue={order.status}>
            {NEXT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        {!order.paid_at && customerPhone && <label className="row" style={{ gap: 6, alignSelf: "flex-end", fontWeight: 500 }}><input type="checkbox" name="receipt" defaultChecked style={{ width: "auto" }} />Send receipt if marked paid</label>}
        {customerPhone && order.status !== "ready" && !order.ready_notified_at && <label className="row" style={{ gap: 6, alignSelf: "flex-end", fontWeight: 500 }}><input type="checkbox" name="notify" defaultChecked style={{ width: "auto" }} />Message the customer if marked ready</label>}
        <button className="btn" style={{ alignSelf: "flex-end" }}>Save</button>
      </form>
      {customerPhone && order.status === "ready" && (
        <form action={notifyReady} className="card row" style={{ justifyContent: "space-between" }}>
          <span className="muted">{order.ready_notified_at ? `Ready message sent ${new Date(order.ready_notified_at).toLocaleString("en-BB", { timeZone: "America/Barbados", dateStyle: "medium", timeStyle: "short" })}.` : "The customer hasn't been told it's ready."}</span>
          <button className="btn secondary">{order.ready_notified_at ? "Send again" : "Tell the customer it's ready"}</button>
        </form>
      )}
    </div>
  );
}
