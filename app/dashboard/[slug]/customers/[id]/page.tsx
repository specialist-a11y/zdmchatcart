import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { back, requireEditor, str } from "@/lib/crm-actions";
import { money, waLink } from "@/lib/order-text";

const cleanTags = (s: string) => [...new Set(s.split(",").map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean).map((t) => t.slice(0, 30)))].slice(0, 12);

async function saveProfile(f: FormData) {
  "use server";
  const slug = str(f, "slug"), id = str(f, "id");
  const path = `/dashboard/${slug}/customers/${id}`;
  const { db, business } = await requireEditor(slug, path);
  const { error } = await db.from("customers").update({
    name: str(f, "name").slice(0, 80) || null,
    email: str(f, "email").slice(0, 120) || null,
    notes: str(f, "notes").slice(0, 2000) || null,
    tags: cleanTags(str(f, "tags")),
  }).eq("id", id).eq("business_id", business.id);
  revalidatePath(path);
  back(path, error ? error.message : "Saved");
}

export default async function CustomerProfile({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug, id } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!c) notFound();
  const [{ data: orders }, { data: msgs }] = await Promise.all([
    supabase.from("orders").select("code, status, total, currency, created_at, paid_at, source, order_items(name, quantity)").eq("business_id", business.id).eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("messages").select("id, direction, body, channel, created_at").eq("business_id", business.id).eq("customer_id", id).order("created_at", { ascending: false }).limit(150),
  ]);
  type Ev = { at: string; kind: "order" | "paid" | "msg"; node: React.ReactNode };
  const events: Ev[] = [
    ...(orders ?? []).map((o: any): Ev => ({ at: o.created_at, kind: "order", node: <>
      <b>Order <Link href={`/dashboard/${slug}/orders/${o.code}`}>{o.code}</Link></b> <span className={`badge ${o.status}`}>{o.status.replace(/_/g, " ")}</span> {money(o.total, o.currency)}
      <br /><span className="muted" style={{ fontSize: 13 }}>{(o.order_items ?? []).map((i: any) => `${i.quantity} x ${i.name}`).join(", ")}</span></> })),
    ...(orders ?? []).filter((o: any) => o.paid_at).map((o: any): Ev => ({ at: o.paid_at, kind: "paid", node: <><b>Paid {o.code}</b> {money(o.total, o.currency)}</> })),
    ...(msgs ?? []).map((m: any): Ev => ({ at: m.created_at, kind: "msg", node: <><span className="muted" style={{ fontSize: 13 }}>{m.direction === "in" ? "They wrote" : "You wrote"} on {m.channel === "instagram" ? "Instagram" : "WhatsApp"}</span><br />{String(m.body ?? "").slice(0, 300)}</> })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const display = c.name ?? (c.instagram_username ? `@${c.instagram_username}` : c.phone ? `+${c.phone}` : "Customer");
  const consent = c.opted_out_at ? `Sent STOP on ${new Date(c.opted_out_at).toLocaleDateString("en-GB")}` : c.marketing_opt_in || c.whatsapp_opt_in ? "Can get offers on WhatsApp" : "Messages about their orders only";
  const canEdit = role !== "staff";
  const dot = { order: "var(--blue)", paid: "var(--teal)", msg: "#c4ccc8" };

  return (
    <div className="stack">
      <PageHeader n={num("customers")} title={display} sub={`${c.stage[0].toUpperCase()}${c.stage.slice(1)} customer since ${new Date(c.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
        actions={<><Link className="btn secondary small" href={`/dashboard/${slug}/customers`}>All customers</Link><Link className="btn small" href={`/dashboard/${slug}/inbox?c=${id}`}>Open chat</Link></>} />
      {msg && <p className={msg === "Saved" ? "ok" : "error"}>{msg}</p>}
      <div className="cols" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)" }}>
        <section className="card stack" style={{ gap: 0 }}>
          <h2 style={{ marginBottom: 8 }}>Timeline</h2>
          {events.map((e, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "14px minmax(0, 1fr)", gap: 10, padding: "8px 0", borderTop: i ? "1px solid #eef2f1" : undefined }}>
              <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: dot[e.kind], marginTop: 6 }} />
              <div style={{ overflowWrap: "anywhere" }}>{e.node}<br /><span className="muted" style={{ fontSize: 12 }}>{when(e.at)}</span></div>
            </div>
          ))}
          {!events.length && <p className="muted">Nothing yet.</p>}
        </section>
        <div className="stack">
          <section className="card stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Orders</span><b>{c.order_count}</b></div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Spent</span><b>{money(c.total_spent, business.currency)}</b></div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Last seen</span><b>{c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString("en-GB") : "-"}</b></div>
            {c.phone && <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">WhatsApp</span><a href={waLink(c.phone, "")} target="_blank" rel="noreferrer">+{c.phone}</a></div>}
            {c.instagram_username && <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Instagram</span><a href={`https://instagram.com/${c.instagram_username}`} target="_blank" rel="noreferrer">@{c.instagram_username}</a></div>}
            <span className={c.opted_out_at ? "error" : "muted"} style={{ fontSize: 13 }}>{consent}</span>
          </section>
          <form action={saveProfile} className="card stack" style={{ gap: 10 }}>
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} />
            <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
              <label>Name<input name="name" defaultValue={c.name ?? ""} maxLength={80} /></label>
              <label>Email<input name="email" type="email" defaultValue={c.email ?? ""} /></label>
              <label>Tags <span className="muted" style={{ fontWeight: 400 }}>(commas between)</span><input name="tags" defaultValue={(c.tags ?? []).join(", ")} placeholder="VIP, office orders" /></label>
              {(c.tags ?? []).length > 0 && <span className="row" style={{ gap: 4 }}>{c.tags.map((t: string) => <Link key={t} className="badge" style={{ textTransform: "none" }} href={`/dashboard/${slug}/customers?tag=${encodeURIComponent(t)}`}>{t}</Link>)}</span>}
              <label>Notes <span className="muted" style={{ fontWeight: 400 }}>(only your team sees these)</span><textarea name="notes" rows={4} maxLength={2000} defaultValue={c.notes ?? ""} placeholder="No nuts. Collects Saturdays." /></label>
              {canEdit && <button className="btn small" style={{ alignSelf: "flex-start" }}>Save</button>}
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}
