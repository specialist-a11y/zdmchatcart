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
    .select("*, customers(id, name, phone), order_items(id, name, unit_price, quantity)")
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
      .select("id, code, total, currency, customer_id, customers(phone), order_items(name, unit_price, quantity)")
      .eq("business_id", business.id).eq("code", code).single<any>();
    if (!o?.customers?.phone) redirect(`${path}?msg=No customer phone on this order yet`);
    if (needsPrice(o.order_items ?? [])) redirect(`${path}?msg=${encodeURIComponent("Set the prices to confirm first")}`);
    if (!(Number(o.total) > 0)) redirect(`${path}?msg=${encodeURIComponent("This order's total is 0, so there's nothing to pay")}`);
    const url = await ensurePaymentLink(admin, o.id);
    if (!url) redirect(`${path}?msg=Connect Fygaro in Settings first`);
    const res = await sendFromBusiness(
      admin, business.id, o.customers.phone,
      `${orderSummary(o.code, o.order_items, o.total, o.currency)}\n\nPay securely here: ${url}`,
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

  const customerPhone = order.customers?.phone as string | undefined;
  const toPrice = needsPrice(order.order_items) && !["paid", "fulfilled", "cancelled"].includes(order.status);
  const summary = orderSummary(order.code, order.order_items, order.total, order.currency);

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

      <div className="card stack">
        <h2 style={{ fontSize: 22 }}>Payment</h2>
        {order.payment_url ? (
          <p>Fygaro link: <a href={order.payment_url} target="_blank" rel="noreferrer">open payment page</a></p>
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
