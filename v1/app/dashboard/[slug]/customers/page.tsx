import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money, waLink } from "@/lib/order-text";

const STAGES = ["all", "new", "ordered", "paid", "repeat", "quiet"] as const;

export default async function CustomersPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug } = await params;
  const { stage = "all" } = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  let query = supabase
    .from("customers")
    .select("id, name, phone, stage, total_spent, order_count, last_seen_at, whatsapp_opt_in")
    .eq("business_id", business.id)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (stage !== "all") query = query.eq("stage", stage);
  const { data: customers } = await query;

  return (
    <div className="stack">
      <h1>Customers</h1>
      <nav className="nav" aria-label="Filter by stage">
        {STAGES.map((s) => (
          <Link key={s} href={`?stage=${s}`} style={s === stage ? { background: "var(--teal-soft)" } : undefined}>{s}</Link>
        ))}
      </nav>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>WhatsApp</th><th>Stage</th><th>Orders</th><th>Total spent</th><th>Last seen</th></tr></thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.name ?? <span className="muted">Unknown</span>}</td>
                <td>{c.phone ? <a href={waLink(c.phone, "")} target="_blank" rel="noreferrer">+{c.phone}</a> : "-"}</td>
                <td><span className="badge">{c.stage}</span></td>
                <td>{c.order_count}</td>
                <td>{money(c.total_spent, business.currency)}</td>
                <td className="muted">{c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString("en-BB") : "-"}</td>
              </tr>
            ))}
            {(!customers || customers.length === 0) && (
              <tr><td colSpan={6} className="muted">Customers appear here when they message you on WhatsApp or order from the shop.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
