import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { PageHeader, Kpi } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import LocalTime from "../content/LocalTime";

export default async function MarketingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business } = await requireMembership(slug);
  const base = `/dashboard/${slug}`;
  const [{ data: chosen }, { data: scheduled }, { count: running }, { data: attributed }] = await Promise.all([
    supabase.from("video_clips").select("id, title, caption, chosen_at").eq("business_id", business.id).eq("chosen", true).order("chosen_at", { ascending: false }).limit(12),
    supabase.from("social_posts").select("id, caption, platforms, scheduled_at, media_ids").eq("business_id", business.id).in("status", ["scheduled", "publishing"]).order("scheduled_at").limit(12),
    supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "running"),
    supabase.from("orders").select("attribution, total").eq("business_id", business.id).not("attribution", "is", null).in("status", ["paid", "ready", "fulfilled"]).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
  ]);
  const byCode = new Map<string, { n: number; sales: number }>();
  for (const o of attributed ?? []) { const c = byCode.get(o.attribution!) ?? { n: 0, sales: 0 }; c.n++; c.sales += Number(o.total); byCode.set(o.attribution!, c); }
  const sold = [...byCode.entries()].sort((a, b) => b[1].sales - a[1].sales);
  return (
    <div className="stack">
      <PageHeader n={num("marketing")} title="Marketing" sub="What's lined up to post, and which posts and ads actually sold."
        actions={<><Link className="btn secondary small" href={`${base}/content`}>Schedule a post</Link><Link className="btn small" href={`${base}/ads`}>Ads</Link></>} />
      <div className="kpis">
        <Kpi label="Posts scheduled" value={scheduled?.length ?? 0} tone="blue" />
        <Kpi label="Clips picked for ZDMINC" value={chosen?.length ?? 0} />
        <Kpi label="Ads running" value={running ?? 0} />
        <Kpi label="Orders from tracked links, 30 days" value={(attributed ?? []).length} />
      </div>
      <div className="cols">
        <section className="card stack" style={{ gap: 8 }}>
          <h2>Lined up for posting</h2>
          {(scheduled ?? []).map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <b><LocalTime iso={p.scheduled_at} /></b> <span className="muted" style={{ fontSize: 13 }}>· {p.platforms.map((x: string) => (x === "instagram" ? "Instagram" : "Facebook")).join(" + ")} · {p.media_ids.length} item{p.media_ids.length > 1 ? "s" : ""}</span>
              {p.caption && <><br /><span className="muted" style={{ fontSize: 13 }}>{p.caption.slice(0, 140)}</span></>}
            </div>
          ))}
          {(chosen ?? []).map((c) => <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}><b>{c.title}</b> <span className="badge">ZDMINC posts</span>{c.caption && <><br /><span className="muted" style={{ fontSize: 13 }}>{c.caption}</span></>}</div>)}
          {!scheduled?.length && !chosen?.length && <p className="muted">Nothing lined up. <Link href={`${base}/content`}>Schedule a post</Link> or pick ZDMINC clips for the team to post.</p>}
        </section>
        <section className="card stack" style={{ gap: 8 }}>
          <h2>What sold, last 30 days</h2>
          {sold.map(([code, v]) => <div key={code} className="row" style={{ justifyContent: "space-between" }}><span>Link code <b>{code}</b></span><b>{v.n} orders · BBD ${v.sales.toFixed(0)}</b></div>)}
          {!sold.length && <p className="muted">Add ?ref=CODE to links in your posts and ads, and sales show here.</p>}
        </section>
      </div>
    </div>
  );
}
