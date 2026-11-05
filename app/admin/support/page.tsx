import { TicketAttachments, signAttachments } from "@/components/TicketAttachments";
import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import Link from "next/link";
import { requireStaff, ago } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffOpenTicket, staffReply, updateTicket } from "../actions";

const STATUSES = [["open", "Open"], ["waiting_on_client", "Waiting on client"], ["resolved", "Resolved"]] as const;

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ t?: string; s?: string; mine?: string; msg?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const status = STATUSES.some(([k]) => k === sp.s) ? sp.s! : "open";
  const admin = createAdminClient();
  let q = admin.from("support_tickets").select("id, number, subject, status, priority, category, updated_at, assignee, businesses(name)").eq("status", status).order("updated_at", { ascending: false }).limit(100);
  if (sp.mine) q = q.eq("assignee", staff.user_id);
  const [{ data: tickets }, { data: team }, { data: clients }] = await Promise.all([
    q,
    admin.from("platform_staff").select("user_id, name, role").order("name"),
    admin.from("businesses").select("id, name").order("name"),
  ]);
  const order = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
  const list = (tickets ?? []).sort((a, b) => order[a.priority] - order[b.priority] || b.updated_at.localeCompare(a.updated_at));
  const selectedNumber = sp.t ?? (list[0] ? String(list[0].number) : undefined);
  const { data: t } = selectedNumber
    ? await admin.from("support_tickets").select("*, businesses(id, name, contact_name, contact_phone, subscriptions(plan_id, status))").eq("number", selectedNumber).maybeSingle()
    : { data: null };
  const { data: thread } = t ? await admin.from("ticket_messages").select("*").eq("ticket_id", t.id).order("created_at") : { data: [] };
  const files = await signAttachments(admin as any, thread ?? []);
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ s: status, mine: sp.mine, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/admin/support?${p}`;
  };
  const biz: any = t?.businesses;

  return (
    <>
      <PageHeader n={adminNum("/admin/support")} title="Support" sub={`Every client request in one queue. Replies show in the client"s app, and on WhatsApp if you tick the box.`} />
      {sp.msg && <p className="ok">{sp.msg}</p>}
      <div className="split">
        <div className="card list" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: 12 }}>
            {STATUSES.map(([k, l]) => <Link key={k} href={`/admin/support?s=${k}${sp.mine ? "&mine=1" : ""}`} className={`badge ${k === status ? "paid" : ""}`}>{l}</Link>)}
            <Link href={sp.mine ? `/admin/support?s=${status}` : `/admin/support?s=${status}&mine=1`} className={`badge ${sp.mine ? "paid" : ""}`}>Mine</Link>
          </div>
          {list.map((x: any) => (
            <Link key={x.id} className="item" href={link({ t: String(x.number) })} aria-current={String(x.number) === selectedNumber ? "true" : undefined}>
              <span className="row" style={{ justifyContent: "space-between" }}><strong>{x.businesses?.name}</strong><span className="muted">{ago(x.updated_at)}</span></span>
              <span>#{x.number} {x.subject}</span>
              <span className="row" style={{ gap: 6 }}><span className={`badge ${x.priority}`}>{x.priority}</span><span className="badge resolved">{x.category}</span></span>
            </Link>
          ))}
          {list.length === 0 && <p className="muted" style={{ padding: "0 14px" }}>Nothing here.</p>}
        </div>

        {t ? (
          <div className="stack">
            <div className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div><h2 style={{ textTransform: "none", fontFamily: "inherit", fontSize: 18 }}>#{t.number} {t.subject}</h2><span className="muted"><Link href={`/admin/clients/${biz?.id}`}>{biz?.name}</Link> · opened {new Date(t.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{t.first_response_at ? ` · first reply in ${Math.max(1, Math.round((Date.parse(t.first_response_at) - Date.parse(t.created_at)) / 60000))} min` : " · no reply yet"}</span></div>
              </div>
              <form action={updateTicket} className="row">
                <input type="hidden" name="number" value={t.number} />
                <label>Status<select name="status" defaultValue={t.status}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label>Priority<select name="priority" defaultValue={t.priority}>{["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}</select></label>
                <label>Assignee<select name="assignee" defaultValue={t.assignee ?? "none"}><option value="none">Nobody</option>{(team ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.role})</option>)}</select></label>
                <button className="btn secondary small" style={{ alignSelf: "flex-end" }}>Update</button>
              </form>
            </div>
            <div className="card stack">
              {(thread ?? []).map((m) => (
                <div key={m.id} className={`msg ${m.internal ? "note" : m.from_staff ? "staff" : ""}`}>
                  <div className="meta"><strong>{m.author_name}{m.internal ? " · internal note" : ""}</strong><span>{new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
                  {m.body}
                  <TicketAttachments items={m.attachments} urls={files} />
                </div>
              ))}
              <form action={staffReply} className="stack">
                <input type="hidden" name="ticket_id" value={t.id} />
                <input type="hidden" name="number" value={t.number} />
                <div className="row">
                  <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="radio" name="kind" value="reply" defaultChecked /> Reply to client</label>
                  <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="radio" name="kind" value="note" /> Internal note</label>
                </div>
                <textarea name="body" rows={4} placeholder={`Write to ${biz?.contact_name ?? "the client"}`} />
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="whatsapp" defaultChecked={!!biz?.contact_phone} disabled={!biz?.contact_phone} /> Also send on WhatsApp{biz?.contact_phone ? ` to +${biz.contact_phone}` : " (no number saved)"}</label>
                  <div className="row">
                    <select name="then" defaultValue="" aria-label="After sending"><option value="">Keep open</option><option value="waiting">Then: waiting on client</option><option value="resolve">Then: resolve</option></select>
                    <button className="btn blue">Send</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="card"><p className="muted">Pick a ticket.</p></div>
        )}
      </div>

      <form action={staffOpenTicket} className="card stack" style={{ maxWidth: 760 }}>
        <h2>Open a ticket for a client</h2>
        <p className="muted" style={{ margin: 0 }}>For requests that came in by phone or in person. The client sees it in their app.</p>
        <div className="cols">
          <label>Client<select name="business_id" required defaultValue="">{[<option key="" value="" disabled>Choose</option>, ...(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)]}</select></label>
          <label>Category<select name="category" defaultValue="other">{["videos", "payments", "whatsapp", "website", "account", "plan", "other"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Priority<select name="priority" defaultValue="normal">{["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
        <label>Subject<input name="subject" required minLength={3} /></label>
        <label>Message to the client<textarea name="body" rows={3} required /></label>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }}>Open ticket</button>
      </form>
    </>
  );
}
