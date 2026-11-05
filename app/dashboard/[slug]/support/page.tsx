import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/staff";
import { openTicket, replyTicket } from "./actions";
import { GUIDES } from "@/lib/help-guides";
import HelpLibrary from "./HelpLibrary";
import GuideView from "./GuideView";
import AttachField from "./AttachField";
import { TicketAttachments, signAttachments } from "@/components/TicketAttachments";
import { SUPPORT_HOURS, nextOpen, replyBy, teamOnline, whenLabel } from "@/lib/support-sla";

const label = (s: string) => (s === "waiting_on_client" ? "Waiting for you" : s === "open" ? "With ZDMINC" : "Resolved");

export default async function SupportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; msg?: string; tab?: string; guide?: string; subject?: string }> }) {
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
  const files = await signAttachments(supabase as any, thread ?? []);
  // Live status and the reply promise.
  const now = Date.now();
  const online = teamOnline(now);
  const lastClient = [...(thread ?? [])].reverse().find((m: any) => !m.from_staff && !m.internal);
  const lastStaff = [...(thread ?? [])].reverse().find((m: any) => m.from_staff && !m.internal);
  const awaitingUs = t?.status === "open" && lastClient && (!lastStaff || Date.parse(lastStaff.created_at) < Date.parse(lastClient.created_at));
  const due = awaitingUs ? replyBy(lastClient.created_at, now) : null;
  const statusLine = online
    ? `The ZDMINC team is online now. Most requests get an answer within ${SUPPORT_HOURS.replyHours} business hours.`
    : `The team is offline. Back ${whenLabel(nextOpen(now), now)} (${SUPPORT_HOURS.label}, Barbados time).`;
  const base = `/dashboard/${slug}/support`;
  const waNumber = process.env.NEXT_PUBLIC_ZDM_SUPPORT_WHATSAPP;
  // Guides open by default; ticket links, messages and "New request" go to Your requests.
  const guide = GUIDES.find((g) => g.id === sp.guide);
  const tab = guide || sp.tab === "guides" ? "guides" : sp.t || sp.msg || sp.tab === "requests" ? "requests" : "guides";
  const openCount = (tickets ?? []).filter((x) => x.status === "waiting_on_client").length;

  return (
    <div className="stack">
      <PageHeader n={num("support")} title="Help and support" sub="How-to guides for every part of ZDM ChatCart, and a direct line to the ZDMINC team."
        actions={<Link className="btn blue small" href={`${base}?t=new`}>New request</Link>} />
      {sp.msg && <p className="ok" style={{ wordBreak: "break-word" }}>{sp.msg}</p>}
      <div className="row" style={{ gap: 8, fontSize: 14 }} role="status">
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: online ? "#2bb673" : "#c4ccc8", display: "inline-block" }} />
        <span className="muted">{statusLine}</span>
      </div>
      <nav className="pills" aria-label="Help sections">
        <Link href={`${base}?tab=guides`} aria-current={tab === "guides" ? "true" : undefined}>How-to guides</Link>
        <Link href={`${base}?tab=requests`} aria-current={tab === "requests" ? "true" : undefined}>Your requests{openCount ? ` · ${openCount} waiting for you` : tickets?.length ? ` · ${tickets.length}` : ""}</Link>
      </nav>

      {tab === "guides" ? (guide ? <GuideView guide={guide} slug={slug} base={base} /> : <HelpLibrary base={base} />) : (
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
            {due && (
              <div style={{ background: "var(--teal-soft)", borderRadius: 12, padding: "8px 12px", fontSize: 14 }}>
                {due < now ? <>Taking longer than usual. We'll reply as soon as we can, or <b>WhatsApp us</b> if it's urgent.</> : <>Reply expected by <b>{whenLabel(due, now)}</b>.</>}
              </div>
            )}
            {t.status === "waiting_on_client" && <div style={{ background: "#fff8ec", borderRadius: 12, padding: "8px 12px", fontSize: 14 }}>ZDMINC is waiting for your reply.</div>}
            {(thread ?? []).map((m: any) => (
              <div key={m.id} className={`msg ${m.from_staff ? "staff" : ""}`}>
                <div className="meta"><strong>{m.from_staff ? m.author_name : "You"}</strong><span>{new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                {m.body}
                <TicketAttachments items={m.attachments} urls={files} />
              </div>
            ))}
            <form action={replyTicket} className="stack">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="number" value={t.number} />
              <textarea name="body" rows={3} placeholder="Reply to ZDMINC" />
              <AttachField slug={slug} />
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
            <label>Subject<input name="subject" required minLength={3} maxLength={120} defaultValue={sp.subject ?? ""} placeholder="Swap 2 videos for the Christmas Reel" /></label>
            <label>Message<textarea name="body" rows={5} required /></label>
            <AttachField slug={slug} />
            <button className="btn blue" style={{ alignSelf: "flex-start" }}>Send to ZDMINC</button>
            <span className="muted" style={{ fontSize: 13 }}>{online ? `We usually reply within ${SUPPORT_HOURS.replyHours} business hours.` : `Sent now, you'll hear back after we open ${whenLabel(nextOpen(now), now)}.`}</span>
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
      )}
    </div>
  );
}
