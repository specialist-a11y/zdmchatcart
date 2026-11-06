import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import Link from "next/link";
import { requireStaff, money } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { addClient } from "./actions";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ msg?: string; q?: string }> }) {
  await requireStaff();
  const { msg, q } = await searchParams;
  const admin = createAdminClient();
  const [{ data: subs }, { data: plans }, { data: tickets }, { data: overdue }] = await Promise.all([
    admin.from("subscriptions").select("business_id, plan_id, status, current_period_end, pending_plan_id, businesses(name, slug, contact_name, contact_phone)"),
    admin.from("plans").select("id, name, monthly_price, rank").order("rank"),
    admin.from("support_tickets").select("business_id").neq("status", "resolved"),
    admin.from("invoices").select("business_id").eq("status", "overdue"),
  ]);
  const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
  const openBy = new Map<string, number>();
  for (const t of tickets ?? []) openBy.set(t.business_id, (openBy.get(t.business_id) ?? 0) + 1);
  const overdueSet = new Set((overdue ?? []).map((i) => i.business_id));
  const rows = (subs ?? [])
    .map((s: any) => ({ ...s, plan: planMap.get(s.plan_id), pending: s.pending_plan_id ? planMap.get(s.pending_plan_id) : null }))
    .filter((s: any) => !q || s.businesses?.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a: any, b: any) => (a.businesses?.name ?? "").localeCompare(b.businesses?.name ?? ""));
  const live = rows.filter((r: any) => r.status === "active" || r.status === "past_due");
  const mrr = live.reduce((n: number, r: any) => n + Number(r.plan?.monthly_price ?? 0), 0);
  const health = (r: any) =>
    overdueSet.has(r.business_id) || r.status === "past_due" ? ["Payment overdue", "overdue"] :
    r.status === "pending_payment" ? ["New signup, setup unpaid", "high"] :
    r.status !== "active" ? [r.status, r.status] :
    openBy.get(r.business_id) ? [`${openBy.get(r.business_id)} open ticket${openBy.get(r.business_id)! > 1 ? "s" : ""}`, "sent"] : ["Healthy", ""];

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <PageHeader n={adminNum("/admin")} title="Clients" sub={`Most agencies run campaigns. We build systems. Every client, in one place.`} />
        <form className="row"><input name="q" defaultValue={q} placeholder="Search clients" /><button className="btn secondary small">Search</button></form>
      </div>
      {msg && <p className="ok">{msg}</p>}
      <div className="kpis">
        <div className="kpi"><span>Active clients</span><b>{live.length}</b></div>
        <div className="kpi" style={{ background: "var(--teal-soft)" }}><span>Monthly recurring</span><b>{money(mrr)}</b></div>
        <div className="kpi"><span>Open tickets</span><b>{tickets?.length ?? 0}</b></div>
        <div className="kpi" style={{ background: "#fff8ec" }}><span>Overdue invoices</span><b>{overdue?.length ?? 0}</b></div>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Client</th><th>Plan</th><th>Monthly</th><th>Status</th><th>Renews</th><th>Owner</th><th /></tr></thead>
          <tbody>
            {rows.map((r: any) => {
              const [label, cls] = health(r);
              return (
                <tr key={r.business_id}>
                  <td><strong>{r.businesses?.name}</strong><br /><span className="muted">/s/{r.businesses?.slug}</span></td>
                  <td>{r.plan?.name}{r.pending && <><br /><span className="muted">to {r.pending.name} at renewal</span></>}</td>
                  <td>{money(r.plan?.monthly_price ?? 0)}</td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                  <td>{r.current_period_end}</td>
                  <td>{r.businesses?.contact_name ?? <span className="muted">not set</span>}</td>
                  <td><Link href={`/admin/clients/${r.business_id}`}>Open ›</Link></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No clients yet. Add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>

      <form action={addClient} className="card stack" style={{ maxWidth: 760 }}>
        <h2>Add client</h2>
        <p className="muted" style={{ margin: 0 }}>Creates the shop, sets the plan and emails the owner an invite to their CRM.</p>
        <div className="cols">
          <label>Business name<input name="name" required /></label>
          <label>Shop address<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="island-crumb" /></label>
          <label>Order prefix<input name="prefix" required pattern="[A-Za-z]{1,4}" placeholder="IC" /></label>
          <label>Plan<select name="plan" defaultValue="starter">{(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.monthly_price)}</option>)}</select></label>
          <label>Owner name<input name="contact_name" required /></label>
          <label>Owner WhatsApp (with country code)<input name="contact_phone" required placeholder="1 246 555 0123" /></label>
          <label>Owner email<input name="contact_email" type="email" required /></label>
        </div>
        <button className="btn blue" style={{ alignSelf: "flex-start" }}>Create client and send invite</button>
      </form>
    </>
  );
}
