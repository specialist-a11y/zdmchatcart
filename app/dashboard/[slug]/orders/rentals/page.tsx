import Link from "next/link";
import { gateSection } from "@/components/PlanLock";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/billing";
import { addDays, availability, holdsUnits, prettyDate, schedule } from "@/lib/rental";

const DAYS = 21;
const GRID = 14;

export default async function RentalSchedule({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> }) {
  const { slug } = await params;
  const lock = await gateSection(slug, "orders");
  if (lock) return lock;
  const sp = await searchParams;
  const { business } = await requireMembership(slug);
  const admin = createAdminClient();
  const today = todayIn();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : today;
  const to = addDays(from, DAYS);
  const base = `/dashboard/${slug}`;

  const [{ data: biz }, { data: products }, { data: orders }, { data: out }] = await Promise.all([
    admin.from("businesses").select("rental_buffer_days").eq("id", business.id).single(),
    admin.from("products").select("id, name, stock").eq("business_id", business.id).eq("rental", true).order("sort_order"),
    admin.from("orders")
      .select("id, code, status, created_at, paid_at, rental_start, rental_end, pickup_time, picked_up_at, returned_at, customers(name, phone), order_items(product_id, name, quantity)")
      .eq("business_id", business.id).not("rental_start", "is", null)
      .lt("rental_start", to).gt("rental_end", addDays(from, -7)).not("status", "in", "(cancelled,abandoned)")
      .order("rental_start").limit(1000),
    admin.from("orders")
      .select("id, code, rental_end, customers(name, phone), order_items(name, quantity)")
      .eq("business_id", business.id).not("picked_up_at", "is", null).is("returned_at", null).order("rental_end"),
  ]);
  const holding = (orders ?? []).filter((o: any) => holdsUnits(o.status, o.created_at));
  const days = schedule(holding as any[], from, DAYS);
  const buffer = biz?.rental_buffer_days ?? 0;
  const bookings = holding.flatMap((o: any) => (o.order_items ?? []).filter((i: any) => i.product_id).map((i: any) => ({ product_id: i.product_id, quantity: i.quantity, start: o.rental_start, end: o.rental_end })));
  const grid = Array.from({ length: GRID }, (_, i) => addDays(from, i));

  const who = (o: any) => o.customers?.name || (o.customers?.phone ? `+${o.customers.phone}` : "Customer");
  const items = (o: any) => (o.order_items ?? []).filter((i: any) => i.product_id).map((i: any) => `${i.quantity} x ${i.name}`).join(", ");
  const Row = ({ o, kind }: { o: any; kind: "pickup" | "return" }) => (
    <Link href={`${base}/orders/${o.code}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <span><strong>{kind === "pickup" ? "Pick up" : "Return"}{kind === "pickup" && o.pickup_time ? ` ${o.pickup_time}` : ""} · {o.code}</strong> · {who(o)}<br /><span className="muted" style={{ fontSize: 13 }}>{items(o)}</span></span>
      <span className={`badge ${o.paid_at ? "paid" : "high"}`}>{o.paid_at ? (kind === "return" && o.returned_at ? "back" : kind === "pickup" && o.picked_up_at ? "out" : "paid") : "not paid"}</span>
    </Link>
  );

  return (
    <div className="stack">
      <PageHeader n={num("orders")} title="Rental schedule" sub="What goes out and comes back, and what's free on each day."
        actions={<><Link className="btn small secondary" href={`${base}/orders/rentals?from=${addDays(from, -7)}`}>‹ Week</Link><Link className="btn small secondary" href={`${base}/orders/rentals`}>Today</Link><Link className="btn small secondary" href={`${base}/orders/rentals?from=${addDays(from, 7)}`}>Week ›</Link></>} />
      <Link href={`${base}/orders`}>‹ Back to orders</Link>

      {!products?.length ? (
        <div className="card stack"><h2>No rental items yet</h2><p className="muted" style={{ margin: 0 }}>Open Products, pick an item and tick “Rent this out” under Rental settings.</p><Link className="btn small" style={{ alignSelf: "flex-start" }} href={`${base}/products`}>Products</Link></div>
      ) : (
        <>
          {(out ?? []).length > 0 && (
            <section className="card stack">
              <h2>Out with customers ({out!.length})</h2>
              {out!.map((o: any) => (
                <Link key={o.id} href={`${base}/orders/${o.code}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <span><strong>{o.code}</strong> · {who(o)} · {(o.order_items ?? []).filter((i: any) => i.name !== "Refundable deposit").map((i: any) => `${i.quantity} x ${i.name}`).join(", ")}</span>
                  <span className={`badge ${o.rental_end < today ? "overdue" : o.rental_end === today ? "high" : ""}`}>{o.rental_end < today ? `late, due ${prettyDate(o.rental_end)}` : o.rental_end === today ? "due back today" : `back ${prettyDate(o.rental_end)}`}</span>
                </Link>
              ))}
            </section>
          )}

          <section className="card table-wrap" style={{ padding: 0 }}>
            <table className="rental-grid">
              <thead><tr><th>Free each day</th>{grid.map((d) => <th key={d} style={d === today ? { color: "var(--blue)" } : undefined}>{prettyDate(d).replace(" ", " ")}</th>)}</tr></thead>
              <tbody>
                {products!.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{p.stock ?? 1} owned</span></td>
                    {grid.map((d) => {
                      const f = availability([p], bookings, d, addDays(d, 1), buffer)[p.id];
                      const owned = p.stock ?? 1;
                      return <td key={d} className={f === 0 ? "full" : f < owned ? "part" : "free"} title={`${f} of ${owned} free`}>{f}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card stack">
            <h2>Next {DAYS} days</h2>
            {days.length === 0 && <p className="muted" style={{ margin: 0 }}>No pickups or returns booked from {prettyDate(from)}.</p>}
            {days.map((d) => (
              <div key={d.date} className="stack" style={{ gap: 6 }}>
                <strong style={{ marginTop: 6 }}>{d.date === today ? "Today" : d.date === addDays(today, 1) ? "Tomorrow" : prettyDate(d.date)}</strong>
                {d.pickups.map((o: any) => <Row key={`p${o.id}`} o={o} kind="pickup" />)}
                {d.returns.map((o: any) => <Row key={`r${o.id}`} o={o} kind="return" />)}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
