import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { money } from "@/lib/order-text";
import { PageHeader, Kpi } from "@/components/CrmShell";
import { Icon } from "@/components/Icon";
import { num } from "@/lib/crm-nav";
import { insights, type OrderLite } from "@/lib/insights";

const PAID = ["paid", "ready", "fulfilled"];
const DAY = 864e5;
const tz = "America/Barbados";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

export default async function TodayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business, user } = await requireMembership(slug);
  const base = `/dashboard/${slug}`;
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const [{ data: orders }, { data: products }, { data: msgs }, { count: newCustomers }, { count: adsOk }, { count: toChoose }, { count: noPhone }] = await Promise.all([
    supabase.from("orders").select("id, code, status, source, total, created_at, paid_at, order_items(product_id, name, quantity, unit_price)").eq("business_id", business.id).gte("created_at", since30).order("created_at", { ascending: false }).limit(2000),
    supabase.from("products").select("id, name, active, created_at").eq("business_id", business.id),
    supabase.from("messages").select("customer_id, direction, created_at, body, customers(name, phone)").eq("business_id", business.id).gte("created_at", new Date(now - 7 * DAY).toISOString()).order("created_at", { ascending: false }).limit(400),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id).gte("created_at", new Date(now - 7 * DAY).toISOString()),
    supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "needs_approval"),
    supabase.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "published").eq("chosen", false),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "awaiting_confirmation"),
  ]);
  const all = (orders ?? []) as unknown as OrderLite[];
  const paid = all.filter((o) => PAID.includes(o.status));
  const todayKey = dayKey(new Date().toISOString());
  const paidToday = paid.filter((o) => o.paid_at && dayKey(o.paid_at) === todayKey);
  const lastWeekSame = dayKey(new Date(now - 7 * DAY).toISOString());
  const paidLastWeekSame = paid.filter((o) => o.paid_at && dayKey(o.paid_at) === lastWeekSame);
  const sum = (xs: OrderLite[]) => xs.reduce((s, o) => s + Number(o.total), 0);
  const change = sum(paidLastWeekSame) > 0 ? Math.round(((sum(paidToday) - sum(paidLastWeekSame)) / sum(paidLastWeekSame)) * 100) : null;
  const awaiting = all.filter((o) => o.status === "awaiting_payment");
  const carts = all.filter((o) => o.status === "abandoned");

  // Last 7 days of paid sales
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(now - (6 - i) * DAY);
    const k = dayKey(d.toISOString());
    return { k, label: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }), total: sum(paid.filter((o) => o.paid_at && dayKey(o.paid_at) === k)) };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const week = days.reduce((s, d) => s + d.total, 0);

  // Where orders came from (last 30 days)
  const srcNames: Record<string, string> = { web: "Website", whatsapp: "WhatsApp", instagram: "Instagram", manual: "By hand" };
  const srcColors: Record<string, string> = { web: "#1D5FD1", whatsapp: "#5DD39E", instagram: "#E89A8A", manual: "#9AA7A2" };
  const bySrc = Object.entries(all.reduce<Record<string, number>>((m, o) => ((m[o.source] = (m[o.source] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const totalSrc = bySrc.reduce((s, [, n]) => s + n, 0) || 1;

  // Top sellers (last 30 days, paid)
  const sold = new Map<string, number>();
  for (const o of paid) for (const i of o.order_items ?? []) sold.set(i.name, (sold.get(i.name) ?? 0) + i.quantity);
  const top = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  // Chats where the customer wrote last
  const lastBy = new Map<string, any>();
  for (const m of msgs ?? []) if (m.customer_id && !lastBy.has(m.customer_id)) lastBy.set(m.customer_id, m);
  const waiting = [...lastBy.values()].filter((m) => m.direction === "in");

  const tips = insights(all, (products ?? []) as any, now);
  const needs = [
    waiting.length && { icon: "inbox", t: `${waiting.length} chat${waiting.length > 1 ? "s are" : " is"} waiting for you`, d: waiting.slice(0, 2).map((m) => `${m.customers?.name ?? "+" + (m.customers?.phone ?? "")}: ${String(m.body ?? "").slice(0, 40)}`).join("; "), go: "Open inbox", href: `${base}/inbox` },
    noPhone && { icon: "orders", t: `${noPhone} order${noPhone > 1 ? "s need" : " needs"} confirming`, d: "Started on the website, not confirmed in WhatsApp yet.", go: "Review", href: `${base}/orders?status=awaiting_confirmation` },
    awaiting.length && { icon: "card", t: `${awaiting.length} payment link${awaiting.length > 1 ? "s" : ""} not paid yet`, d: `${money(sum(awaiting), business.currency)} waiting.`, go: "See orders", href: `${base}/orders?status=awaiting_payment` },
    adsOk && { icon: "ads", t: `${adsOk} ad${adsOk > 1 ? "s need" : " needs"} your OK`, d: "ZDMINC is ready to launch.", go: "Approve", href: `${base}/ads` },
    toChoose && { icon: "videos", t: `${toChoose} video${toChoose > 1 ? "s" : ""} not chosen yet`, d: "Pick the ones you want posted.", go: "Choose", href: `${base}/videos` },
  ].filter(Boolean) as { icon: string; t: string; d: string; go: string; href: string }[];

  const first = (user.user_metadata?.full_name || user.user_metadata?.name || "").split(" ")[0];
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });

  return (
    <div className="stack">
      <PageHeader n={num("")} title="Today" sub={`${first ? `Good ${Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())) < 12 ? "morning" : Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())) < 17 ? "afternoon" : "evening"}, ${first}. ` : ""}${dateLine}.`}
        actions={<Link className="btn small" href={`${base}/orders`}><Icon name="orders" size={16} />Orders</Link>} />

      <section className="insight" aria-label="Zero guesswork">
        <div><h2>Zero guesswork</h2><small>What the last 30 days say</small></div>
        <div><span className="tag">SCALE</span><b>{tips.scale.title}</b><small>{tips.scale.detail}</small></div>
        <div><span className="tag kill">KILL</span><b>{tips.kill.title}</b><small>{tips.kill.detail}</small></div>
        <div><span className="tag">TIMING</span><b>{tips.timing.title}</b><small>{tips.timing.detail}</small></div>
      </section>

      <div className="kpis">
        <Kpi label="Paid today" value={money(sum(paidToday), business.currency)} tone="blue"
          sub={change == null ? `${paidToday.length} orders` : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs last ${new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: tz })}`} />
        <Kpi label="Awaiting payment" value={awaiting.length} sub={`${money(sum(awaiting), business.currency)} in open links`} tone={awaiting.length ? "amber" : undefined} />
        <Kpi label="Carts to recover" value={carts.length} sub="Reminders go out on WhatsApp" />
        <Kpi label="New customers this week" value={newCustomers ?? 0} />
      </div>

      <div className="cols" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
        <section className="card needs">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Needs you</h2>{needs.length > 0 && <span className="badge high">{needs.length} item{needs.length > 1 ? "s" : ""}</span>}</div>
          {needs.map((x) => (
            <Link key={x.t} className="item" href={x.href}>
              <span className="ico"><Icon name={x.icon} /></span>
              <span className="t"><b>{x.t}</b><span className="muted" style={{ fontSize: 13 }}>{x.d}</span></span>
              <span className="go">{x.go} ›</span>
            </Link>
          ))}
          {needs.length === 0 && <p className="muted">All clear. Nothing is waiting for you.</p>}
        </section>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Sales this week</h2><span className="muted">{money(week, business.currency)}</span></div>
          <div className="bars" role="img" aria-label={`Paid sales by day: ${days.map((d) => `${d.label} ${money(d.total, business.currency)}`).join(", ")}`}>
            {days.map((d) => (
              <div key={d.k} className={d.k === todayKey ? "today" : ""}>
                <span>{d.total ? `$${Math.round(d.total)}` : ""}</span>
                <i style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }} />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="cols">
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Where orders came from</h2>
          <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "#eef2f1" }}>
            {bySrc.map(([k, n]) => <span key={k} style={{ width: `${(n / totalSrc) * 100}%`, background: srcColors[k] ?? "#9AA7A2" }} />)}
          </div>
          {bySrc.map(([k, n]) => (
            <div key={k} className="row" style={{ justifyContent: "space-between" }}><span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: srcColors[k] ?? "#9AA7A2", display: "inline-block" }} />{srcNames[k] ?? k}</span><b>{Math.round((n / totalSrc) * 100)}%</b></div>
          ))}
          {!bySrc.length && <p className="muted">No orders in the last 30 days yet.</p>}
        </section>
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Top sellers</h2><Link href={`${base}/products`}>Products ›</Link></div>
          {top.map(([n, q]) => <div key={n} className="row" style={{ justifyContent: "space-between" }}><span>{n}</span><b>{q} sold</b></div>)}
          {!top.length && <p className="muted">Your best sellers show here once orders are paid.</p>}
        </section>
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Quick links</h2>
          <Link href={`/s/${slug}`} target="_blank" className="row" style={{ gap: 8 }}><Icon name="website" size={16} />Your shop page</Link>
          <Link href={`${base}/inbox`} className="row" style={{ gap: 8 }}><Icon name="inbox" size={16} />Inbox</Link>
          <Link href={`${base}/support`} className="row" style={{ gap: 8 }}><Icon name="support" size={16} />Ask ZDMINC</Link>
        </section>
      </div>
    </div>
  );
}
