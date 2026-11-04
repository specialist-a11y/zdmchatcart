import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Kpi, Dot } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { normaliseKeyword } from "@/lib/autoreply";
import { recentMedia } from "@/lib/instagram";
import { shortUrl, slugifyCode } from "@/lib/links";
import { money } from "@/lib/order-text";

const STATUS: Record<string, string> = {
  sent: "Replied + DM", dm_only: "DM only", reply_only: "Reply only", already_sent: "Already sent",
  over_cap: "Daily limit", paused: "Paused", error: "Error",
};
const DEFAULT_DM = "Hi {name}! Here's your link to order: {link}\nAny questions, just reply here.";
const DEFAULT_REPLIES = "Sent! Check your DMs for the link\nJust sent it to your DMs\nCheck your messages, the link is there";

export default async function AutoRepliesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  const canEdit = role === "owner" || role === "admin";
  const path = `/dashboard/${slug}/autoreplies`;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const [{ data: ig }, { data: rules }, { data: events }, { data: domain }] = await Promise.all([
    supabase.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "instagram").maybeSingle<any>(),
    supabase.from("ig_autoreplies").select("id, keyword, media_id, media_label, public_replies, dm_text, active, daily_cap, short_links(id, code, ref, clicks)").eq("business_id", business.id).order("created_at", { ascending: false }),
    supabase.from("ig_comment_events").select("id, rule_id, from_username, text, status, error, created_at").eq("business_id", business.id).gte("created_at", since).order("created_at", { ascending: false }).limit(200),
    supabase.from("business_domains").select("domain").eq("business_id", business.id).eq("status", "active").limit(1).maybeSingle(),
  ]);
  const connected = ig?.status === "connected";
  const refs = (rules ?? []).map((r: any) => r.short_links?.ref).filter(Boolean) as string[];
  const { data: sold } = refs.length
    ? await supabase.from("orders").select("attribution, total").eq("business_id", business.id).in("attribution", refs).in("status", ["paid", "ready", "fulfilled"])
    : { data: [] as any[] };
  const sales = new Map<string, { n: number; v: number }>();
  for (const o of sold ?? []) { const s = sales.get(o.attribution) ?? { n: 0, v: 0 }; s.n++; s.v += Number(o.total); sales.set(o.attribution, s); }
  const stat = (ruleId: string) => {
    const ev = (events ?? []).filter((e) => e.rule_id === ruleId);
    return { comments: ev.length, dms: ev.filter((e) => e.status === "sent" || e.status === "dm_only").length };
  };
  const sent30 = (events ?? []).filter((e) => e.status === "sent" || e.status === "dm_only").length;
  const errors = (events ?? []).filter((e) => e.status === "error").length;

  // Recent posts to attach a keyword to (only when connected).
  let media: { id: string; label: string }[] = [];
  if (connected && canEdit) {
    const { data: sec } = await createAdminClient().from("integration_secrets").select("secret").eq("business_id", business.id).eq("provider", "instagram").maybeSingle();
    if (sec?.secret && ig?.config?.ig_id) {
      media = (await recentMedia(sec.secret, ig.config.ig_id)).map((m) => ({
        id: m.id,
        label: `${m.timestamp ? new Date(m.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " : ""}${(m.caption ?? m.media_type ?? "Post").replace(/\s+/g, " ").slice(0, 60)}`,
      }));
    }
  }

  async function guard() {
    "use server";
    const ctx = await requireMembership(slug);
    if (ctx.role !== "owner" && ctx.role !== "admin") redirect(`${path}?msg=${encodeURIComponent("Only owners and admins can change auto-replies")}`);
    return ctx;
  }

  async function addRule(formData: FormData) {
    "use server";
    const { business } = await guard();
    const keyword = normaliseKeyword(String(formData.get("keyword") ?? ""));
    if (keyword.length < 2) redirect(`${path}?msg=${encodeURIComponent("Keyword needs at least 2 letters or numbers, like CAKE")}`);
    const [mediaId, ...labelParts] = String(formData.get("media") ?? "").split("|");
    const dm = String(formData.get("dm_text") ?? "").trim() || DEFAULT_DM;
    const replies = String(formData.get("replies") ?? "").split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 6);
    const admin = createAdminClient();
    // Each keyword gets its own short link so its clicks and sales are counted.
    let linkId = String(formData.get("link") ?? "");
    if (!linkId) {
      let code = slugifyCode(keyword);
      for (let i = 2; i < 30 && !linkId; i++) {
        const { data, error } = await admin.from("short_links").insert({ business_id: business.id, code, label: `Instagram: comment ${keyword}`, ref: `IG-${keyword}`.slice(0, 40) }).select("id").maybeSingle();
        if (data) linkId = data.id; else if (error?.code === "23505") code = `${slugifyCode(keyword)}-${i}`; else break;
      }
    }
    const { error } = await admin.from("ig_autoreplies").insert({
      business_id: business.id, keyword, media_id: mediaId || null, media_label: mediaId ? labelParts.join("|").slice(0, 80) : null,
      dm_text: dm.slice(0, 900), public_replies: replies.length ? replies : DEFAULT_REPLIES.split("\n"), short_link_id: linkId || null,
    });
    redirect(`${path}?msg=${encodeURIComponent(error ? (error.code === "23505" ? `${keyword} already has a rule for that post` : error.message) : `Auto-reply for ${keyword} is on`)}`);
  }

  async function toggleRule(formData: FormData) {
    "use server";
    const { business } = await guard();
    await createAdminClient().from("ig_autoreplies").update({ active: formData.get("active") === "true" }).eq("business_id", business.id).eq("id", String(formData.get("id")));
    revalidatePath(path);
  }

  async function deleteRule(formData: FormData) {
    "use server";
    const { business } = await guard();
    await createAdminClient().from("ig_autoreplies").delete().eq("business_id", business.id).eq("id", String(formData.get("id")));
    revalidatePath(path);
  }

  const { data: links } = await supabase.from("short_links").select("id, code, label").eq("business_id", business.id).order("created_at", { ascending: false }).limit(50);
  const ruleName = new Map((rules ?? []).map((r: any) => [r.id, r.keyword]));

  return (
    <div className="stack">
      <PageHeader n={num("autoreplies")} title="IG auto-replies" sub="Comment CAKE and get the link by DM. We reply to the comment and send the link, automatically." />
      {msg && <p className="ok" style={{ wordBreak: "break-word" }}>{msg}</p>}

      <div className="card row" style={{ justifyContent: "space-between" }}>
        <span className="row"><Dot ok={connected} /><b>{connected ? `Instagram connected${ig?.config?.ig_username ? `: @${ig.config.ig_username}` : ""}` : "Instagram not connected"}</b></span>
        {!connected && <Link className="btn small" href={`/dashboard/${slug}/settings#social`}>Connect Instagram</Link>}
      </div>

      <div className="kpis">
        <Kpi label="DMs sent, 30 days" value={sent30} tone="blue" />
        <Kpi label="Keywords on" value={(rules ?? []).filter((r: any) => r.active).length} />
        <Kpi label="Orders from auto-replies" value={[...sales.values()].reduce((s, x) => s + x.n, 0)} />
        <Kpi label="Problems, 30 days" value={errors} tone={errors ? "red" : undefined} />
      </div>

      {canEdit && (
        <form action={addRule} className="card stack">
          <h2>New auto-reply</h2>
          <div className="grid">
            <label>Keyword<input name="keyword" placeholder="CAKE" required maxLength={30} autoCapitalize="characters" /></label>
            <label>Which post
              <select name="media" defaultValue="">
                <option value="">Every post and Reel</option>
                {media.map((m) => <option key={m.id} value={`${m.id}|${m.label}`}>{m.label}</option>)}
              </select>
            </label>
            <label>Link to send
              <select name="link" defaultValue="">
                <option value="">New short link for this keyword</option>
                {(links ?? []).map((l) => <option key={l.id} value={l.id}>{shortUrl(l.code, domain?.domain).replace(/^https?:\/\//, "")} · {l.label}</option>)}
              </select>
            </label>
          </div>
          <label>DM message <span className="muted" style={{ fontWeight: 400 }}>({"{name}"} and {"{link}"} are filled in)</span><textarea name="dm_text" rows={3} defaultValue={DEFAULT_DM} maxLength={900} /></label>
          <label>Public replies under the comment <span className="muted" style={{ fontWeight: 400 }}>(one per line, we rotate them)</span><textarea name="replies" rows={3} defaultValue={DEFAULT_REPLIES} /></label>
          <span className="muted" style={{ fontSize: 13 }}>In your caption, say: Comment <b>KEYWORD</b> and we'll DM you the link. Instagram allows one DM per comment, so people who already got the link aren't messaged again for 7 days.</span>
          <button className="btn blue" disabled={!connected} style={{ alignSelf: "flex-start" }}>{connected ? "Turn on auto-reply" : "Connect Instagram first"}</button>
        </form>
      )}

      <section className="card stack" style={{ gap: 8 }}>
        <h2>Your keywords</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Keyword</th><th>Post</th><th>Link</th><th>Comments</th><th>DMs</th><th>Clicks</th><th>Orders</th><th>Sales</th><th /></tr></thead>
            <tbody>
              {(rules ?? []).map((r: any) => {
                const s = stat(r.id), sl = r.short_links, o = sl?.ref ? sales.get(sl.ref) : undefined;
                return (
                  <tr key={r.id} style={r.active ? undefined : { opacity: .55 }}>
                    <td><b>{r.keyword}</b>{!r.active && <span className="badge" style={{ marginLeft: 6 }}>paused</span>}</td>
                    <td className="wrap" style={{ maxWidth: 220 }}>{r.media_id ? r.media_label ?? "One post" : "Every post"}</td>
                    <td>{sl ? <code>{shortUrl(sl.code, domain?.domain).replace(/^https?:\/\//, "")}</code> : <span className="muted">shop page</span>}</td>
                    <td>{s.comments}</td><td><b>{s.dms}</b></td><td>{sl?.clicks ?? 0}</td><td><b>{o?.n ?? 0}</b></td><td>{money(o?.v ?? 0, business.currency)}</td>
                    <td>{canEdit && <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={String(!r.active)} /><button className="btn secondary small">{r.active ? "Pause" : "Turn on"}</button></form>
                      <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="btn secondary small" aria-label={`Delete ${r.keyword}`}>Delete</button></form>
                    </div>}</td>
                  </tr>
                );
              })}
              {!rules?.length && <tr><td colSpan={9} className="muted">No keywords yet. Add one above, then post with "Comment CAKE for the link".</td></tr>}
            </tbody>
          </table>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>Comments and DMs: last 30 days. Clicks, orders and sales: all time, from the keyword's link.</span>
      </section>

      <section className="card stack" style={{ gap: 8 }}>
        <h2>Latest comments</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>From</th><th>Comment</th><th>Keyword</th><th>Result</th></tr></thead>
            <tbody>
              {(events ?? []).slice(0, 25).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{e.from_username ? `@${e.from_username}` : "someone"}</td>
                  <td className="wrap" style={{ maxWidth: 260 }}>{e.text}</td>
                  <td>{e.rule_id ? ruleName.get(e.rule_id) ?? "" : ""}</td>
                  <td><span className={`badge ${e.status === "sent" ? "paid" : e.status === "error" ? "cancelled" : "sent"}`}>{STATUS[e.status] ?? e.status}</span>{e.error && e.error !== "processing" && <><br /><span className="muted" style={{ fontSize: 12 }}>{e.error}</span></>}</td>
                </tr>
              ))}
              {!events?.length && <tr><td colSpan={5} className="muted">Nothing yet. Comments with your keywords show up here as they come in.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
