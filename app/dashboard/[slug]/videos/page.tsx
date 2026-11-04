import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { revalidatePath } from "next/cache";

async function toggleClip(f: FormData) {
  "use server";
  const slug = String(f.get("slug"));
  const { supabase } = await requireMembership(slug);
  await supabase.rpc("choose_clip", { p_clip: String(f.get("id")), p_chosen: f.get("chosen") === "1" });
  revalidatePath(`/dashboard/${slug}/videos`);
}

export default async function ClientVideos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, business } = await requireMembership(slug);
  const [{ data: clips }, { data: sub }] = await Promise.all([
    supabase.from("video_clips").select("id, title, caption, seconds, storage_path, chosen, video_shoots(month)").eq("business_id", business.id).eq("status", "published").order("created_at", { ascending: false }).limit(120),
    supabase.from("subscriptions").select("plans!subscriptions_plan_id_fkey(video_clips)").eq("business_id", business.id).maybeSingle(),
  ]);
  const { data: signed } = clips?.length ? await supabase.storage.from("client-videos").createSignedUrls(clips.map((c) => c.storage_path), 3600) : { data: [] };
  const url = (p: string) => signed?.find((s) => s.path === p)?.signedUrl ?? undefined;
  const allowance = (sub as any)?.plans?.video_clips ?? 0;
  const chosen = (clips ?? []).filter((c) => c.chosen).length;

  return (
    <div className="stack">
      <PageHeader n={num("videos")} title="Videos" sub="Clips from your ZDMINC shoots. Pick the ones you want posted."
        actions={allowance > 0 ? <span className="badge paid">{chosen} chosen · {allowance} a month on your plan</span> : undefined} />
      {!clips?.length && <p className="muted">No clips yet. ZDMINC lets you know on WhatsApp when this month's videos are ready.</p>}
      <div className="grid">
        {(clips ?? []).map((c: any) => (
          <form key={c.id} action={toggleClip} className="card stack" style={{ padding: 12, borderColor: c.chosen ? "var(--blue)" : undefined, borderWidth: c.chosen ? 2.5 : undefined }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="chosen" value={c.chosen ? "0" : "1"} />
            {url(c.storage_path) && <video src={url(c.storage_path)} controls preload="metadata" style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 10, background: "#000" }} />}
            <strong>{c.title}</strong>
            {c.caption && <span className="muted">{c.caption}</span>}
            <span className="muted">{c.seconds ? `${c.seconds}s · ` : ""}{c.video_shoots?.month ? new Date(`${c.video_shoots.month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" }) : ""}</span>
            <button className={`btn small ${c.chosen ? "blue" : "secondary"}`}>{c.chosen ? "Chosen ✓" : "Choose for posting"}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
