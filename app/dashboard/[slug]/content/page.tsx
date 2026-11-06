import { getEntitlements } from "@/lib/entitlements";
import { has } from "@/lib/plan-features";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import ContentStudio, { type Connection, type LibraryItem } from "./ContentStudio";
import Link from "next/link";
import LocalTime from "./LocalTime";
import ShootPicker, { type Clip, type Shoot } from "./ShootPicker";
import { cancelPost, retryPost } from "./actions";

const STATUS: Record<string, [string, string]> = {
  scheduled: ["Scheduled", "sent"], publishing: ["Posting…", "high"], published: ["Posted", "paid"],
  partial: ["Partly posted", "high"], failed: ["Failed", "failed"], cancelled: ["Cancelled", "resolved"],
};

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  const { supabase, business, role, viewingAsStaff } = await requireMembership(slug);
  const canPost = role === "owner" || role === "admin";
  // Building and scheduling your own posts (and AI captions) is Marketing Autopilot, on All-in-One.
  const autopilot = viewingAsStaff || has(await getEntitlements(business.id), "marketing_autopilot");
  const [{ data: rows }, { data: sub }, { data: conn }, { data: upcoming }, { data: recent }, { data: shootRows }, { data: used }] = await Promise.all([
    supabase.from("video_clips").select("id, kind, source, shoot_id, title, caption, seconds, storage_path, thumb_path, width, height, chosen, skipped, created_at, video_shoots(month)")
      .eq("business_id", business.id).eq("status", "published").order("created_at", { ascending: false }).limit(200),
    supabase.from("subscriptions").select("plans!subscriptions_plan_id_fkey(video_clips)").eq("business_id", business.id).maybeSingle(),
    supabase.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "instagram").maybeSingle(),
    supabase.from("social_posts").select("*").eq("business_id", business.id).in("status", ["scheduled", "publishing"]).order("scheduled_at").limit(50),
    supabase.from("social_posts").select("*").eq("business_id", business.id).in("status", ["published", "partial", "failed", "cancelled"]).order("scheduled_at", { ascending: false }).limit(15),
    supabase.from("video_shoots").select("id, month, shoot_date").eq("business_id", business.id).not("published_at", "is", null).order("month", { ascending: false }).limit(12),
    supabase.from("social_posts").select("media_ids").eq("business_id", business.id).in("status", ["scheduled", "publishing", "published", "partial"]),
  ]);
  const paths = (rows ?? []).flatMap((c: any) => [c.storage_path, ...(c.thumb_path ? [c.thumb_path] : [])]);
  const { data: signed } = paths.length ? await supabase.storage.from("client-videos").createSignedUrls(paths, 3600) : { data: [] };
  const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const url = (p: string | null) => (p ? urls.get(p) ?? undefined : undefined);

  const items: LibraryItem[] = (rows ?? []).map((c: any) => ({
    id: c.id, kind: c.kind, source: c.source, title: c.title, caption: c.caption, url: url(c.storage_path), thumbUrl: url(c.thumb_path),
    ratio: c.width && c.height ? c.width / c.height : null, seconds: c.seconds, chosen: c.chosen,
    label: c.source === "zdm"
      ? `ZDMINC${c.shoot_id ? " shoot" : ""}${c.video_shoots?.month ? ` · ${new Date(`${c.video_shoots.month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" })}` : ""}`
      : `Uploaded ${new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
  }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const cfg: any = conn?.config ?? {};
  const connection: Connection = { connected: conn?.status === "connected", hasIg: Boolean(cfg.ig_id), igUsername: cfg.ig_username ?? null, pageName: cfg.page_name ?? null };
  const allowance = (sub as any)?.plans?.video_clips ?? 0;
  const zdmChosen = items.filter((i) => i.source === "zdm" && i.chosen).length;
  const onCalendar = new Set((used ?? []).flatMap((p) => p.media_ids as string[]));
  const shoots: Shoot[] = (shootRows ?? []) as Shoot[];
  const zdmIds = (rows ?? []).filter((c: any) => c.source === "zdm").map((c: any) => c.id);
  const { data: comments } = zdmIds.length
    ? await supabase.from("clip_comments").select("id, clip_id, author_name, from_staff, kind, body, created_at, resolved_at").in("clip_id", zdmIds).order("created_at")
    : { data: [] as any[] };
  const commentsFor = (id: string) => (comments ?? []).filter((x: any) => x.clip_id === id);
  const clips: Clip[] = (rows ?? []).filter((c: any) => c.source === "zdm").map((c: any) => ({
    comments: commentsFor(c.id),
    id: c.id, shoot_id: c.shoot_id, kind: c.kind, title: c.title, caption: c.caption, seconds: c.seconds, url: url(c.storage_path), thumbUrl: url(c.thumb_path),
    chosen: c.chosen, skipped: c.skipped, scheduled: onCalendar.has(c.id),
  }));
  const tab = tabParam === "videos" || tabParam === "library" ? tabParam : clips.length ? "videos" : "library";
  const tabLink = (t: string, label: string) => (
    <Link href={`/dashboard/${slug}/content?tab=${t}`} aria-current={tab === t ? "true" : undefined}>{label}</Link>
  );

  const PostRow = ({ p }: { p: any }) => {
    const [label, tone] = STATUS[p.status] ?? [p.status, ""];
    const first = byId.get(p.media_ids[0]);
    return (
      <div className="row" style={{ alignItems: "flex-start", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)", flexWrap: "nowrap" }}>
        <div style={{ width: 48, height: 60, flex: "none", borderRadius: 8, overflow: "hidden", background: "#0b0f0e" }}>
          {first?.url && (first.kind === "image" || first.thumbUrl
            ? <img src={first.kind === "image" ? first.url : first.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <video src={first.url} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}
        </div>
        <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <b><LocalTime iso={p.scheduled_at} /></b>
            <span className={`badge ${tone}`}>{label}</span>
            <span className="muted" style={{ fontSize: 13 }}>{p.platforms.map((x: string) => (x === "instagram" ? "Instagram" : "Facebook")).join(" + ")} · {p.media_ids.length} item{p.media_ids.length > 1 ? "s" : ""}</span>
          </div>
          {p.caption && <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption}</span>}
          {p.error && <span className="error" style={{ fontSize: 13 }}>{p.error}</span>}
          <div className="row" style={{ gap: 12, fontSize: 13 }}>
            {p.ig_permalink && <a href={p.ig_permalink} target="_blank" rel="noreferrer">View on Instagram ↗</a>}
            {p.fb_post_id && <a href={`https://www.facebook.com/${p.fb_post_id}`} target="_blank" rel="noreferrer">View on Facebook ↗</a>}
            {canPost && p.status === "scheduled" && (
              <form action={cancelPost}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={p.id} /><button style={{ background: "none", border: 0, color: "var(--coral)", fontWeight: 700, cursor: "pointer", padding: 0 }}>Cancel</button></form>
            )}
            {canPost && (p.status === "failed" || p.status === "partial") && (
              <form action={retryPost}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={p.id} /><button style={{ background: "none", border: 0, color: "var(--teal)", fontWeight: 700, cursor: "pointer", padding: 0 }}>Try again</button></form>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <PageHeader n={num("content")} title="Content" sub="Your photos and videos, and what's going out on Instagram and Facebook."
        actions={allowance > 0 ? <span className="badge paid">{zdmChosen} picked for ZDMINC · {allowance} clips a month on your plan</span> : undefined} />

      <nav className="pills" aria-label="Content sections">
        {tabLink("videos", `From ZDMINC${clips.length ? ` · ${clips.length}` : ""}`)}
        {tabLink("library", "Library and posting")}
      </nav>

      {tab === "videos" ? (
        <ShootPicker slug={slug} shoots={shoots} clips={clips} conn={connection} canPost={canPost} />
      ) : <>
      <div className="cols">
        <section className="card stack" style={{ gap: 4 }}>
          <h2>Scheduled · {upcoming?.length ?? 0}</h2>
          {(upcoming ?? []).map((p) => <PostRow key={p.id} p={p} />)}
          {!upcoming?.length && <p className="muted" style={{ margin: 0 }}>Nothing scheduled. Pick photos or videos below to plan a post.</p>}
        </section>
        <section className="card stack" style={{ gap: 4 }}>
          <h2>Recent</h2>
          {(recent ?? []).map((p) => <PostRow key={p.id} p={p} />)}
          {!recent?.length && <p className="muted" style={{ margin: 0 }}>Posts you've sent show here with links.</p>}
        </section>
      </div>

      <ContentStudio slug={slug} items={items} conn={connection} canPost={canPost} autopilot={autopilot} />
      </>}
    </div>
  );
}
