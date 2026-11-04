import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/order-text";

const FILTERS = ["all", "awaiting_confirmation", "awaiting_payment", "paid", "ready", "fulfilled", "abandoned", "cancelled"] as const;

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { status = "all" } = await searchParams;
  const { supabase, business } = await requireMembership(slug);

  let query = supabase
    .from("orders")
    .select("id, code, status, source, total, currency, created_at, paid_at, customers(name, phone)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: orders } = await query;

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: today } = await supabase
    .from("orders")
    .select("total")
    .eq("business_id", business.id)
    .eq("status", "paid")
    .gte("paid_at", since);
  const paidToday = (today ?? []).reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Orders</h1>
        <div className="card" style={{ padding: "10px 16px" }}>
          Last 24 hours: <strong>{today?.length ?? 0} paid</strong>, <strong>{money(paidToday, business.currency)}</strong>
        </div>
      </div>
      <nav className="nav" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <Link key={f} href={`?status=${f}`} style={f === status ? { background: "var(--teal-soft)" } : undefined}>
            {f.replace(/_/g, " ")}
          </Link>
        ))}
      </nav>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Order</th><th>Customer</th><th>Status</th><th>Source</th><th>Total</th><th>Created</th></tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o: any) => (
              <tr key={o.id}>
                <td><Link href={`/dashboard/${slug}/orders/${o.code}`}><strong>{o.code}</strong></Link></td>
                <td>{o.customers?.name ?? o.customers?.phone ?? <span className="muted">Not yet in chat</span>}</td>
                <td><span className={`badge ${o.status}`}>{o.status.replace(/_/g, " ")}</span></td>
                <td>{o.source}</td>
                <td>{money(o.total, o.currency)}</td>
                <td className="muted">{new Date(o.created_at).toLocaleString("en-BB")}</td>
              </tr>
            ))}
            {(!orders || orders.length === 0) && (
              <tr><td colSpan={6} className="muted">No orders here yet. Share your shop link to get the first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
