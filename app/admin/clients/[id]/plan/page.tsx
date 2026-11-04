import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, money } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewChange, todayIn } from "@/lib/billing";
import { changeClientPlan } from "../../../actions";

export default async function ChangePlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { msg } = await searchParams;
  const admin = createAdminClient();
  const [{ data: b }, { data: sub }, { data: plans }] = await Promise.all([
    admin.from("businesses").select("id, name, contact_name").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("*").eq("business_id", id).maybeSingle(),
    admin.from("plans").select("*").eq("active", true).order("rank"),
  ]);
  if (!b || !sub || !plans) notFound();
  const today = todayIn();
  const current = plans.find((p) => p.id === sub.plan_id) ?? { ...plans[0], id: sub.plan_id };
  const lite = (p: any) => ({ id: p.id, name: p.name, monthly_price: Number(p.monthly_price), rank: p.rank });
  const base = { from: lite(current), periodStart: sub.current_period_start, periodEnd: sub.current_period_end, today, existingCredit: Number(sub.credit) };

  return (
    <>
      <div>
        <p className="muted" style={{ margin: 0 }}><Link href="/admin">Clients</Link> / <Link href={`/admin/clients/${id}`}>{b.name}</Link> /</p>
        <h1>Change plan</h1>
        <p className="muted" style={{ margin: 0 }}>Now on {current.name}, period {sub.current_period_start} to {sub.current_period_end}. Every change is logged and shown to the client.</p>
      </div>
      {msg && <p className="error">{msg}</p>}
      <form action={changeClientPlan} className="stack">
        <input type="hidden" name="business_id" value={id} />
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th /><th>Plan</th><th>Monthly</th><th>Includes</th><th>If it starts today</th><th>If it starts at renewal</th></tr></thead>
            <tbody>
              {plans.map((p) => {
                const now = previewChange({ ...base, to: lite(p), timing: "now" });
                const later = previewChange({ ...base, to: lite(p), timing: "renewal" });
                const isCurrent = p.id === sub.plan_id;
                return (
                  <tr key={p.id} style={isCurrent ? { background: "var(--teal-soft)" } : undefined}>
                    <td><input type="radio" name="plan" value={p.id} defaultChecked={isCurrent} aria-label={p.name} /></td>
                    <td><strong>{p.name}</strong> {isCurrent && <span className="badge paid">Current</span>} {!isCurrent && <span className={`badge ${now.direction === "downgrade" ? "high" : ""}`}>{now.direction}</span>}</td>
                    <td>{money(p.monthly_price)}</td>
                    <td className="muted">{p.description}</td>
                    <td>{isCurrent ? "–" : now.chargeNow > 0 ? `Charge ${money(now.chargeNow)} now` : now.creditNow > 0 ? `Credit ${money(now.creditNow)}` : "No charge"}</td>
                    <td>{isCurrent ? (sub.pending_plan_id ? "Cancels the scheduled change" : "–") : `From ${later.effectiveOn}, next invoice ${money(later.nextInvoice)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card stack" style={{ maxWidth: 640 }}>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: 8 }}>When</legend>
            <label style={{ flexDirection: "row", alignItems: "flex-start", fontWeight: 400 }}><input type="radio" name="timing" value="now" defaultChecked /> <span><strong>Today.</strong> Upgrades charge the prorated difference by Fygaro link. Downgrades credit the unused days to the next invoice.</span></label>
            <label style={{ flexDirection: "row", alignItems: "flex-start", fontWeight: 400 }}><input type="radio" name="timing" value="renewal" /> <span><strong>At renewal, {sub.current_period_end}.</strong> Best for downgrades: they keep what they paid for until then.</span></label>
          </fieldset>
          <label>Reason (for your records)<input name="reason" placeholder="Budget, quieter season" /></label>
          <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="notify" defaultChecked /> Tell {b.contact_name ?? "the owner"} on WhatsApp</label>
          <div className="row"><Link className="btn secondary" href={`/admin/clients/${id}`}>Cancel</Link><button className="btn blue">Confirm change</button></div>
        </div>
      </form>
    </>
  );
}
