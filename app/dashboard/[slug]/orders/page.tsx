import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/order-text";
import { PageHeader, Kpi } from "@/components/CrmShell";
import { Icon } from "@/components/Icon";
import { num } from "@/lib/crm-nav";

const FILTERS = ["all", "awaiting_confirmation", "awaiting_payment", "paid", "ready", "fulfilled", "abandoned", "cancelled"] as const;
const LABEL: Record<string, string> = { awaiting_confirmation: "Awaiting confirmation", awaiting_payment: "Awaiting payment", paid: "Paid", ready: "Ready", fulfilled: "Collected", abandoned: "Cart left", cancelled: "Cancelled" };
const SOURCE: Record<string, [string, string]> = { web: ["Website", "website"], whatsapp: ["WhatsApp", "wa"], instagram: ["Instagram", "ig"], manual: ["Added by hand", "orders"] };

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const { slug } = await params;
  const { status = "all" } = await searchParams;
  const { supabase, business } = await requireMembership(slug);

  let query = supabase.from("orders")
    .select("id, code, status, source, total, currency, created_at, paid_at, attribution, customers(name, phone), order_items(quantity, unit_price)")
    .eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: orders }, { data: counts }, { data: today }] = await Promise.all([
    query,
    supabase.from("orders").select("status").eq("business_id", business.id).gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString()),
    supabase.from("orders").select("total").eq("business_id", business.id).in("status", ["paid", "ready", "fulfilled"]).gte("paid_at", since),
  ]);
  const n = (s: string) => (counts ?? []).filter((o) => s === "all" || o.status === s).length;
  const paidToday = (today ?? []).reduce((s, o) => s + Number(o.total), 0);
  const open = (counts ?? []).filter((o) => o.status === "awaiting_payment").length;

  return (
    <div className="stack">
      <PageHeader n={num("orders")} title="Orders" sub="Every order from the website, WhatsApp and Instagram, with its payment status."
        actions={<Link className="btn secondary small" href={`/s/${slug}`} target="_blank">View shop</Link>} />
      <div className="kpis">
        <Kpi label="Paid in the last 24 hours" value={money(paidToday, business.currency)} sub={`${today?.length ?? 0} orders`} tone="blue" />
        <Kpi label="Awaiting payment" value={open} sub="Links sent, not paid yet" tone={open ? "amber" : undefined} />
        <Kpi label="Orders, last 90 days" value={n("all")} />
      </div>
      <nav className="pills" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <Link key={f} href={`?status=${f}`} aria-current={f === status ? "true" : undefined}>{f === "all" ? "All" : LABEL[f]} {n(f) || ""}</Link>
        ))}
      </nav>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Came in via</th><th>Items</th><th>Total</th><th>Time</th></tr></thead>
          <tbody>
            {(orders ?? []).map((o: any) => {
              const [src, ico] = SOURCE[o.source] ?? [o.source, "orders"];
              const items = (o.order_items ?? []).reduce((s: number, i: any) => s + i.quantity, 0);
              return (
                <tr key={o.id}>
                  <td><Link href={`/dashboard/${slug}/orders/${o.code}`}><strong>{o.code}</strong></Link></td>
                  <td>{o.customers?.name ?? (o.customers?.phone ? `+${o.customers.phone}` : <span className="muted">No phone yet</span>)}</td>
                  <td><span className={`badge ${o.status}`}>{LABEL[o.status] ?? o.status}</span></td>
                  <td><span className="row" style={{ gap: 6 }}><Icon name={ico} size={15} />{src}{o.attribution ? <span className="muted">· {o.attribution}</span> : null}</span></td>
                  <td>{items} item{items === 1 ? "" : "s"}</td>
                  <td>{(o.order_items ?? []).some((i: any) => Number(i.unit_price) === 0) && !["paid", "fulfilled", "cancelled"].includes(o.status)
                    ? <span className="badge high">Price to confirm</span>
                    : money(o.total, o.currency)}</td>
                  <td className="muted">{new Date(o.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              );
            })}
            {(!orders || orders.length === 0) && <tr><td colSpan={7} className="muted wrap">No orders here yet. Share your shop link to get the first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
