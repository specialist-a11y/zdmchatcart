import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import { requireStaff, money } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayIn } from "@/lib/billing";
import { zdmBankDetails, zdmFygaro } from "@/lib/zdm-billing";
import { FEATURES } from "@/lib/plan-features";
import { confirmInvoiceTransfer, newInvoice, rejectInvoiceTransfer, remindInvoice, runBillingNow, savePlan, saveZdmBank, setInvoiceStatus } from "../actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ msg?: string; s?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const manager = staff.role === "owner" || staff.role === "manager";
  const admin = createAdminClient();
  const monthStart = `${todayIn().slice(0, 7)}-01`;
  const status = ["sent", "overdue", "paid", "void"].includes(sp.s ?? "") ? sp.s : null;
  let iq = admin.from("invoices").select("*, businesses(name)").order("created_at", { ascending: false }).limit(100);
  if (status) iq = iq.eq("status", status);
  const [{ data: plans }, { data: subs }, { data: invoices }, { data: changes }, { data: clients }] = await Promise.all([
    admin.from("plans").select("*").order("rank"),
    admin.from("subscriptions").select("plan_id, status"),
    iq,
    admin.from("plan_changes").select("*, businesses(name)").gte("created_at", monthStart).order("created_at", { ascending: false }),
    admin.from("businesses").select("id, name").order("name"),
  ]);
  const [{ data: bank }, { data: transfers }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "zdm_bank_details").maybeSingle(),
    admin.from("invoices").select("id, number, amount, currency, description, transfer_reference, transfer_proof_path, transfer_submitted_at, businesses(name)").not("transfer_submitted_at", "is", null).in("status", ["sent", "overdue"]).order("transfer_submitted_at"),
  ]);
  const proofs = new Map<string, string>();
  for (const t of transfers ?? []) {
    if (!t.transfer_proof_path) continue;
    const { data: u } = await admin.storage.from("transfer-proofs").createSignedUrl(t.transfer_proof_path, 3600);
    if (u?.signedUrl) proofs.set(t.id, u.signedUrl);
  }
  const bankOn = !!(await zdmBankDetails(admin));
  const price = new Map((plans ?? []).map((p) => [p.id, Number(p.monthly_price)]));
  const live = (subs ?? []).filter((s) => s.status === "active" || s.status === "past_due");
  const mrr = live.reduce((n, s) => n + (price.get(s.plan_id) ?? 0), 0);
  const count = (id: string) => live.filter((s) => s.plan_id === id).length;
  const open = (invoices ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue = open.filter((i) => i.status === "overdue");
  const ups = (changes ?? []).filter((c) => c.direction === "upgrade" && c.status !== "cancelled").length;
  const downs = (changes ?? []).filter((c) => c.direction === "downgrade" && c.status !== "cancelled").length;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <PageHeader n={adminNum("/admin/billing")} title="Plans and billing" sub={`Prices, invoices and every upgrade or downgrade. Invoices go out as Fygaro links on ZDMINC's account, and can be paid by bank transfer too. Contacts over a plan's allowance are added to the renewal invoice.`} />
        {manager && <form action={runBillingNow}><button className="btn secondary small">Run renewals and reminders now</button></form>}
      </div>
      {sp.msg && <p className="ok">{sp.msg}</p>}
      {!zdmFygaro() && <p className="error">ZDMINC's Fygaro keys aren't set (ZDM_FYGARO_BUTTON_URL, ZDM_FYGARO_KEY_ID, ZDM_FYGARO_SECRET), so invoices are created without a payment link.</p>}
      {(transfers ?? []).length > 0 && (
        <section className="card stack" style={{ background: "#fff8ec" }}>
          <h2>Bank transfers to check ({transfers!.length})</h2>
          <p className="muted" style={{ margin: 0 }}>Check ZDMINC's bank account for each amount before confirming. A screenshot alone is not proof.</p>
          {transfers!.map((t: any) => (
            <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", borderTop: "1px solid var(--line)", paddingTop: 10, flexWrap: "wrap" }}>
              <span className="stack" style={{ gap: 2 }}>
                <strong>{t.businesses?.name} · {t.number} · {money(t.amount, t.currency)}</strong>
                <span className="muted">Reference: {t.transfer_reference || "none given"} · sent {new Date(t.transfer_submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Barbados" })}</span>
                {proofs.get(t.id) && <a href={proofs.get(t.id)} target="_blank" rel="noreferrer"><img src={proofs.get(t.id)} alt={`Transfer screenshot for ${t.number}`} style={{ maxWidth: 220, maxHeight: 300, borderRadius: 8, border: "1px solid var(--line)" }} /></a>}
              </span>
              {manager ? (
                <span className="row" style={{ gap: 6 }}>
                  <form action={confirmInvoiceTransfer}><input type="hidden" name="id" value={t.id} /><button className="btn blue small">Money received</button></form>
                  <form action={rejectInvoiceTransfer}><input type="hidden" name="id" value={t.id} /><button className="btn secondary small">Not received</button></form>
                </span>
              ) : <span className="muted">A manager confirms transfers</span>}
            </div>
          ))}
        </section>
      )}

      <div className="kpis">
        <div className="kpi" style={{ background: "var(--teal-soft)" }}><span>Monthly recurring</span><b>{money(mrr)}</b></div>
        <div className="kpi"><span>Open invoices</span><b>{money(open.reduce((n, i) => n + Number(i.amount), 0))}</b></div>
        <div className="kpi" style={{ background: "#fff8ec" }}><span>Overdue</span><b>{overdue.length}</b></div>
        <div className="kpi"><span>Plan changes this month</span><b>{ups} up, {downs} down</b></div>
      </div>

      <h2>Plans</h2>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Plan</th><th>Monthly (BBD)</th><th>Includes</th><th>Clips</th><th>Image posts</th><th>AI posts</th><th>Seats</th><th>Contacts incl.</th><th>Per extra 1,000</th><th>On sale</th><th>Clients</th><th /></tr></thead>
          <tbody>
            {(plans ?? []).map((p) => (
              <tr key={p.id}>
                <td colSpan={12} style={{ padding: 0 }}>
                  <form action={savePlan} className="planrow">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="name" defaultValue={p.name} disabled={!manager} aria-label="Plan name" />
                    <input name="monthly_price" type="number" step="0.01" min="0" defaultValue={p.monthly_price} disabled={!manager} aria-label="Monthly price" />
                    <input name="description" defaultValue={p.description ?? ""} disabled={!manager} aria-label="Includes" />
                    <input name="video_clips" type="number" min="0" defaultValue={p.video_clips} disabled={!manager} aria-label="Clips a month" />
                    <input name="image_posts" type="number" min="0" defaultValue={(p as any).image_posts ?? 0} disabled={!manager} aria-label="ZDMINC image posts a month" />
                    <input name="posts_per_month" type="number" min="0" defaultValue={p.posts_per_month} disabled={!manager} aria-label="AI posts a month" />
                    <input name="seats" type="number" min="1" defaultValue={p.seats} disabled={!manager} aria-label="Seats" />
                    <input name="contacts_included" type="number" min="0" step="100" defaultValue={p.contacts_included} disabled={!manager} aria-label="Contacts included" />
                    <input name="extra_contacts_price" type="number" min="0" step="0.01" defaultValue={p.extra_contacts_price} disabled={!manager} aria-label="Price per extra 1,000 contacts" />
                    <input name="active" type="checkbox" defaultChecked={p.active} disabled={!manager} aria-label="On sale" />
                    <span>{count(p.id)}</span>
                    {manager ? <button className="btn secondary small">Save</button> : <span />}
                    <div className="planfeat">
                      <label>Setup fee (BBD)<input name="setup_fee" type="number" min="0" step="0.01" defaultValue={p.setup_fee} disabled={!manager} /></label>
                      <label className="chk"><input name="self_serve" type="checkbox" defaultChecked={p.self_serve} disabled={!manager} /> On the signup page</label>
                      <span className="muted" style={{ fontSize: 12 }}>Unlocks:</span>
                      {FEATURES.map((ft) => <label key={ft.key} className="chk" title={ft.label}><input name={`f_${ft.key}`} type="checkbox" defaultChecked={(p.features ?? []).includes(ft.key) || (ft.key === "videos" && p.video_clips > 0)} disabled={!manager} /> {ft.label.split(" (")[0]}</label>)}
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Invoices</h2>
        <div className="row">{[["", "All"], ["sent", "Due"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Void"]].map(([k, l]) => <a key={k} href={k ? `/admin/billing?s=${k}` : "/admin/billing"} className={`badge ${(status ?? "") === k ? "paid" : ""}`}>{l}</a>)}</div>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Client</th><th>Invoice</th><th>For</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(invoices ?? []).map((i: any) => (
              <tr key={i.id}>
                <td><strong>{i.businesses?.name}</strong></td>
                <td>{i.number}</td>
                <td className="muted">{i.description}</td>
                <td>{money(i.amount, i.currency)}</td>
                <td>{i.due_date}</td>
                <td><span className={`badge ${i.status}`}>{i.status === "sent" ? "due" : i.status}{i.reminders_sent ? ` · ${i.reminders_sent} reminder${i.reminders_sent > 1 ? "s" : ""}` : ""}</span></td>
                <td>
                  {(i.status === "sent" || i.status === "overdue") && (
                    <div className="row" style={{ gap: 6 }}>
                      {i.payment_url && <a className="btn secondary small" href={i.payment_url} target="_blank">Pay link</a>}
                      <form action={remindInvoice}><input type="hidden" name="id" value={i.id} /><button className="btn secondary small">Remind on WhatsApp</button></form>
                      <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="paid" /><button className="btn secondary small">Mark paid</button></form>
                      {manager && <form action={setInvoiceStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="void" /><button className="btn secondary small">Void</button></form>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!invoices?.length && <tr><td colSpan={7} className="muted">No invoices.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="cols">
        <form action={newInvoice} className="card stack">
          <h2>New invoice</h2>
          <label>Client<select name="business_id" required defaultValue="">{[<option key="" value="" disabled>Choose</option>, ...(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)]}</select></label>
          <label>For<input name="description" placeholder="Extra shoot, 12 December" /></label>
          <label>Amount (BBD)<input name="amount" type="number" step="0.01" min="1" required /></label>
          <label>Due<input name="due_date" type="date" defaultValue={todayIn()} /></label>
          <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="notify" defaultChecked /> Send it on WhatsApp</label>
          <button className="btn blue" style={{ alignSelf: "flex-start" }}>Create invoice</button>
        </form>
        <form action={saveZdmBank} className="card stack">
          <h2>ZDMINC bank details</h2>
          <p className="muted" style={{ margin: 0 }}>Shown to clients on open invoices so they can pay by 1st Pay or any bank transfer, with the invoice number as the reference. {bankOn ? "On." : "Off until you add them."}</p>
          <textarea name="bank_details" rows={5} defaultValue={bank?.value ?? ""} disabled={!manager} placeholder={"Bank: CIBC Caribbean\nAccount name: ZDMINC\nAccount number: ...\nBranch / transit: ..."} />
          {manager && <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save bank details</button>}
        </form>
      </div>
      <div className="cols">
        <section className="card stack">
          <h2>Plan changes this month</h2>
          {(changes ?? []).map((c: any) => (
            <div key={c.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span><strong>{c.businesses?.name}</strong><br /><span className="muted">{c.from_plan} to {c.to_plan} · {c.status === "scheduled" ? `from ${c.effective_on}` : c.status}{c.by_client ? " · by client" : ""}</span></span>
              <strong style={{ color: c.direction === "upgrade" ? "var(--teal)" : "var(--coral)" }}>{c.proration > 0 ? "+" : ""}{Number(c.proration) !== 0 ? money(c.proration) : c.direction}</strong>
            </div>
          ))}
          {!changes?.length && <p className="muted">None yet.</p>}
        </section>
      </div>
    </>
  );
}
