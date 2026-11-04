import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePaymentLink, sendFromBusiness } from "@/lib/payments";
import { money, orderSummary, waLink } from "@/lib/order-text";

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
    .select("*, customers(id, name, phone), order_items(name, unit_price, quantity)")
    .eq("business_id", business.id)
    .eq("code", code)
    .maybeSingle();
  if (!order) notFound();
  const path = `/dashboard/${slug}/orders/${code}`;

  async function createLink() {
    "use server";
    const { business } = await requireMembership(slug); // re-check on every action
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("id").eq("business_id", business.id).eq("code", code).single();
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
    const url = await ensurePaymentLink(admin, o.id);
    if (!url) redirect(`${path}?msg=Connect Fygaro in Settings first`);
    const res = await sendFromBusiness(
      admin, business.id, o.customers.phone,
      `${orderSummary(o.code, o.order_items, o.total, o.currency)}\n\nPay securely here: ${url}`,
      { customerId: o.customer_id, orderId: o.id },
    );
    redirect(`${path}?msg=${res.ok ? "Sent on WhatsApp" : encodeURIComponent("Not sent: " + res.error)}`);
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
      if (o) await admin.rpc("mark_order_paid", { p_order: o.id, p_txn: "manual" });
    } else {
      await supabase.from("orders").update({ status }).eq("business_id", business.id).eq("code", code);
    }
    revalidatePath(path);
  }

  const customerPhone = order.customers?.phone as string | undefined;
  const summary = orderSummary(order.code, order.order_items, order.total, order.currency);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Order {order.code}</h1>
        <span className={`badge ${order.status}`}>{order.status.replace(/_/g, " ")}</span>
      </div>
      {msg && <p className="ok">{msg}</p>}
      <div className="card stack">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead>
            <tbody>
              {order.order_items.map((i: any, n: number) => (
                <tr key={n}><td>{i.name}</td><td>{i.quantity}</td><td>{money(i.unit_price, order.currency)}</td><td>{money(i.unit_price * i.quantity, order.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><strong>Total: {money(order.total, order.currency)}</strong></p>
        <p className="muted">
          Customer: {order.customers?.name ?? "unknown"} {customerPhone ? `(+${customerPhone})` : "(waiting for their WhatsApp message)"}
          {" · "}Source: {order.source}{order.attribution ? ` · From: ${order.attribution}` : ""}
          {order.paid_at ? ` · Paid ${new Date(order.paid_at).toLocaleString("en-BB")}` : ""}
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: 22 }}>Payment</h2>
        {order.payment_url ? (
          <p>Fygaro link: <a href={order.payment_url} target="_blank" rel="noreferrer">open payment page</a></p>
        ) : (
          <p className="muted">No payment link yet.</p>
        )}
        <div className="row">
          {!order.payment_url && <form action={createLink}><button className="btn">Create Fygaro link</button></form>}
          {customerPhone && order.status !== "paid" && (
            <form action={sendLink}><button className="btn coral">Send link on WhatsApp</button></form>
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
        <button className="btn" style={{ alignSelf: "flex-end" }}>Save</button>
      </form>
    </div>
  );
}
