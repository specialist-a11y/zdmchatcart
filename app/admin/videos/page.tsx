import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import Link from "next/link";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import Uploader from "./Uploader";
import { answerClipComment, createShoot, deleteClip, publishShoot, updateClip } from "./video-actions";

export default async function VideosAdmin({ searchParams }: { searchParams: Promise<{ client?: string; shoot?: string; msg?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const admin = createAdminClient();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [{ data: clients }, { data: allShoots }] = await Promise.all([
    admin.from("subscriptions").select("business_id, plan:plans!subscriptions_plan_id_fkey(name, video_clips), businesses(name)").neq("status", "cancelled"),
    admin.from("video_shoots").select("id, business_id, month, shoot_date, published_at, video_clips(id, chosen)").gte("month", `${thisMonth}-01`).order("month"),
  ]);
  // Every active client: ZDMINC can add photos and videos for anyone, not only video plans.
  const videoClients = (clients ?? []).filter((c: any) => c.businesses).sort((a: any, b: any) => a.businesses.name.localeCompare(b.businesses.name));
  const clientId = sp.client ?? (videoClients[0] as any)?.business_id;
  const { data: shoots } = clientId ? await admin.from("video_shoots").select("*").eq("business_id", clientId).order("month", { ascending: false }).limit(12) : { data: [] as any[] };
  const extras = sp.shoot === "extras" || !shoots?.length;
  const shoot = extras ? null : (shoots ?? []).find((s) => s.id === sp.shoot) ?? shoots?.[0];
  const { data: clips } = shoot
    ? await admin.from("video_clips").select("*").eq("shoot_id", shoot.id).order("created_at")
    : clientId ? await admin.from("video_clips").select("*").eq("business_id", clientId).eq("source", "zdm").is("shoot_id", null).order("created_at", { ascending: false }).limit(100) : { data: [] as any[] };
  // Short-lived links so the team can preview without making the bucket public.
  const paths = (clips ?? []).flatMap((c) => [c.storage_path, ...(c.thumb_path ? [c.thumb_path] : [])]);
  const signed = paths.length ? (await admin.storage.from("client-videos").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urlFor = (p: string | null) => (p ? signed.find((s) => s.path === p)?.signedUrl ?? undefined : undefined);
  const client: any = videoClients.find((c: any) => c.business_id === clientId);
  // Change requests from clients that the team hasn't marked done (migration 0015).
  const { data: asks } = await admin.from("clip_comments").select("id, body, created_at, author_name, business_id, video_clips(title), businesses(name)")
    .eq("kind", "change").is("resolved_at", null).order("created_at").limit(50);

  return (
    <>
      <PageHeader n={adminNum("/admin/videos")} title="Content uploads" sub="Add photos and videos to any client's Content library, from a shoot or as extras. AI writes the captions; clients pick or schedule them, and their picks show here." />
      {sp.msg && <p className="ok">{sp.msg}</p>}

      {(asks ?? []).length > 0 && (
        <section className="card stack" style={{ gap: 8, borderColor: "#f2d9b8", background: "#fff8ec" }}>
          <h2 style={{ fontSize: 22 }}>Change requests ({asks!.length})</h2>
          {asks!.map((a: any) => (
            <form key={a.id} action={answerClipComment} className="stack" style={{ gap: 6, borderTop: "1px solid #f2d9b8", paddingTop: 8 }}>
              <input type="hidden" name="id" value={a.id} />
              <span><b>{a.businesses?.name}</b> · {a.video_clips?.title ?? "clip"} · <span className="muted">{a.author_name}, {new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span>
              <span style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
              <div className="row" style={{ gap: 8 }}>
                <input name="body" placeholder="Reply (optional)" style={{ flex: "1 1 220px" }} />
                <label className="row" style={{ flexDirection: "row", gap: 6, fontWeight: 600 }}><input type="checkbox" name="done" defaultChecked style={{ width: 20, height: 20 }} />Done</label>
                <button className="btn secondary small">Save</button>
                <Link href={`/admin/videos?client=${a.business_id}`}>Open client ›</Link>
              </div>
            </form>
          ))}
        </section>
      )}

      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Client</th><th>This month's shoot</th><th>Clips</th><th>Chosen</th><th>Status</th><th /></tr></thead>
          <tbody>
            {videoClients.map((c: any) => {
              const s = (allShoots ?? []).find((x: any) => x.business_id === c.business_id);
              const n = s?.video_clips?.length ?? 0;
              const chosen = s?.video_clips?.filter((v: any) => v.chosen).length ?? 0;
              return (
                <tr key={c.business_id} style={c.business_id === clientId ? { background: "var(--teal-soft)" } : undefined}>
                  <td><strong>{c.businesses.name}</strong><br /><span className="muted">{c.plan?.name}</span></td>
                  <td>{s?.shoot_date ?? (s ? "date not set" : <span className="muted">none yet</span>)}</td>
                  <td>{c.plan?.video_clips > 0 ? `${n} of ${c.plan.video_clips}` : n || "—"}</td>
                  <td>{chosen}</td>
                  <td>{c.plan?.video_clips > 0 ? <span className={`badge ${s?.published_at ? "paid" : s ? "sent" : "high"}`}>{s?.published_at ? "Delivered" : s ? "In progress" : "Not booked"}</span> : <span className="muted">No shoot plan</span>}</td>
                  <td><Link href={`/admin/videos?client=${c.business_id}`}>Open ›</Link></td>
                </tr>
              );
            })}
            {videoClients.length === 0 && <tr><td colSpan={6} className="muted">No active clients yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {clientId && (
        <div className="cols" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)" }}>
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>{client?.businesses?.name}</h2>
              <div className="row">
                {(shoots ?? []).map((s) => <Link key={s.id} href={`/admin/videos?client=${clientId}&shoot=${s.id}`} className={`badge ${s.id === shoot?.id ? "paid" : ""}`}>{new Date(`${s.month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</Link>)}
                <Link href={`/admin/videos?client=${clientId}&shoot=extras`} className={`badge ${extras ? "paid" : ""}`}>Extras</Link>
              </div>
            </div>
            {extras && <p className="muted" style={{ margin: 0 }}>Extras go straight into the client's library (no shoot needed): product photos, event shots, extra clips.</p>}
            {shoot || extras ? (
              <>
                <Uploader key={shoot?.id ?? "extras"} target={shoot ? { shootId: shoot.id } : { businessId: clientId }} hint={shoot ? undefined : "Photos or videos, added to their library right away."} />
                <div className="grid">
                  {(clips ?? []).map((c) => (
                    <form key={c.id} action={updateClip} className="card stack" style={{ padding: 12 }}>
                      <input type="hidden" name="id" value={c.id} />
                      {urlFor(c.storage_path) ? (c.kind === "image"
                        ? <img src={urlFor(c.storage_path)} alt={c.title} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 10, background: "#000" }} />
                        : <video src={urlFor(c.storage_path)} poster={urlFor(c.thumb_path)} controls preload="metadata" style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 10, background: "#000" }} />) : null}
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className={`badge ${c.status === "published" ? "paid" : c.status === "hidden" ? "resolved" : "sent"}`}>{c.status}</span>
                        {c.chosen && <span className="badge paid">Client chose this</span>}
                        {c.skipped && <span className="badge resolved">Client skipped</span>}
                        {c.seconds && <span className="muted">{c.seconds}s</span>}
                      </div>
                      <label>Title<input name="title" defaultValue={c.title} /></label>
                      <label>Caption<textarea name="caption" rows={2} defaultValue={c.caption ?? ""} /></label>
                      <label>Show to client<select name="status" defaultValue={c.status}><option value="ready">Not yet</option><option value="published">Yes</option><option value="hidden">Hidden</option></select></label>
                      <div className="row"><button className="btn secondary small">Save</button><button className="btn secondary small" formAction={deleteClip}>Delete</button></div>
                    </form>
                  ))}
                </div>
                {!clips?.length && <p className="muted">{extras ? "No extras yet." : "No clips in this shoot yet."}</p>}
              </>
            ) : <p className="muted">No shoots yet. Add one on the right.</p>}
          </div>

          <div className="stack">
            {shoot && (
              <form action={publishShoot} className="card stack">
                <h2>Client library</h2>
                <p className="muted" style={{ margin: 0 }}>{(clips ?? []).filter((c) => c.status === "ready").length} clips ready, {(clips ?? []).filter((c) => c.status === "published").length} already shown{shoot.published_at ? `, published ${new Date(shoot.published_at).toLocaleDateString("en-GB")}` : ""}.</p>
                <input type="hidden" name="shoot_id" value={shoot.id} />
                <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="notify" defaultChecked /> Tell the owner on WhatsApp</label>
                <button className="btn blue">Publish to client library</button>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Clips uploaded after publishing go straight into their library.</p>
              </form>
            )}
            <form action={createShoot} className="card stack">
              <h2>Add a shoot</h2>
              <input type="hidden" name="business_id" value={clientId} />
              <label>Month<input type="month" name="month" defaultValue={thisMonth} required /></label>
              <label>Filming date<input type="date" name="shoot_date" /></label>
              <label>Location<input name="location" placeholder="Speightstown shop" /></label>
              <label>Shot list notes<textarea name="notes" rows={3} /></label>
              <button className="btn secondary">Add shoot</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
