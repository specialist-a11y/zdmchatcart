import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/staff";
import { openTicket, replyTicket } from "./actions";

const label = (s: string) => (s === "waiting_on_client" ? "Waiting for you" : s === "open" ? "With ZDMINC" : "Resolved");

export default async function SupportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; msg?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  const canChangePlan = role === "owner" || role === "admin";
  const [{ data: tickets }, { data: sub }, { data: plans }] = await Promise.all([
    supabase.from("support_tickets").select("id, number, subject, status, category, updated_at").eq("business_id", business.id).order("updated_at", { ascending: false }),
    supabase.from("subscriptions").select("plan_id, status, current_period_end, pending_plan_id").eq("business_id", business.id).maybeSingle(),
    supabase.from("plans").select("id, name, monthly_price, description, rank").eq("active", true).order("rank"),
  ]);
  const current = plans?.find((p) => p.id === sub?.plan_id);
  const pending = plans?.find((p) => p.id === sub?.pending_plan_id);
  const t = tickets?.find((x) => String(x.number) === sp.t) ?? (sp.t ? undefined : tickets?.find((x) => x.status !== "resolved"));
  const { data: thread } = t ? await supabase.from("ticket_messages").select("*").eq("ticket_id", t.id).order("created_at") : { data: [] as any[] };
  const base = `/dashboard/${slug}/support`;
  const waNumber = process.env.NEXT_PUBLIC_ZDM_SUPPORT_WHATSAPP;

  return (
    <div className="stack">
      <PageHeader n={num("support")} title="Help and support" sub="Message the ZDMINC team, track your requests and manage your plan." />
      {sp.msg && <p className="ok" style={{ wordBreak: "break-word" }}>{sp.msg}</p>}
      <div className="cols three">
        <section className="card list" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: 12, justifyContent: "space-between" }}><strong>Your requests</strong><Link href={`${base}?t=new`} className="btn secondary small">New request</Link></div>
          {(tickets ?? []).map((x) => (
            <Link key={x.id} className="item" href={`${base}?t=${x.number}`} aria-current={x.id === t?.id ? "true" : undefined}>
              <strong>{x.subject}</strong>
              <span className="row" style={{ gap: 6 }}><span className={`badge ${x.status}`}>{label(x.status)}</span><span className="muted">#{x.number}</span></span>
            </Link>
          ))}
          {!tickets?.length && <p className="muted" style={{ padding: "0 14px" }}>No requests yet.</p>}
        </section>

        {t ? (
          <section className="card stack">
            <div><h2 style={{ textTransform: "none", fontFamily: "inherit", fontSize: 18 }}>{t.subject}</h2><span className="muted">Request #{t.number} · {label(t.status)}</span></div>
            {(thread ?? []).map((m: any) => (
              <div key={m.id} className={`msg ${m.from_staff ? "staff" : ""}`}>
                <div className="meta"><strong>{m.from_staff ? m.author_name : "You"}</strong><span>{new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                {m.body}
              </div>
            ))}
            <form action={replyTicket} className="stack">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="number" value={t.number} />
              <textarea name="body" rows={3} placeholder="Reply to ZDMINC" required />
              <button className="btn blue" style={{ alignSelf: "flex-end" }}>Send</button>
            </form>
          </section>
        ) : (
          <form action={openTicket} className="card stack">
            <h2>New request</h2>
            <input type="hidden" name="slug" value={slug} />
            <label>What's it about?<select name="category" defaultValue="other">
              <option value="videos">Videos</option><option value="payments">Payments or Fygaro</option><option value="whatsapp">WhatsApp</option>
              <option value="website">Website</option><option value="account">Team or account</option><option value="plan">My plan</option><option value="other">Something else</option>
            </select></label>
            <label>Subject<input name="subject" required minLength={3} placeholder="Swap 2 videos for the Christmas Reel" /></label>
            <label>Message<textarea name="body" rows={5} required /></label>
            <button className="btn blue" style={{ alignSelf: "flex-start" }}>Send to ZDMINC</button>
          </form>
        )}

        <div className="stack">
          <section className="card stack">
            <h2>Your plan</h2>
            {current ? (
              <>
                <div><strong style={{ fontSize: 20 }}>{current.name}</strong><br /><span className="muted">{money(current.monthly_price)} a month · renews {sub?.current_period_end}</span></div>
                {pending && <p className="muted" style={{ margin: 0 }}>Moving to {pending.name} on {sub?.current_period_end}.</p>}
                {canChangePlan ? <Link className="btn secondary small" style={{ alignSelf: "flex-start" }} href={`/dashboard/${slug}/billing`}>Plan and billing</Link> : <p className="muted">Ask your account owner to change the plan.</p>}
              </>
            ) : <p className="muted">ZDMINC is setting up your plan.</p>}
          </section>
          {waNumber && (
            <a className="card" href={`https://wa.me/${waNumber.replace(/\D/g, "")}`} target="_blank" style={{ background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
              <strong>Urgent? WhatsApp us</strong><br /><span style={{ color: "#c4ccc8" }}>+{waNumber.replace(/\D/g, "")}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
