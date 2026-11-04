import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, money } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { addNote, setSubscriptionStatus, updateContact } from "../../actions";

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { msg } = await searchParams;
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();
  const monthStart = new Date(); monthStart.setDate(1);
  const [{ data: sub }, { data: events }, { data: notes }, { data: invoices }, { data: tickets }, { data: integ }, { count: seats }, { count: chosen }, { data: orders }, { data: wa }] = await Promise.all([
    admin.from("subscriptions").select("*, plan:plans!subscriptions_plan_id_fkey(*), pending:plans!subscriptions_pending_plan_id_fkey(name)").eq("business_id", id).maybeSingle(),
    admin.from("account_events").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(12),
    admin.from("client_notes").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("invoices").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(8),
    admin.from("support_tickets").select("number, subject, status, priority, updated_at").eq("business_id", id).order("updated_at", { ascending: false }).limit(6),
    admin.from("integrations").select("provider, status").eq("business_id", id),
    admin.from("business_members").select("user_id", { count: "exact", head: true }).eq("business_id", id),
    admin.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", id).eq("chosen", true).gte("chosen_at", monthStart.toISOString()),
    admin.from("orders").select("total, status, created_at").eq("business_id", id).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    admin.from("zdm_wa_messages").select("body, direction, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const { count: contacts } = await admin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", id);
  const plan: any = sub?.plan;
  const sales = (orders ?? []).filter((o) => o.status === "paid" || o.status === "ready" || o.status === "fulfilled").reduce((n, o) => n + Number(o.total), 0);
  const conn = (p: string) => integ?.find((i) => i.provider === p)?.status ?? "not connected";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}><Link href="/admin">Clients</Link> /</p>
          <h1>{b.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{b.contact_name ?? "Owner not set"} · {b.contact_phone ? `+${b.contact_phone}` : "no WhatsApp"} · {b.contact_email ?? "no email"}</p>
        </div>
        <div className="row">
          <Link className="btn secondary small" href={`/dashboard/${b.slug}`}>View as client</Link>
          {b.contact_phone && <Link className="btn secondary small" href={`/admin/whatsapp?p=${b.contact_phone}`}>WhatsApp</Link>}
          <Link className="btn blue small" href={`/admin/clients/${id}/plan`}>Change plan</Link>
        </div>
      </div>
      {msg && <p className="ok">{msg}</p>}

      <div className="kpis">
        <div className="kpi" style={{ background: "var(--teal-soft)" }}><span>Their paid sales, last 7 days</span><b>{money(sales, b.currency)}</b></div>
        <div className="kpi"><span>Orders, last 7 days</span><b>{orders?.length ?? 0}</b></div>
        <div className="kpi"><span>Open tickets</span><b>{tickets?.filter((t) => t.status !== "resolved").length ?? 0}</b></div>
        <div className="kpi"><span>Last WhatsApp</span><b style={{ fontSize: 18 }}>{wa?.[0] ? `${wa[0].direction === "in" ? "From them" : "From us"}, ${new Date(wa[0].created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "None yet"}</b></div>
      </div>

      <div className="cols">
        <div className="stack">
          <section className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>Plan and usage</h2><span className={`badge ${sub?.status}`}>{sub?.status ?? "no plan"}</span></div>
            {plan ? (
              <>
                <div><strong style={{ fontSize: 22 }}>{plan.name}</strong><br /><span className="muted">{money(plan.monthly_price)} a month · renews {sub!.current_period_end}{(sub as any).pending ? ` · moving to ${(sub as any).pending.name} then` : ""}{Number(sub!.credit) > 0 ? ` · credit ${money(sub!.credit)}` : ""}</span></div>
                {plan.video_clips > 0 && <div><div className="row" style={{ justifyContent: "space-between" }}><span>Clips chosen this month</span><strong>{chosen ?? 0} of {plan.video_clips}</strong></div><div className="meter"><i style={{ width: `${pct(chosen ?? 0, plan.video_clips)}%` }} /></div></div>}
                <div><div className="row" style={{ justifyContent: "space-between" }}><span>Contacts</span><strong>{(contacts ?? 0).toLocaleString("en-US")} of {plan.contacts_included.toLocaleString("en-US")}</strong></div><div className="meter"><i style={{ width: `${pct(contacts ?? 0, plan.contacts_included)}%`, background: (contacts ?? 0) > plan.contacts_included ? "var(--coral)" : undefined }} /></div>
                  {(contacts ?? 0) > plan.contacts_included && <span className="muted" style={{ fontSize: 13 }}>Over by {((contacts ?? 0) - plan.contacts_included).toLocaleString("en-US")}: next invoice adds {money(Math.ceil(((contacts ?? 0) - plan.contacts_included) / plan.extra_contacts_block) * Number(plan.extra_contacts_price))}</span>}</div>
                <div><div className="row" style={{ justifyContent: "space-between" }}><span>Team seats</span><strong>{seats ?? 0} of {plan.seats}</strong></div><div className="meter"><i style={{ width: `${pct(seats ?? 0, plan.seats)}%` }} /></div></div>
              </>
            ) : <p className="muted">No subscription yet.</p>}
            <div className="row">
              <Link className="btn secondary small" href={`/admin/clients/${id}/plan`}>Upgrade or downgrade</Link>
              {sub?.status === "paused"
                ? <form action={setSubscriptionStatus}><input type="hidden" name="business_id" value={id} /><input type="hidden" name="status" value="active" /><button className="btn secondary small">Resume</button></form>
                : <form action={setSubscriptionStatus}><input type="hidden" name="business_id" value={id} /><input type="hidden" name="status" value="paused" /><button className="btn secondary small">Pause</button></form>}
            </div>
          </section>
          <section className="card stack">
            <h2>Connections</h2>
            {[["WhatsApp", conn("whatsapp")], ["Fygaro", conn("fygaro")], ["Instagram", conn("instagram")]].map(([n, s]) => (
              <div key={n} className="row" style={{ justifyContent: "space-between" }}><span>{n}</span><span className={`badge ${s === "connected" ? "paid" : s === "error" ? "failed" : ""}`}>{s}</span></div>
            ))}
            <div className="row" style={{ justifyContent: "space-between" }}><span>Shop</span><a href={`/s/${b.slug}`} target="_blank">/s/{b.slug}</a></div>
          </section>
          <form action={updateContact} className="card stack">
            <h2>Owner contact</h2>
            <input type="hidden" name="business_id" value={id} />
            <label>Name<input name="contact_name" defaultValue={b.contact_name ?? ""} /></label>
            <label>WhatsApp (with country code)<input name="contact_phone" defaultValue={b.contact_phone ?? ""} /></label>
            <label>Email<input name="contact_email" type="email" defaultValue={b.contact_email ?? ""} /></label>
            <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save contact</button>
          </form>
        </div>

        <div className="stack">
          <section className="card stack">
            <h2>Account history</h2>
            {(events ?? []).map((e) => (
              <div key={e.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <strong>{e.summary}</strong><br />
                <span className="muted">{new Date(e.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.actor_name ?? "System"}</span>
              </div>
            ))}
            {!events?.length && <p className="muted">Nothing yet.</p>}
          </section>
          <section className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>Support</h2><Link href="/admin/support">Queue ›</Link></div>
            {(tickets ?? []).map((t) => (
              <Link key={t.number} href={`/admin/support?t=${t.number}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
                <span>#{t.number} {t.subject}</span><span className={`badge ${t.status}`}>{t.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
            {!tickets?.length && <p className="muted">No tickets.</p>}
          </section>
        </div>

        <div className="stack">
          <section className="card stack">
            <h2>Internal notes</h2>
            <p className="muted" style={{ margin: 0 }}>Only ZDMINC sees these.</p>
            {(notes ?? []).map((n) => (
              <div key={n.id} className="msg note"><div className="meta"><strong>{n.author_name}</strong><span>{new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div>{n.body}</div>
            ))}
            <form action={addNote} className="stack">
              <input type="hidden" name="business_id" value={id} />
              <textarea name="body" rows={3} placeholder="Add a note" />
              <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Add note</button>
            </form>
          </section>
          <section className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>Invoices</h2><Link href="/admin/billing">Billing ›</Link></div>
            {(invoices ?? []).map((i) => (
              <div key={i.id} className="row" style={{ justifyContent: "space-between" }}>
                <span><strong>{i.number}</strong><br /><span className="muted">{i.description}</span></span>
                <span className="row"><strong>{money(i.amount, i.currency)}</strong><span className={`badge ${i.status}`}>{i.status}</span></span>
              </div>
            ))}
            {!invoices?.length && <p className="muted">No invoices yet.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
