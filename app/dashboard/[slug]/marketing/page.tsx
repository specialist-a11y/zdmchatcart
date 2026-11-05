import Link from "next/link";
import { requireMembership } from "@/lib/business";
import { PageHeader, Kpi } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { bbDate, monthGrid, monthRange, parseMonth, shiftMonth } from "@/lib/calendar";

const CSS = `
.mk-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.mk-cal .h { font-size: 12px; font-weight: 800; color: var(--muted); text-align: center; padding: 4px 0; }
.mk-day { min-height: 92px; border: 1.5px solid var(--line); border-radius: 10px; padding: 5px; background: #fff; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mk-day.out { background: transparent; border-style: dashed; opacity: .4; }
.mk-day.today { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(61,139,255,.2); }
.mk-day > b { font-size: 12px; }
.mk-chip { font-size: 11px; line-height: 1.25; border-radius: 6px; padding: 2px 5px; background: var(--teal-soft); color: #154aa6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mk-chip.published { background: #e6f7ee; color: #146c43; }
.mk-chip.failed, .mk-chip.partial { background: #fbe3dc; color: #8c2f1c; }
.mk-meter { height: 8px; border-radius: 4px; background: #eef2f1; overflow: hidden; }
.mk-meter i { display: block; height: 100%; background: var(--blue); }
@media (max-width: 640px) { .mk-day { min-height: 54px; } .mk-chip span { display: none; } .mk-chip { padding: 0; height: 6px; } }
`;
const STATUS: Record<string, string> = { scheduled: "Scheduled", publishing: "Posting", published: "Posted", partial: "Partly posted", failed: "Failed" };

export default async function MarketingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ m?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, business } = await requireMembership(slug);
  const base = `/dashboard/${slug}`;
  const today = bbDate(new Date().toISOString());
  const month = parseMonth(sp.m, today);
  const range = monthRange(month.key);
  const thisMonth = monthRange(today.slice(0, 7));
  const [{ data: posts }, { count: running }, { data: attributed }, { data: sub }, { data: chosenNow }, { count: drafts }] = await Promise.all([
    supabase.from("social_posts").select("id, caption, platforms, scheduled_at, status, media_ids").eq("business_id", business.id).neq("status", "cancelled")
      .gte("scheduled_at", range.start).lt("scheduled_at", range.end).order("scheduled_at"),
    supabase.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "running"),
    supabase.from("orders").select("attribution, total").eq("business_id", business.id).not("attribution", "is", null).in("status", ["paid", "ready", "fulfilled"]).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    supabase.from("subscriptions").select("plan_id, plans(name, video_clips, image_posts)").eq("business_id", business.id).maybeSingle<any>(),
    supabase.from("video_clips").select("id, kind").eq("business_id", business.id).eq("chosen", true).eq("source", "zdm").gte("chosen_at", thisMonth.start),
    supabase.from("video_clips").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("source", "zdm").eq("status", "published").eq("chosen", false).eq("skipped", false),
  ]);
  let plan = sub?.plans as { name: string; video_clips: number; image_posts?: number } | null;
  if (!plan && sub?.plan_id) plan = (await supabase.from("plans").select("name, video_clips").eq("id", sub.plan_id).maybeSingle<any>()).data; // before 0015
  const videosUsed = (chosenNow ?? []).filter((c: any) => c.kind !== "image").length;
  const imagesUsed = (chosenNow ?? []).filter((c: any) => c.kind === "image").length;

  const byDay = new Map<string, any[]>();
  for (const p of posts ?? []) { const d = bbDate(p.scheduled_at); byDay.set(d, [...(byDay.get(d) ?? []), p]); }
  const next = (posts ?? []).find((p: any) => p.status === "scheduled" && Date.parse(p.scheduled_at) > Date.now());
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Barbados", hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  const where = (p: any) => p.platforms.map((x: string) => (x === "instagram" ? "IG" : "FB")).join("+");
  const monthName = new Date(`${month.key}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const byCode = new Map<string, { n: number; sales: number }>();
  for (const o of attributed ?? []) { const c = byCode.get(o.attribution!) ?? { n: 0, sales: 0 }; c.n++; c.sales += Number(o.total); byCode.set(o.attribution!, c); }
  const sold = [...byCode.entries()].sort((a, b) => b[1].sales - a[1].sales);
  const meter = (label: string, used: number, of: number) => (
    <div key={label} className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><span>{label}</span><b>{used} of {of}</b></div>
      <div className="mk-meter"><i style={{ width: `${Math.min(100, (used / of) * 100)}%`, background: used >= of ? "#e0a23b" : undefined }} /></div>
    </div>
  );

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageHeader n={num("marketing")} title="Marketing" sub="Your posting calendar, what ZDMINC has made for you, and which posts and ads sold."
        actions={<><Link className="btn secondary small" href={`${base}/support?t=new&subject=${encodeURIComponent("Request a post")}`}>Request a post</Link><Link className="btn small" href={`${base}/content`}>Schedule a post</Link></>} />
      <div className="kpis">
        <Kpi label={`Posts in ${monthName.split(" ")[0]}`} value={posts?.length ?? 0} tone="blue" />
        <Kpi label="Waiting for your OK" value={drafts ?? 0} tone={drafts ? "amber" : undefined} />
        <Kpi label="Ads running" value={running ?? 0} />
        <Kpi label="Orders from tracked links, 30 days" value={(attributed ?? []).length} />
      </div>

      <div className="cols" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(260px, 1fr)" }}>
        <section className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>{monthName}</h2>
            <span className="row" style={{ gap: 6 }}>
              <Link className="btn secondary small" href={`?m=${shiftMonth(month.key, -1)}`} aria-label="Previous month">‹</Link>
              {month.key !== today.slice(0, 7) && <Link className="btn secondary small" href="?">Today</Link>}
              <Link className="btn secondary small" href={`?m=${shiftMonth(month.key, 1)}`} aria-label="Next month">›</Link>
            </span>
          </div>
          <div className="mk-cal" role="grid" aria-label={`Posts in ${monthName}`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="h">{d}</span>)}
            {monthGrid(month.year, month.month).flat().map((d, i) => {
              if (!d) return <div key={`x${i}`} className="mk-day out" aria-hidden="true" />;
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className={`mk-day${d === today ? " today" : ""}`} role="gridcell" aria-label={`${d}: ${list.length} post${list.length === 1 ? "" : "s"}`}>
                  <b>{Number(d.slice(8))}</b>
                  {list.slice(0, 3).map((p) => <span key={p.id} className={`mk-chip ${p.status}`} title={`${time(p.scheduled_at)} ${where(p)} · ${STATUS[p.status] ?? p.status}: ${p.caption.slice(0, 80)}`}><span>{time(p.scheduled_at)} {where(p)}</span></span>)}
                  {list.length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{list.length - 3}</span>}
                </div>
              );
            })}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {(posts ?? []).map((p: any) => (
              <div key={p.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 6, gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <b style={{ whiteSpace: "nowrap", fontSize: 14 }}>{new Date(p.scheduled_at).toLocaleDateString("en-GB", { timeZone: "America/Barbados", weekday: "short", day: "numeric" })} {time(p.scheduled_at)}</b>
                <span style={{ minWidth: 0, fontSize: 14 }}><span className={`badge ${p.status === "published" ? "paid" : p.status === "failed" ? "failed" : ""}`} style={{ textTransform: "none" }}>{STATUS[p.status] ?? p.status}</span> {where(p)} · <span className="muted">{p.caption.slice(0, 90) || "No caption"}</span></span>
              </div>
            ))}
            {!posts?.length && <p className="muted" style={{ margin: 0 }}>Nothing planned this month. <Link href={`${base}/content`}>Schedule a post</Link> or pick ZDMINC clips.</p>}
          </div>
        </section>

        <div className="stack">
          <section className="card stack" style={{ gap: 10 }}>
            <h2>This month from ZDMINC</h2>
            {plan?.video_clips ? meter("Videos chosen", videosUsed, plan.video_clips) : null}
            {plan?.image_posts ? meter("Image posts chosen", imagesUsed, plan.image_posts) : null}
            {!plan?.video_clips && !plan?.image_posts && <span className="muted" style={{ fontSize: 14 }}>{plan ? `${plan.name} doesn't include ZDMINC videos or image posts.` : "ZDMINC is setting up your plan."}</span>}
            {next && <span style={{ fontSize: 14 }}>Next post: <b>{new Date(next.scheduled_at).toLocaleDateString("en-GB", { timeZone: "America/Barbados", weekday: "short", day: "numeric", month: "short" })} {time(next.scheduled_at)}</b></span>}
            {(drafts ?? 0) > 0
              ? <Link className="btn blue small" href={`${base}/content`} style={{ alignSelf: "flex-start" }}>Approve {drafts} draft{drafts === 1 ? "" : "s"}</Link>
              : <span className="muted" style={{ fontSize: 13 }}>Nothing waiting for your OK.</span>}
            <span className="muted" style={{ fontSize: 12 }}>Tap Use on a draft to approve it, or Skip. Comments go straight to the team.</span>
          </section>
          <section className="card stack" style={{ gap: 8 }}>
            <h2>What sold, last 30 days</h2>
            {sold.map(([code, v]) => <div key={code} className="row" style={{ justifyContent: "space-between" }}><span>Link code <b>{code}</b></span><b>{v.n} orders · BBD ${v.sales.toFixed(0)}</b></div>)}
            {!sold.length && <p className="muted" style={{ margin: 0 }}>Add ?ref=CODE to links in your posts and ads, and sales show here.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
