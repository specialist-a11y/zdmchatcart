import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/staff";
import { contactOverage, previewChange, todayIn } from "@/lib/billing";
import { payInvoice, requestPlanChange, saveBillingDetails, submitInvoiceTransfer } from "./actions";
import { zdmBankDetails, zdmFygaro } from "@/lib/zdm-billing";
import { CORE, featureLabel, entitlementsFrom } from "@/lib/plan-features";

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const STATUS: Record<string, string> = { sent: "Due", overdue: "Overdue", paid: "Paid", void: "Cancelled", draft: "Draft" };

export default async function BillingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string; welcome?: string }> }) {
  const { slug } = await params;
  const { msg, welcome } = await searchParams;
  const { business, role } = await requireMembership(slug);
  const canEdit = role === "owner" || role === "admin";
  if (!canEdit) {
    return <div className="stack"><PageHeader n={num("billing")} title="Plan and billing" /><p className="muted">Only the account owner or an admin can see billing. Ask them to give you admin access.</p></div>;
  }
  // Role checked above; read billing with the server key so private billing fields stay off the public API.
  const admin = createAdminClient();
  const monthStart = `${todayIn().slice(0, 7)}-01T00:00:00Z`;
  const [{ data: sub }, { data: plans }, { data: invoices }, { data: priv }, { count: seats }, { count: chosen }] = await Promise.all([
    admin.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle(),
    admin.from("plans").select("*").eq("active", true).order("rank"),
    admin.from("invoices").select("*").eq("business_id", business.id).neq("status", "draft").order("created_at", { ascending: false }).limit(24),
    admin.from("businesses").select("billing_name, billing_email, billing_address, contact_email").eq("id", business.id).single(),
    admin.from("business_members").select("user_id", { count: "exact", head: true }).eq("business_id", business.id),
    admin.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("chosen", true).gte("chosen_at", monthStart),
  ]);
  const { count: contactCount } = await admin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id);
  // Everything else used this month, so the plan's value is visible.
  const { count: chosenImages } = await admin.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("chosen", true).eq("kind", "image").gte("chosen_at", monthStart);
  const [{ count: posts }, { count: waSent }, { count: igDms }, { count: monthOrders }] = await Promise.all([
    admin.from("social_posts").select("id", { count: "exact", head: true }).eq("business_id", business.id).neq("status", "cancelled").gte("scheduled_at", monthStart),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("channel", "whatsapp").eq("direction", "out").gte("created_at", monthStart),
    admin.from("ig_comment_events").select("id", { count: "exact", head: true }).eq("business_id", business.id).in("status", ["sent", "dm_only"]).gte("created_at", monthStart),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("business_id", business.id).gte("created_at", monthStart),
  ]);
  const current = plans?.find((p) => p.id === sub?.plan_id);
  const pending = plans?.find((p) => p.id === sub?.pending_plan_id);
  const contacts = contactCount ?? 0;
  const extra = current ? contactOverage(contacts, current.contacts_included, current.extra_contacts_block, Number(current.extra_contacts_price)) : null;
  const open = (invoices ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const lite = (p: any) => ({ id: p.id, name: p.name, monthly_price: Number(p.monthly_price), rank: p.rank });
  const today = todayIn();
  const bank = await zdmBankDetails(admin);
  const cardOn = !!zdmFygaro();
  const pendingStart = sub?.status === "pending_payment";
  const checking = open.filter((i) => i.transfer_submitted_at);
  const toPay = open.filter((i) => !i.transfer_submitted_at);

  return (
    <div className="stack">
      <PageHeader n={num("billing")} title="Plan and billing" sub="Your ZDM ChatCart plan, invoices from ZDMINC, and who we bill." />
      {msg && <p className={/isn't|Add the|Send a|not/i.test(msg) ? "error" : "ok"}>{msg}</p>}

      {welcome && pendingStart && (
        <div className="card stack" style={{ background: "var(--teal-soft)" }}>
          <h2>Welcome to ZDM ChatCart</h2>
          <p style={{ margin: 0 }}>You picked <strong>{current?.name}</strong>. Pay your setup invoice below by card or bank transfer. Once it's in, ZDMINC sets up your payment account, WhatsApp, Instagram and your shop, and tests a live payment with you before launch.</p>
        </div>
      )}

      {checking.map((i) => (
        <div key={i.id} className="card row" style={{ justifyContent: "space-between", background: "#eef6ff" }}>
          <span><strong>Transfer sent for {i.number}</strong> · {money(i.amount)} · ZDMINC is checking it{i.transfer_reference ? ` (ref ${i.transfer_reference})` : ""}.</span>
        </div>
      ))}

      {toPay.length > 0 && (
        <section className="card stack" style={{ background: toPay.some((i) => i.status === "overdue") ? "#fbe3dc" : "#fff8ec" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span><strong>{toPay.length === 1 ? `Invoice ${toPay[0].number} is ${toPay[0].status === "overdue" ? "overdue" : "due"}` : `${toPay.length} invoices to pay`}</strong> · {money(toPay.reduce((n, i) => n + Number(i.amount), 0))}{toPay.length === 1 ? <span className="muted"> · {toPay[0].description}</span> : null}</span>
            {(cardOn || toPay[0].payment_url) && <form action={payInvoice}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="number" value={toPay[0].number} /><button className="btn blue small">Pay {toPay.length === 1 ? "by card" : `${toPay[0].number} by card`}</button></form>}
          </div>
          {!bank && !cardOn && !toPay[0].payment_url && <p className="muted" style={{ margin: 0 }}>ZDMINC will send you payment details for this invoice on WhatsApp.</p>}
          {bank && (
            // Open straight away while card payment isn't set up: transfer is the way to pay.
            <details open={!cardOn && !toPay[0].payment_url}>
              <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>Pay by bank transfer (1st Pay or CIBC)</summary>
              <div className="cols" style={{ marginTop: 10 }}>
                <div className="stack" style={{ gap: 6 }}>
                  <span className="muted">Send exactly {money(toPay[0].amount)} to:</span>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>{bank}</pre>
                  <span>Use <strong>{toPay[0].number}</strong> as the reference.</span>
                </div>
                <form action={submitInvoiceTransfer} className="stack" style={{ gap: 8 }}>
                  <input type="hidden" name="slug" value={slug} />
                  <label>Invoice<select name="invoice" defaultValue={toPay[0].id}>{toPay.map((i) => <option key={i.id} value={i.id}>{i.number} · {money(i.amount)}</option>)}</select></label>
                  <label>Reference number from your bank<input name="reference" maxLength={60} placeholder="e.g. FT2611051234" /></label>
                  <label>Screenshot or PDF of the transfer<input name="proof" type="file" accept="image/*,application/pdf" /></label>
                  <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>I've sent it</button>
                  <span className="muted" style={{ fontSize: 13 }}>ZDMINC checks the money is in its account, then marks the invoice paid.</span>
                </form>
              </div>
            </details>
          )}
        </section>
      )}

      <div className="cols">
        <section className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Your plan</h2><span className={`badge ${sub?.status === "active" ? "paid" : sub?.status ?? ""}`}>{({ past_due: "Payment overdue", pending_payment: "Waiting for first payment", active: "Active", trial: "Trial", paused: "Paused", cancelled: "Cancelled" } as Record<string, string>)[sub?.status ?? ""] ?? "Setting up"}</span></div>
          {current && sub ? (
            <>
              <div><strong style={{ fontSize: 24 }}>{current.name}</strong><br /><span className="muted">{money(current.monthly_price)} a month · renews {sub.current_period_end}</span></div>
              {pending && <p style={{ margin: 0 }}>Moving to <strong>{pending.name}</strong> on {sub.current_period_end}. Pick {current.name} below to cancel that.</p>}
              {Number(sub.credit) > 0 && <p className="ok" style={{ margin: 0 }}>Credit {money(sub.credit)} comes off your next invoice.</p>}
              {current.video_clips > 0 && <div><div className="row" style={{ justifyContent: "space-between" }}><span>Videos chosen this month</span><strong>{Math.max(0, (chosen ?? 0) - (chosenImages ?? 0))} of {current.video_clips}</strong></div><div className="meter"><i style={{ width: `${pct(Math.max(0, (chosen ?? 0) - (chosenImages ?? 0)), current.video_clips)}%` }} /></div></div>}
              <div>
                <div className="row" style={{ justifyContent: "space-between" }}><span>Contacts</span><strong>{contacts.toLocaleString("en-US")} of {current.contacts_included.toLocaleString("en-US")} included</strong></div>
                <div className="meter"><i style={{ width: `${pct(contacts, current.contacts_included)}%`, background: extra?.blocks ? "var(--coral)" : contacts >= current.contacts_included * 0.9 ? "#e0a23b" : undefined }} /></div>
                {extra && extra.blocks > 0 ? (
                  <p style={{ margin: "6px 0 0", fontSize: 13 }}>You're {extra.over.toLocaleString("en-US")} over. Your next invoice adds <strong>{money(extra.amount)}</strong> ({extra.blocks} × {money(current.extra_contacts_price)} per extra {current.extra_contacts_block.toLocaleString("en-US")}).</p>
                ) : contacts >= current.contacts_included * 0.9 ? (
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>Nearly at your limit. Above {current.contacts_included.toLocaleString("en-US")}, each extra {current.extra_contacts_block.toLocaleString("en-US")} contacts costs {money(current.extra_contacts_price)} a month.</p>
                ) : null}
              </div>
              <div><div className="row" style={{ justifyContent: "space-between" }}><span>Team seats</span><strong>{seats ?? 0} of {current.seats}</strong></div><div className="meter"><i style={{ width: `${pct(seats ?? 0, current.seats)}%` }} /></div></div>
              {Number(current.image_posts ?? 0) > 0 && <div><div className="row" style={{ justifyContent: "space-between" }}><span>Image posts chosen this month</span><strong>{chosenImages ?? 0} of {current.image_posts}</strong></div><div className="meter"><i style={{ width: `${pct(chosenImages ?? 0, current.image_posts)}%` }} /></div></div>}
              {current.posts_per_month > 0 && <div><div className="row" style={{ justifyContent: "space-between" }}><span>Posts scheduled this month</span><strong>{posts ?? 0} of {current.posts_per_month}</strong></div><div className="meter"><i style={{ width: `${pct(posts ?? 0, current.posts_per_month)}%`, background: (posts ?? 0) >= current.posts_per_month ? "#e0a23b" : undefined }} /></div></div>}
              <div className="stack" style={{ gap: 4, borderTop: "1px solid #eef2f1", paddingTop: 10 }}>
                <b style={{ fontSize: 14 }}>Also used this month</b>
                {[
                  ["Orders taken", monthOrders ?? 0],
                  ["WhatsApp messages sent for you", waSent ?? 0],
                  ["Instagram auto-reply DMs", igDms ?? 0],
                  ...(current.posts_per_month > 0 ? [] : [["Posts scheduled", posts ?? 0] as const]),
                ].map(([k, v]) => <div key={k as string} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}><span className="muted">{k}</span><strong>{Number(v).toLocaleString("en-US")}</strong></div>)}
                <span className="muted" style={{ fontSize: 12 }}>Counted from the 1st of this month.</span>
              </div>
            </>
          ) : <p className="muted">ZDMINC is setting up your plan.</p>}
        </section>

        <form action={saveBillingDetails} className="card stack">
          <h2>Billing details</h2>
          <p className="muted" style={{ margin: 0 }}>Shown on your ZDMINC invoices. Only you and ZDMINC see these.</p>
          <input type="hidden" name="slug" value={slug} />
          <label>Bill to (business or person)<input name="billing_name" defaultValue={priv?.billing_name ?? business.name} /></label>
          <label>Invoice email<input name="billing_email" type="email" defaultValue={priv?.billing_email ?? priv?.contact_email ?? ""} /></label>
          <label>Billing address<textarea name="billing_address" rows={3} defaultValue={priv?.billing_address ?? ""} /></label>
          <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save billing details</button>
        </form>
      </div>

      <h2>Change plan</h2>
      <p className="muted" style={{ margin: 0 }}>Upgrades start today and you pay the difference for the rest of this month. Downgrades start at your next renewal, so you keep what you paid for. Contacts are everyone in your Customers list; extra contacts are counted on your renewal date.</p>
      <div className="grid">
        {(plans ?? []).map((p) => {
          const isCurrent = p.id === sub?.plan_id;
          const pv = current && sub ? previewChange({ from: lite(current), to: lite(p), periodStart: sub.current_period_start, periodEnd: sub.current_period_end, today, existingCredit: Number(sub.credit) }) : null;
          return (
            <form key={p.id} action={requestPlanChange} className="card stack" style={isCurrent ? { borderColor: "var(--blue)", borderWidth: 2.5 } : undefined}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="plan" value={p.id} />
              <div className="row" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 17 }}>{p.name}</strong>{isCurrent && <span className="badge paid">Current</span>}{p.id === sub?.pending_plan_id && <span className="badge high">From {sub?.current_period_end}</span>}</div>
              <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 28, fontWeight: 800 }}>{money(p.monthly_price)}<span className="muted" style={{ fontSize: 14, fontWeight: 500 }}> /month</span></span>
              <span className="muted">{p.description}</span>
              {Number(p.setup_fee) > 0 && pendingStart && <span style={{ fontSize: 13 }}>+ {money(p.setup_fee)} one-time setup</span>}
              <details style={{ fontSize: 13 }}>
                <summary style={{ cursor: "pointer" }}>What's included</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {CORE.map((c) => <li key={c}>{c}</li>)}
                  {entitlementsFrom(p, "active").features.map((k) => <li key={k}><strong>{featureLabel(k)}</strong></li>)}
                </ul>
              </details>
              <span className="muted" style={{ fontSize: 13 }}>{p.contacts_included.toLocaleString("en-US")} contacts included, then {money(p.extra_contacts_price)} per extra {p.extra_contacts_block.toLocaleString("en-US")}</span>
              {pendingStart ? (
                isCurrent ? <span className="muted" style={{ fontSize: 13 }}>Your plan. Pay the setup invoice to start.</span> : <button className="btn secondary small">Switch to {p.name}</button>
              ) : isCurrent ? (
                pending ? <button className="btn secondary small">Stay on {p.name}</button> : <span className="muted" style={{ fontSize: 13 }}>You're on this plan.</span>
              ) : pv ? (
                <>
                  <span style={{ fontSize: 13 }}>{pv.direction === "upgrade" ? (pv.chargeNow > 0 ? `Pay ${money(pv.chargeNow)} today, then ${money(p.monthly_price)} from ${sub?.current_period_end}.` : "Starts today.") : `Starts ${pv.effectiveOn}. Nothing changes until then.`}</span>
                  <button className={`btn small ${pv.direction === "upgrade" ? "blue" : "secondary"}`}>{pv.direction === "upgrade" ? "Upgrade" : "Downgrade"}</button>
                </>
              ) : null}
            </form>
          );
        })}
      </div>

      <h2>Invoices</h2>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Invoice</th><th>For</th><th>Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.number}</td>
                <td className="muted">{i.description}</td>
                <td>{money(i.amount, i.currency)}</td>
                <td>{i.due_date}</td>
                <td><span className={`badge ${i.status}`}>{STATUS[i.status] ?? i.status}{i.paid_at ? ` ${new Date(i.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span></td>
                <td><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {(i.status === "sent" || i.status === "overdue") && i.transfer_submitted_at && <span className="badge sent">Transfer checking</span>}
                  {i.status === "paid" && i.paid_via === "transfer" && <span className="muted" style={{ fontSize: 12 }}>by transfer</span>}
                  {(i.status === "sent" || i.status === "overdue") && !i.transfer_submitted_at && (
                    <form action={payInvoice}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="number" value={i.number} /><button className="btn blue small">Pay</button></form>
                  )}
                  <a className="btn secondary small" href={`/dashboard/${slug}/billing/invoice/${encodeURIComponent(i.number)}`}>PDF</a>
                </div></td>
              </tr>
            ))}
            {!invoices?.length && <tr><td colSpan={6} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0 }}>{cardOn ? `Pay by card through Fygaro${bank ? " or by bank transfer (1st Pay or CIBC)" : ""}.` : bank ? "Pay by bank transfer (1st Pay or CIBC). Card payment is coming soon." : "ZDMINC sends payment details on WhatsApp."} Questions about a charge? Open a request in Help and support.</p>
    </div>
  );
}
