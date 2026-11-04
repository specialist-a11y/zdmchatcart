import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFromBusiness } from "@/lib/payments";
import { insideServiceWindow } from "@/lib/whatsapp";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";

async function reply(f: FormData) {
  "use server";
  const slug = String(f.get("slug"));
  const { supabase, business } = await requireMembership(slug);
  const customerId = String(f.get("customer_id"));
  const body = String(f.get("body") ?? "").trim();
  const back = (m: string): never => redirect(`/dashboard/${slug}/inbox?c=${customerId}&msg=${encodeURIComponent(m)}`);
  if (!body) back("Write a message first");
  const { data: c } = await supabase.from("customers").select("id, phone").eq("id", customerId).eq("business_id", business.id).single();
  if (!c?.phone) back("This customer has no WhatsApp number");
  const res = await sendFromBusiness(createAdminClient(), business.id, c!.phone!, body.slice(0, 4000), { customerId: c!.id });
  back(res.ok ? "Sent" : `Not sent: ${res.error ?? "WhatsApp refused it"}`);
}

export default async function InboxPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; msg?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  const { data: recent } = await supabase.from("messages")
    .select("customer_id, direction, body, created_at, channel, customers(id, name, phone, stage, order_count, total_spent)")
    .eq("business_id", business.id).not("customer_id", "is", null).order("created_at", { ascending: false }).limit(600);
  const threads = new Map<string, any>();
  for (const m of recent ?? []) if (!threads.has(m.customer_id!)) threads.set(m.customer_id!, m);
  const list = [...threads.values()];
  const cid = sp.c ?? list[0]?.customer_id;
  const { data: thread } = cid ? await supabase.from("messages").select("id, direction, body, created_at, channel").eq("business_id", business.id).eq("customer_id", cid).order("created_at").limit(200) : { data: [] as any[] };
  const cur = threads.get(cid ?? "")?.customers;
  const lastIn = [...(thread ?? [])].reverse().find((m) => m.direction === "in")?.created_at;
  const open = insideServiceWindow(lastIn);
  const name = (c: any) => c?.name ?? (c?.phone ? `+${c.phone}` : "Customer");
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="stack">
      <PageHeader n={num("inbox")} title="Inbox" sub="Your WhatsApp chats. The bot answers order codes first; you can step in any time." />
      {sp.msg && <p className={sp.msg === "Sent" ? "ok" : "error"}>{sp.msg}</p>}
      <div className="chat">
        <div className="card list" style={{ padding: 0, overflow: "hidden" }}>
          {list.map((m) => (
            <Link key={m.customer_id} className="item" href={`?c=${m.customer_id}`} aria-current={m.customer_id === cid ? "true" : undefined}>
              <span className="row" style={{ justifyContent: "space-between" }}><b>{name(m.customers)}</b><span className="muted" style={{ fontSize: 12 }}>{when(m.created_at)}</span></span>
              <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.direction === "out" ? "You: " : ""}{m.body}</span>
              {m.direction === "in" && <span className="badge sent" style={{ alignSelf: "flex-start" }}>Waiting for you</span>}
            </Link>
          ))}
          {!list.length && <p className="muted" style={{ padding: 14 }}>No chats yet. When customers message your WhatsApp number they show up here.</p>}
        </div>
        {cid ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="card row" style={{ justifyContent: "space-between" }}>
              <div><b style={{ fontSize: 17 }}>{name(cur)}</b><br /><span className="muted" style={{ fontSize: 13 }}>{cur?.phone ? `+${cur.phone} · ` : ""}{cur?.order_count ?? 0} orders · {Number(cur?.total_spent ?? 0) ? `BBD $${Number(cur.total_spent).toFixed(2)} spent` : "no purchases yet"}</span></div>
              <Link className="btn secondary small" href={`/dashboard/${slug}/customers`}>Customers</Link>
            </div>
            <div className="card" style={{ background: "#efe9df", display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
              {(thread ?? []).map((m) => <div key={m.id} className={`bubble ${m.direction}`}>{m.body}<small>{when(m.created_at)}</small></div>)}
            </div>
            <form action={reply} className="card stack" style={{ gap: 10 }}>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="customer_id" value={cid} />
              <textarea name="body" rows={3} placeholder={`Reply to ${name(cur)} on WhatsApp`} required />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: 13, flex: "1 1 220px" }}>{open ? "They wrote in the last 24 hours, so your reply sends as written." : "More than 24 hours since they wrote. WhatsApp may block a free-text reply; ZDMINC can set up an approved template for this."}</span>
                <button className="btn blue">Send</button>
              </div>
            </form>
          </div>
        ) : <div className="soon"><b>Pick a chat</b><p className="muted" style={{ margin: 0 }}>Conversations appear here as customers message you.</p></div>}
      </div>
    </div>
  );
}
