import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money, waLink } from "@/lib/order-text";

const STAGES = ["all", "new", "ordered", "paid", "repeat", "quiet"] as const;
const ABOUT: Record<string, string> = {
  new: "Messaged you or started an order, not bought yet.",
  ordered: "Placed an order that isn't paid yet.",
  paid: "Bought once.",
  repeat: "Bought two or more times.",
  quiet: "Paid customers with no order or message for 45 days (60 days for Repeat). Checked every night. A new paid order brings them back.",
};

/** Who can get offers on WhatsApp: opted in and hasn't sent STOP. */
function Consent({ c }: { c: any }) {
  if (c.opted_out_at) return <span className="badge cancelled" title={`Sent STOP on ${new Date(c.opted_out_at).toLocaleDateString("en-BB")}`} style={{ textTransform: "none" }}>Sent STOP</span>;
  if (c.marketing_opt_in || c.whatsapp_opt_in) return <span className="badge paid" style={{ textTransform: "none" }}>✓ Offers OK</span>;
  return <span className="badge low" style={{ textTransform: "none" }}>Orders only</span>;
}

export default async function CustomersPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string; tag?: string }>;
}) {
  const { slug } = await params;
  const { stage: raw = "all", tag } = await searchParams;
  const stage = (STAGES as readonly string[]).includes(raw) ? raw : "all";
  const { supabase, business } = await requireMembership(slug);
  const list = (cols: string) => {
    let q = supabase.from("customers").select(cols).eq("business_id", business.id)
      .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(200);
    if (stage !== "all") q = q.eq("stage", stage);
    if (tag) q = q.contains("tags", [tag]);
    return q;
  };
  const base = "id, name, phone, tags, stage, total_spent, order_count, last_seen_at, whatsapp_opt_in, marketing_opt_in";
  let { data: customers, error } = await list(`${base}, opted_out_at`);
  if (error) customers = (await list(base)).data; // before migration 0014
  const { data: stages } = await supabase.from("customers").select("stage").eq("business_id", business.id).limit(10000);
  const counts = (stages ?? []).reduce<Record<string, number>>((m, c: any) => ((m[c.stage] = (m[c.stage] ?? 0) + 1), m), {});
  const rows = (customers ?? []) as any[];
  const reachable = rows.filter((c) => !c.opted_out_at && (c.marketing_opt_in || c.whatsapp_opt_in)).length;

  return (
    <div className="stack">
      <PageHeader n={num("customers")} title="Customers" sub="Everyone who has ordered or messaged, by stage." />
      <nav className="pills" aria-label="Filter by stage">
        {STAGES.map((s) => (
          <Link key={s} href={`?stage=${s}`} aria-current={s === stage ? "true" : undefined}>
            {s} {s === "all" ? (stages ?? []).length : counts[s] ?? 0}
          </Link>
        ))}
      </nav>
      {stage !== "all" && <p className="muted" style={{ margin: 0 }}>{ABOUT[stage]}</p>}
      {tag && <p style={{ margin: 0 }}>Tagged <span className="badge" style={{ textTransform: "none" }}>{tag}</span> <Link href={`?stage=${stage}`}>Show everyone</Link></p>}
      {rows.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{reachable} of {rows.length} shown can get offers on WhatsApp. Customers who reply STOP only get messages about their own orders.</p>}
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Name</th><th>WhatsApp</th><th>Stage</th><th>Offers</th><th>Orders</th><th>Total spent</th><th>Last seen</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/dashboard/${slug}/customers/${c.id}`}><b>{c.name ?? (c.phone ? `+${c.phone}` : "Unknown")}</b></Link>{(c.tags ?? []).slice(0, 3).map((t: string) => <span key={t} className="badge" style={{ textTransform: "none", marginLeft: 4, fontSize: 11 }}>{t}</span>)}</td>
                <td>{c.phone ? <a href={waLink(c.phone, "")} target="_blank" rel="noreferrer">+{c.phone}</a> : "-"}</td>
                <td><span className="badge">{c.stage}</span></td>
                <td><Consent c={c} /></td>
                <td>{c.order_count}</td>
                <td>{money(c.total_spent, business.currency)}</td>
                <td className="muted">{c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString("en-BB") : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">{stage === "quiet" ? "No quiet customers. The nightly check moves paid customers here after 45 days without an order or message." : "Customers appear here when they message you on WhatsApp or order from the shop."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
