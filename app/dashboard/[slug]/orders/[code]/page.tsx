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
import { money, needsPrice, orderSummary } from "@/lib/order-text";
import { insideServiceWindow } from "@/lib/whatsapp";
import { orderPath } from "@/lib/order-link";
import { applyPayment, balanceDue, METHOD_LABEL, type PaymentMethod } from "@/lib/part-payments";
import { expandKits, overbooked, prettyDate, withRental } from "@/lib/rental";
import { loadBookings, loadRentalCatalog } from "@/lib/rental-server";

const NEXT_STATUSES = ["awaiting_payment", "paid", "ready", "fulfilled", "cancelled"] as const;

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { slug, code } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
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

  /** Pickup or return reminder, sent from the business's WhatsApp number (Cloud API), logged in the Inbox. */
  async function sendRentalReminder(f: FormData) {
    "use server";
    const { business } = await requireMembership(slug);
    const admin = createAdminClient();
    const kind = String(f.get("kind")) === "return" ? "return" : "pickup";
    const { data: o } = await admin.from("orders").select("id, code, customer_id, rental_start, rental_end, pickup_time, customers(name, phone)")
      .eq("business_id", business.id).eq("code", code).single<any>();
    if (!o?.customers?.phone || !o.rental_start) redirect(`${path}?msg=${encodeURIComponent("No customer WhatsApp number on this order yet")}`);
    // WhatsApp only allows a written message within 24 hours of the customer's last message.
    const { data: last } = await admin.from("messages").select("created_at").eq("business_id", business.id).eq("customer_id", o.customer_id)
      .eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!insideServiceWindow(last?.created_at)) redirect(`${path}?msg=${encodeURIComponent("Not sent: the customer hasn't messaged in the last 24 hours, so WhatsApp only allows approved templates. Ask them to message you, or call them.")}`);
    const hi = `Hi${o.customers.name ? " " + String(o.customers.name).split(" ")[0] : ""}!`;
    const body = kind === "pickup"
      ? `${hi} A reminder for order ${o.code}: pick up is ${prettyDate(o.rental_start)}${o.pickup_time ? ` at ${o.pickup_time}` : ""}. See you then!`
      : `${hi} A reminder for order ${o.code}: please return everything on ${prettyDate(o.rental_end)}. Thank you!`;
    const res = await sendFromBusiness(admin, business.id, o.customers.phone, body, { customerId: o.customer_id, orderId: o.id, sentBy: "person" });
    redirect(`${path}?msg=${encodeURIComponent(res.ok ? `${kind === "pickup" ? "Pickup" : "Return"} reminder sent on WhatsApp` : "Not sent: " + res.error)}`);
  }

  /** Owner records money that actually arrived (1st Pay, bank or cash). Part payments keep a balance; the last one marks the order paid. */
  async function recordPayment(f: FormData) {
    "use server";
    const { business, role, user } = await requireMembership(slug);
    if (role === "staff") redirect(`${path}?msg=${encodeURIComponent("Only owners and admins can record payments")}#payments`);
    const admin = createAdminClient();
    const { data: o, error: oErr } = await admin.from("orders").select("id, total, currency, status, paid_at, amount_paid, transfer_reference")
      .eq("business_id", business.id).eq("code", code).single<any>();
    if (oErr) redirect(`${path}?msg=${encodeURIComponent("Couldn't record it. Run migration 0026_part_payments.sql first.")}#payments`);
    if (!o || o.paid_at || ["cancelled"].includes(o.status)) redirect(`${path}?msg=${encodeURIComponent("This order is already paid in full")}#payments`);
    const r = applyPayment(o.total, o.amount_paid, String(f.get("amount") ?? ""));
    if ("error" in r) redirect(`${path}?msg=${encodeURIComponent(`Not recorded: ${r.error}`)}#payments`);
    const method = (["transfer", "cash"].includes(String(f.get("method"))) ? String(f.get("method")) : "transfer") as PaymentMethod;
    const reference = String(f.get("reference") ?? "").trim().slice(0, 80) || null;
    const { error } = await admin.from("order_payments").insert({ business_id: business.id, order_id: o.id, amount: r.amount, method, reference, recorded_by: user?.id ?? null });
    if (error) redirect(`${path}?msg=${encodeURIComponent("Couldn't record it. Run migration 0026_part_payments.sql first.")}#payments`);
    // A new card link must be for the balance, so the old one is cleared.
    await admin.from("orders").update({
      amount_paid: r.paid, payment_url: null,
      ...(r.full ? {} : { status: "awaiting_payment", transfer_submitted_at: null }),
    }).eq("id", o.id);
    if (r.full) await admin.rpc("mark_order_paid", { p_order: o.id, p_txn: method === "cash" ? "manual" : `transfer:${reference ?? o.transfer_reference ?? "confirmed"}` });
    const sent = f.get("send") === "on" ? await sendReceipt(admin, o.id).catch(() => ({ ok: false })) : null;
    const what = r.full ? `Paid in full.` : `Recorded ${money(r.amount, o.currency)}. Balance ${money(r.balance, o.currency)}.`;
    redirect(`${path}?msg=${encodeURIComponent(`${what}${sent ? (sent.ok ? " Receipt sent on WhatsApp." : " Receipt not sent on WhatsApp.") : ""}`)}#payments`);
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
  const paidSoFar = order.paid_at ? Number(order.total) : Number(order.amount_paid ?? 0);
  const balance = balanceDue(order.total, paidSoFar);
  const { data: payments } = await createAdminClient().from("order_payments").select("id, amount, method, reference, created_at")
    .eq("order_id", order.id).order("created_at").then((r) => r, () => ({ data: null }));
  const toPrice = needsPrice(order.order_items) && !["paid", "fulfilled", "cancelled"].includes(order.status);
  const isTransfer = order.payment_method === "transfer";
  const admin = createAdminClient();
  const proofUrl = order.transfer_proof_path
    ? (await admin.storage.from("transfer-proofs").createSignedUrl(order.transfer_proof_path, 600)).data?.signedUrl ?? null
    : null;
  const { count: reused } = order.transfer_proof_hash
    ? await admin.from("orders").select("id", { count: "exact", head: true }).eq("transfer_proof_hash", order.transfer_proof_hash).neq("id", order.id)
    : { count: 0 };
  // Rental: check nobody else holds the same units for these dates.
  let clash: string[] = [];
  if (order.rental_start && !["cancelled", "abandoned"].includes(order.status)) {
    const { data: biz } = await admin.from("businesses").select("rental_buffer_days").eq("id", business.id).single();
    const { products: prods, kits } = await loadRentalCatalog(admin, business.id);
    const bookings = await loadBookings(admin, business.id, order.rental_start, order.rental_end, biz?.rental_buffer_days ?? 0, order.id);
    const mine = order.order_items.filter((i: any) => i.product_id).map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, start: order.rental_start, end: order.rental_end }));
    // Only items this order holds (directly or inside a package) can clash because of it.
    const held = new Set(expandKits(mine, kits).map((b) => b.product_id));
    clash = overbooked(prods.filter((p) => held.has(p.id)), expandKits(bookings.concat(mine), kits), order.rental_start, order.rental_end, biz?.rental_buffer_days ?? 0)
      .map((id) => prods.find((p) => p.id === id)?.name ?? "an item");
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader n={num("orders")} title={`Order ${order.code}`} actions={<span className={`badge ${order.status}`}>{order.status.replace(/_/g, " ")}</span>} />
      {msg && <p className={/^(Not sent|Not recorded|Couldn|Only owners|No customer|Connect|Set the)/.test(msg) ? "error" : "ok"}>{msg}</p>}
      {order.no_whatsapp && (
        <div className="card stack" style={{ borderColor: "var(--blue)", borderWidth: 2 }}>
          <b>This customer doesn&apos;t use WhatsApp</b>
          <p style={{ margin: 0 }}>
            Call {customerPhone ? <a href={`tel:+${customerPhone}`}>+{customerPhone}</a> : "them"}
            {order.contact_email ? <> or email <a href={`mailto:${order.contact_email}?subject=${encodeURIComponent(`Your order ${order.code}`)}&body=${encodeURIComponent(`Your order page: ${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}${orderPath(order.id)}`)}`}>{order.contact_email}</a></> : null}.
            {" "}WhatsApp reminders and receipts won&apos;t reach them.
          </p>
          <p className="muted" style={{ margin: 0 }}>They follow the order, pay and send their transfer screenshot on <a href={orderPath(order.id)} target="_blank" rel="noreferrer">their order page</a>.</p>
        </div>
      )}

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
            {customerPhone && !order.picked_up_at && <form action={sendRentalReminder}><input type="hidden" name="kind" value="pickup" /><button className="btn secondary">Send pickup reminder</button></form>}
            {customerPhone && order.picked_up_at && !order.returned_at && <form action={sendRentalReminder}><input type="hidden" name="kind" value="return" /><button className="btn secondary">Send return reminder</button></form>}
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
              <p className="muted" style={{ margin: 0 }}>Only part of it arrived? Record the amount under <a href="#payments">Payments received</a> below. The receipt shows what's been paid and the balance.</p>
            </>
          )}
        </div>
      )}

      {Number(order.total) > 0 && order.status !== "cancelled" && !toPrice && (!order.paid_at || (payments ?? []).length > 0) && (
        <div id="payments" className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 22 }}>Payments received</h2>
            <span className={`badge ${balance === 0 ? "paid" : paidSoFar > 0 ? "high" : ""}`}>{balance === 0 ? "Paid in full" : paidSoFar > 0 ? "Part paid" : "Nothing yet"}</span>
          </div>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="kpi"><small>Total</small><b>{money(order.total, order.currency)}</b></div>
            <div className="kpi"><small>Paid so far</small><b>{money(paidSoFar, order.currency)}</b></div>
            <div className="kpi"><small>Balance</small><b>{money(balance, order.currency)}</b></div>
          </div>
          {(payments ?? []).map((p: any) => (
            <div key={p.id} className="row" style={{ justifyContent: "space-between", fontSize: 14, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span>{new Date(p.created_at).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span>{METHOD_LABEL[p.method as PaymentMethod] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
              <b>{money(p.amount, order.currency)}</b>
            </div>
          ))}
          {balance > 0 && role !== "staff" && (
            <form action={recordPayment} className="stack" style={{ gap: 8 }}>
              <p className="muted" style={{ margin: 0 }}>Check your bank or 1st Pay first. Enter only the money that is in your account.</p>
              <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                <label style={{ flex: "1 1 140px" }}>Amount received ({order.currency})<input name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} required /></label>
                <label style={{ flex: "1 1 180px" }}>How they paid<select name="method" defaultValue="transfer"><option value="transfer">1st Pay / bank transfer</option><option value="cash">Cash</option></select></label>
                <label style={{ flex: "1 1 160px" }}>Reference (optional)<input name="reference" maxLength={80} defaultValue={order.transfer_reference ?? ""} /></label>
              </div>
              {customerPhone && <label className="row" style={{ gap: 8, fontWeight: 500 }}><input type="checkbox" name="send" defaultChecked style={{ width: 20, height: 20 }} />Send the receipt on WhatsApp</label>}
              <button className="btn blue" style={{ alignSelf: "flex-start" }}>Record payment</button>
            </form>
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
          {order.customer_id && (
            <Link className="btn secondary" href={`/dashboard/${slug}/inbox?c=${order.customer_id}`}>Open chat in Inbox</Link>
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
