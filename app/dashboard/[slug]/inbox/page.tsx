import { gateSection } from "@/components/PlanLock";
import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { insideServiceWindow } from "@/lib/whatsapp";
import { money } from "@/lib/order-text";
import { readVariants } from "@/lib/catalog";
import { createOrderFromChat, reply, sendPayLink } from "./actions";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { back as goBack, requireEditor, str } from "@/lib/crm-actions";
import ReplyBox from "./ReplyBox";

const STARTERS = [
  { title: "Shop link", body: "Hi {name}! You can see everything and order here: {shop_link}" },
  { title: "Hours", body: "We're open Tuesday to Saturday, 8am to 5pm." },
  { title: "Delivery", body: "We deliver island-wide. Delivery is BBD 15 and we'll confirm a time with you." },
  { title: "Thanks", body: "Thank you {name}! Enjoy, and see you again soon." },
];

async function addQuickReply(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const path = `/dashboard/${slug}/inbox${str(f, "c") ? `?c=${str(f, "c")}` : ""}`;
  const { db, business } = await requireEditor(slug, path);
  const title = str(f, "title").slice(0, 40), body = str(f, "body").slice(0, 1000);
  if (!title || !body) goBack(path, "Give the saved reply a short name and the wording");
  const { error } = await db.from("quick_replies").insert({ business_id: business.id, title, body, sort_order: Date.now() % 1_000_000 });
  goBack(path, error ? "Couldn't save. Run migration 0014_journeys_quickwins.sql first." : "Saved reply added");
}

async function addStarters(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const path = `/dashboard/${slug}/inbox`;
  const { db, business } = await requireEditor(slug, path);
  const { error } = await db.from("quick_replies").insert(STARTERS.map((r, i) => ({ business_id: business.id, ...r, sort_order: i })));
  goBack(path, error ? "Couldn't save. Run migration 0014_journeys_quickwins.sql first." : "Starter replies added. Change the hours and delivery wording to match yours.");
}

async function removeQuickReply(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const path = `/dashboard/${slug}/inbox`;
  const { db, business } = await requireEditor(slug, path);
  await db.from("quick_replies").delete().eq("business_id", business.id).eq("id", str(f, "id"));
  goBack(path, "Saved reply removed");
}


export default async function InboxPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; msg?: string; f?: string }> }) {
  const { slug } = await params;
  const lock = await gateSection(slug, "inbox");
  if (lock) return lock;
  const sp = await searchParams;
  const filter = ["waiting", "whatsapp", "instagram"].includes(sp.f ?? "") ? sp.f! : "all";
  const { supabase, business, role } = await requireMembership(slug);
  const { data: quick } = await supabase.from("quick_replies").select("id, title, body").eq("business_id", business.id).order("sort_order");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const cust = "id, name, phone, instagram_id, stage, order_count, total_spent";
  const recentQ = (cols: string) => supabase.from("messages")
    .select(`customer_id, direction, body, created_at, channel, customers(${cols})` as "*")
    .eq("business_id", business.id).not("customer_id", "is", null).order("created_at", { ascending: false }).limit(800);
  let { data: recent, error: rErr } = await recentQ(`${cust}, instagram_username`) as { data: any[] | null; error: any };
  if (rErr) recent = (await recentQ(cust)).data as any[] | null;
  const threads = new Map<string, any>();
  for (const m of recent ?? []) if (!threads.has(m.customer_id!)) threads.set(m.customer_id!, m);
  const all = [...threads.values()];
  const list = all.filter((m) => filter === "all" || (filter === "waiting" ? m.direction === "in" : m.channel === filter));
  const waitingN = all.filter((m) => m.direction === "in").length;
  const cid = sp.c ?? list[0]?.customer_id;
  const [{ data: thread }, { data: openOrders }, { data: products }] = cid ? await Promise.all([
    supabase.from("messages").select("id, direction, body, created_at, channel").eq("business_id", business.id).eq("customer_id", cid).order("created_at").limit(200),
    supabase.from("orders").select("code, status, total, currency, created_at").eq("business_id", business.id).eq("customer_id", cid).order("created_at", { ascending: false }).limit(4),
    supabase.from("products").select("*").eq("business_id", business.id).eq("active", true).order("sort_order"),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];
  const cur = threads.get(cid ?? "")?.customers;
  const lastIn = [...(thread ?? [])].reverse().find((m) => m.direction === "in");
  // Reply on the channel they last wrote on; WhatsApp if we have their number and nothing else.
  const channel: "whatsapp" | "instagram" = lastIn?.channel === "instagram" || (!cur?.phone && cur?.instagram_id) ? "instagram" : "whatsapp";
  const open = insideServiceWindow(lastIn?.created_at);
  const name = (c: any) => c?.name ?? (c?.instagram_username ? `@${c.instagram_username}` : c?.phone ? `+${c.phone}` : "Customer");
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const tag = (ch: string) => <span className={`badge ${ch === "instagram" ? "ig" : "wa"}`} style={{ textTransform: "none", fontSize: 11, padding: "2px 7px" }}>{ch === "instagram" ? "IG" : "WA"}</span>;
  const payable = (openOrders ?? []).find((o: any) => ["awaiting_confirmation", "awaiting_payment"].includes(o.status));
  const picks = (products ?? []).flatMap((p: any) => {
    const vs = readVariants(p.variants).filter((v) => v.available);
    return vs.length ? vs.map((v) => ({ value: `${p.id}:${v.id}`, label: `${p.name} (${v.name})${Number(v.price) ? ` · ${money(v.price, business.currency)}` : ""}` }))
      : [{ value: p.id, label: `${p.name}${Number(p.price) ? ` · ${money(p.price, business.currency)}` : " · price to confirm"}` }];
  });
  const isErr = (m: string) => /^(Not sent|Write|This customer|Couldn|Only|Give|Order not|Connect|Customer not)/.test(m) || /but not sent/.test(m);

  return (
    <div className="stack">
      <PageHeader n={num("inbox")} title="Inbox" sub="WhatsApp and Instagram chats in one place. The bot answers order codes first; you can step in any time." />
      {sp.msg && <p className={isErr(sp.msg) ? "error" : "ok"}>{sp.msg}</p>}
      <nav className="pills" aria-label="Filter chats">
        {[["all", `All ${all.length || ""}`], ["waiting", `Waiting ${waitingN || ""}`], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]].map(([k, l]) => (
          <Link key={k} href={`?f=${k}`} aria-current={filter === k ? "true" : undefined}>{l}</Link>
        ))}
      </nav>
      <div className="chat">
        <div className="card list" style={{ padding: 0, overflow: "hidden" }}>
          {list.map((m) => (
            <Link key={m.customer_id} className="item" href={`?c=${m.customer_id}${filter !== "all" ? `&f=${filter}` : ""}`} aria-current={m.customer_id === cid ? "true" : undefined}>
              <span className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}><span className="row" style={{ gap: 6, minWidth: 0 }}>{tag(m.channel)}<b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(m.customers)}</b></span><span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{when(m.created_at)}</span></span>
              <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.direction === "out" ? "You: " : ""}{m.body}</span>
              {m.direction === "in" && <span className="badge sent" style={{ alignSelf: "flex-start" }}>Waiting for you</span>}
            </Link>
          ))}
          {!list.length && <p className="muted" style={{ padding: 14 }}>{filter === "all" ? "No chats yet. When customers message your WhatsApp number or Instagram they show up here." : "Nothing here."}</p>}
        </div>
        {cid ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="card row" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{name(cur)}</b> {tag(channel)}<br /><span className="muted" style={{ fontSize: 13 }}>{cur?.phone ? `+${cur.phone} · ` : ""}<span className="badge" style={{ fontSize: 11 }}>{cur?.stage}</span> · {cur?.order_count ?? 0} orders · {Number(cur?.total_spent ?? 0) ? `${money(cur.total_spent, business.currency)} spent` : "no purchases yet"}</span></div>
              <Link className="btn secondary small" href={`/dashboard/${slug}/customers/${cid}`}>Profile</Link>
            </div>
            <div className="card" style={{ background: "#efe9df", display: "flex", flexDirection: "column", gap: 8, maxHeight: "55vh", overflowY: "auto" }}>
              {(thread ?? []).map((m) => <div key={m.id} className={`bubble ${m.direction}`}>{m.body}<small>{m.channel === "instagram" ? "Instagram · " : ""}{when(m.created_at)}</small></div>)}
            </div>
            <form action={reply} className="card stack" style={{ gap: 10 }}>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="customer_id" value={cid} /><input type="hidden" name="channel" value={channel} />
              <ReplyBox replies={quick ?? []} placeholder={`Reply to ${name(cur)} on ${channel === "instagram" ? "Instagram" : "WhatsApp"}`} vars={{ name: cur?.name?.split(" ")[0] ?? "", shop_link: `${site}/s/${slug}` }} />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: 13, flex: "1 1 220px" }}>{open ? "They wrote in the last 24 hours, so your reply sends as written."
                  : channel === "instagram" ? "More than 24 hours since they wrote. Instagram may not deliver this; reply from the Instagram app instead."
                  : "More than 24 hours since they wrote. WhatsApp may block a free-text reply. Approved templates are on the WhatsApp page."}</span>
                <button className="btn blue">Send</button>
              </div>
            </form>

            <div className="cols">
              <section className="card stack" style={{ gap: 8 }}>
                <b>Their orders</b>
                {(openOrders ?? []).map((o: any) => (
                  <div key={o.code} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                    <Link href={`/dashboard/${slug}/orders/${o.code}`}><b>{o.code}</b></Link>
                    <span className={`badge ${o.status}`}>{o.status.replace(/_/g, " ")}</span>
                    <span>{money(o.total, o.currency)}</span>
                  </div>
                ))}
                {!openOrders?.length && <span className="muted" style={{ fontSize: 14 }}>No orders yet.</span>}
                {payable && (
                  <form action={sendPayLink}>
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="customer_id" value={cid} /><input type="hidden" name="channel" value={channel} /><input type="hidden" name="code" value={payable.code} />
                    <button className="btn coral small">Send pay link for {payable.code}</button>
                  </form>
                )}
              </section>
              <details className="card">
                <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>+ Create an order for {name(cur)}</summary>
                {picks.length ? (
                  <form action={createOrderFromChat} className="stack" style={{ gap: 8, marginTop: 8 }}>
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="customer_id" value={cid} /><input type="hidden" name="channel" value={channel} />
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <select name={`item${i}`} defaultValue="" aria-label={`Item ${i + 1}`} style={{ flex: 1, minWidth: 0 }} required={i === 0}>
                          <option value="">{i === 0 ? "Pick an item" : "Another item (optional)"}</option>
                          {picks.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <input name={`qty${i}`} type="number" min={1} max={99} defaultValue={1} inputMode="numeric" aria-label="Quantity" style={{ width: 70 }} />
                      </div>
                    ))}
                    <select name="fulfillment" defaultValue="" aria-label="Pickup or delivery"><option value="">Pickup or delivery: ask later</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select>
                    <input name="note" maxLength={500} placeholder="Note, like: no nuts, for Saturday" />
                    <label className="row" style={{ flexDirection: "row", gap: 6, fontWeight: 500 }}><input type="checkbox" name="send" defaultChecked style={{ width: 20, height: 20 }} />Send the summary and payment link in this chat</label>
                    <button className="btn small" style={{ alignSelf: "flex-start" }}>Create order</button>
                  </form>
                ) : <p className="muted" style={{ margin: "8px 0 0" }}>Add products first, then you can make orders from the chat.</p>}
              </details>
            </div>
          </div>
        ) : <div className="soon"><b>Pick a chat</b><p className="muted" style={{ margin: 0 }}>Conversations appear here as customers message you.</p></div>}
      </div>

      {role !== "staff" && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>Saved replies ({(quick ?? []).length})</summary>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            <p className="muted" style={{ margin: 0 }}>Answers you give often: hours, prices, delivery. Tap one above the reply box to use it. {"{name}"} becomes the customer's first name and {"{shop_link}"} your shop link.</p>
            {(quick ?? []).map((r) => (
              <form key={r.id} action={removeQuickReply} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #eef2f1", paddingTop: 8 }}>
                <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={r.id} />
                <span style={{ flex: "1 1 240px", minWidth: 0 }}><b>{r.title}</b><br /><span className="muted" style={{ fontSize: 14 }}>{r.body}</span></span>
                <button className="btn secondary small">Remove</button>
              </form>
            ))}
            {!(quick ?? []).length && (
              <form action={addStarters}><input type="hidden" name="slug" value={slug} /><button className="btn secondary small">Add 4 starter replies</button></form>
            )}
            <form action={addQuickReply} className="stack" style={{ gap: 8 }}>
              <input type="hidden" name="slug" value={slug} />{cid && <input type="hidden" name="c" value={cid} />}
              <input name="title" maxLength={40} placeholder="Short name, like Prices" required />
              <textarea name="body" rows={2} maxLength={1000} placeholder="The reply, like: Black cake is BBD 60 for 6 inch and BBD 90 for 8 inch." required />
              <button className="btn small" style={{ alignSelf: "flex-start" }}>Add saved reply</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
