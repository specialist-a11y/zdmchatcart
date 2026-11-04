import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import Link from "next/link";
import { requireStaff, ago } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { insideServiceWindow } from "@/lib/whatsapp";
import { digits, zdmWhatsApp } from "@/lib/zdm-whatsapp";
import { linkWhatsAppToClient, sendWhatsApp, whatsappToTicket } from "../actions";

type Row = { id: string; pending: boolean; phone: string; business_id: string | null; contact_name: string | null; direction: string; body: string; kind: string; status: string; error: string | null; author_name: string | null; read_at: string | null; created_at: string };

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ p?: string; msg?: string; client?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const admin = createAdminClient();
  const [{ data: recent }, { data: clients }] = await Promise.all([
    admin.from("zdm_wa_messages").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("businesses").select("id, name, contact_name, contact_phone").order("name"),
  ]);
  const byId = new Map((clients ?? []).map((c) => [c.id, c]));
  // One thread per phone number, newest first.
  const threads = new Map<string, { last: Row; unread: number; name: string; businessId: string | null }>();
  for (const m of (recent ?? []) as Row[]) {
    const t = threads.get(m.phone);
    const unread = m.direction === "in" && !m.read_at ? 1 : 0;
    if (!t) threads.set(m.phone, { last: m, unread, businessId: m.business_id, name: (m.business_id && byId.get(m.business_id)?.name) || m.contact_name || `+${m.phone}` });
    else { t.unread += unread; t.businessId ??= m.business_id; }
  }
  const fromClient = sp.client ? byId.get(sp.client) : null;
  const phone = digits(sp.p ?? fromClient?.contact_phone ?? [...threads.keys()][0] ?? "");
  const { data: thread } = phone ? await admin.from("zdm_wa_messages").select("*").eq("phone", phone).order("created_at").limit(300) : { data: [] as Row[] };
  if (phone) await admin.from("zdm_wa_messages").update({ read_at: new Date().toISOString() }).eq("phone", phone).eq("direction", "in").is("read_at", null);
  const linked = (thread ?? []).find((m: Row) => m.business_id)?.business_id ?? (clients ?? []).find((c) => c.contact_phone === phone)?.id ?? null;
  const client = linked ? byId.get(linked) : null;
  const lastIn = [...(thread ?? [])].reverse().find((m: Row) => m.direction === "in")?.created_at;
  const open = insideServiceWindow(lastIn);
  const wa = zdmWhatsApp();
  const withPhone = (clients ?? []).filter((c) => c.contact_phone && !threads.has(c.contact_phone));

  return (
    <>
      <PageHeader n={adminNum("/admin/whatsapp")} title="WhatsApp" sub={`Chats between the ZDMINC team and client owners on ZDMINC"s own number.`} />
      {sp.msg && <p className="ok">{sp.msg}</p>}
      {!wa && <p className="error">ZDMINC's WhatsApp number isn't connected yet. Add ZDM_WA_PHONE_NUMBER_ID and ZDM_WA_TOKEN (and ZDM_WA_TEMPLATE) to the app's settings. Messages will be saved but not sent until then.</p>}
      <div className="split">
        <div className="card list" style={{ padding: 0, overflow: "hidden" }}>
          <form className="row" style={{ padding: 12 }} action="/admin/whatsapp">
            <select name="client" defaultValue="" aria-label="Start a chat with a client" style={{ flex: 1, minWidth: 0 }}>
              <option value="" disabled>Start a chat with a client</option>
              {withPhone.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn secondary small">Open</button>
          </form>
          {[...threads.entries()].map(([p, t]) => (
            <Link key={p} className="item" href={`/admin/whatsapp?p=${p}`} aria-current={p === phone ? "true" : undefined}>
              <span className="row" style={{ justifyContent: "space-between" }}><strong>{t.name}</strong><span className="row" style={{ gap: 6 }}>{t.unread > 0 && <span className="badge paid">{t.unread}</span>}<span className="muted">{ago(t.last.created_at)}</span></span></span>
              <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last.direction === "out" ? "You: " : ""}{t.last.body}</span>
              {!t.businessId && <span className="badge high" style={{ alignSelf: "flex-start" }}>Not linked to a client</span>}
            </Link>
          ))}
          {threads.size === 0 && <p className="muted" style={{ padding: "0 14px" }}>No chats yet. When a client messages ZDMINC's number it shows up here.</p>}
        </div>

        {phone ? (
          <div className="stack">
            <div className="card row" style={{ justifyContent: "space-between" }}>
              <div>
                <h2 style={{ textTransform: "none", fontFamily: "inherit", fontSize: 18 }}>{client?.name ?? `+${phone}`}</h2>
                <span className="muted">+{phone}{client?.contact_name ? ` · ${client.contact_name}` : ""} · {open ? "Inside the 24-hour window: free text sends as written" : "Outside the 24-hour window: the opening template goes first"}</span>
              </div>
              <div className="row">
                {client && <Link className="btn secondary small" href={`/admin/clients/${client.id}`}>Client page</Link>}
                <form action={whatsappToTicket}><input type="hidden" name="phone" value={phone} /><button className="btn secondary small" disabled={!client}>Make a ticket</button></form>
              </div>
            </div>
            {!client && (
              <form action={linkWhatsAppToClient} className="card row">
                <input type="hidden" name="phone" value={phone} />
                <label style={{ flex: 1 }}>This number belongs to<select name="business_id" required defaultValue="">{[<option key="" value="" disabled>Choose a client</option>, ...(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)]}</select></label>
                <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="save_contact" defaultChecked /> Save as their owner's WhatsApp</label>
                <button className="btn secondary small" style={{ alignSelf: "flex-end" }}>Link</button>
              </form>
            )}
            <div className="card stack" style={{ background: "#efe9df" }}>
              {(thread ?? []).map((m: Row) => (
                <div key={m.id} className={`msg ${m.direction}`}>
                  <div className="meta">
                    <strong>{m.direction === "in" ? (m.contact_name ?? client?.contact_name ?? "Client") : `${m.author_name ?? "ZDMINC"}${m.pending ? " · waiting for their reply (template sent)" : ""}`}</strong>
                    <span>{new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{m.status === "failed" ? " · not sent" : ""}</span>
                  </div>
                  {m.body}
                  {m.status === "failed" && m.error && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{m.error}</div>}
                </div>
              ))}
              {(thread ?? []).length === 0 && <p className="muted">No messages yet. Your first message goes as the opening template.</p>}
            </div>
            <form action={sendWhatsApp} className="card stack">
              <input type="hidden" name="phone" value={phone} />
              {client && <input type="hidden" name="business_id" value={client.id} />}
              <textarea name="body" rows={3} placeholder={`Message ${client?.contact_name ?? `+${phone}`}`} required />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted">{open ? "They wrote in the last 24 hours." : "They haven't written in 24 hours, so WhatsApp only allows an approved template. They see your text once they reply."}</span>
                <button className="btn blue">Send on WhatsApp</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="card"><p className="muted">Pick a chat, or start one with a client.</p></div>
        )}
      </div>
    </>
  );
}
