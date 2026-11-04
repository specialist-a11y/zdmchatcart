import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignStats, totals, KIND, STATUS } from "@/lib/ads";
import { maxSpend, todayIn } from "@/lib/billing";
import { money } from "@/lib/staff";
import { createInvoice, logEvent, walletBalance } from "@/lib/zdm-billing";
import { audienceSummary } from "@/lib/audience";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Client").split("@")[0];

async function reviewAd(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const { supabase, user, business } = await requireMembership(slug);
  const approve = str(f, "decision") === "approve";
  const note = str(f, "note");
  if (!approve && !note) redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Tell ZDMINC what to change")}`);
  // The database function checks the user is an owner or admin of this business.
  const { data, error } = await supabase.rpc("review_ad", { p_campaign: str(f, "id"), p_approve: approve, p_note: note || null });
  if (error) redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Only the account owner or an admin can approve ads")}`);
  const admin = createAdminClient();
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "ads", `${approve ? "Approved" : "Asked for changes to"} ad ${str(f, "code")}${note ? `: ${note}` : ""}`);
  redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent(data === "approved" ? "Approved. ZDMINC will launch it and you'll see results here." : "Sent to ZDMINC. They'll update the ad and ask again.")}`);
}

async function saveBudget(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const { user, business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Only the account owner or an admin can set the budget")}`);
  const n = Number(str(f, "budget"));
  if (!Number.isFinite(n) || n < 0) redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Budget must be a number")}`);
  const admin = createAdminClient();
  await admin.from("businesses").update({ ad_budget_monthly: n }).eq("id", business.id);
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "ads", `Monthly ad budget set to BBD $${n.toFixed(2)}`);
  redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Budget saved. ZDMINC sees it right away.")}`);
}

async function topUp(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const { user, business, role } = await requireMembership(slug);
  if (role !== "owner" && role !== "admin") redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Only the account owner or an admin can top up")}`);
  const amount = Number(str(f, "amount"));
  if (!(amount >= 20)) redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent("Top-ups start at BBD $20")}`);
  const admin = createAdminClient();
  const inv = await createInvoice(admin, { businessId: business.id, description: "Ad wallet top-up", amount, dueDate: todayIn(), kind: "ad_topup" });
  await logEvent(admin, business.id, { id: user.id, name: who(user) }, "ads", `Client started an ad top-up of BBD $${amount.toFixed(2)} (${inv.number})`);
  if (inv.payment_url) redirect(inv.payment_url);
  redirect(`/dashboard/${slug}/ads?msg=${encodeURIComponent(`Top-up ${inv.number} created. ZDMINC will send the payment link.`)}`);
}

export default async function AdsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  const canApprove = role === "owner" || role === "admin";
  const monthStart = `${todayIn().slice(0, 7)}-01T00:00:00Z`;
  const rows = await campaignStats(supabase, { businessId: business.id, monthStart });
  const t = totals(rows);
  const { data: b } = await supabase.from("businesses").select("ad_budget_monthly, ad_billing, meta_pixel_id, address").eq("id", business.id).single();
  const wallet = b?.ad_billing === "wallet";
  const admin = createAdminClient();
  const balance = wallet ? await walletBalance(admin, business.id) : null;
  const { data: entries } = wallet ? await supabase.from("ad_wallet_entries").select("kind, amount, note, day, created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(6) : { data: [] as any[] };
  const budget = b?.ad_budget_monthly != null ? Number(b.ad_budget_monthly) : null;
  const waiting = rows.filter((r) => r.status === "needs_approval");
  const clipIds = waiting.map((r) => r.clip_id).filter(Boolean) as string[];
  const { data: clips } = clipIds.length ? await supabase.from("video_clips").select("id, title, storage_path").in("id", clipIds) : { data: [] as any[] };
  const { data: signed } = clips?.length ? await supabase.storage.from("client-videos").createSignedUrls(clips.map((c) => c.storage_path), 3600) : { data: [] };
  const clipFor = (id: string | null) => clips?.find((c) => c.id === id);
  const urlFor = (p?: string) => signed?.find((s) => s.path === p)?.signedUrl ?? undefined;

  return (
    <div className="stack">
      <PageHeader n={num("ads")} title="Ads" sub="Instagram and Facebook ads from your best videos. You approve, ZDMINC runs them, and every order is tracked." />
      {msg && <p className="ok">{msg}</p>}
      <div className="kpis">
        <div className="kpi"><span>Spent this month</span><b>{money(t.spend)}</b>{budget != null && <span>of {money(budget)} budget</span>}</div>
        <div className="kpi" style={{ background: "var(--teal-soft)" }}><span>Orders from ads</span><b>{t.orders}</b></div>
        <div className="kpi"><span>Sales from ads</span><b>{money(t.sales)}</b></div>
        <div className="kpi"><span>Return</span><b>{t.roas != null ? `${t.roas}x` : "–"}</b><span>sales per $1 spent</span></div>
        <div className="kpi"><span>Cost per order</span><b>{t.costPerOrder != null ? money(t.costPerOrder) : "–"}</b></div>
      </div>

      <div className="cols" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(260px, 1fr)" }}>
        <div className="stack">
          {waiting.map((r) => {
            const clip = clipFor(r.clip_id);
            const most = maxSpend(r.daily_budget, r.starts_on, r.ends_on);
            return (
              <section key={r.id} className="card stack" style={{ borderColor: "var(--blue)", borderWidth: 2.5 }}>
                <div className="row" style={{ justifyContent: "space-between" }}><h2>Needs your OK</h2><span className="badge sent">{r.code}</span></div>
                <div className="row" style={{ alignItems: "flex-start", gap: 18 }}>
                  {clip && urlFor(clip.storage_path) && <video src={urlFor(clip.storage_path)} controls preload="metadata" style={{ width: 200, aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 12, background: "#000" }} />}
                  <div className="stack" style={{ flex: 1, minWidth: 240, gap: 8 }}>
                    <strong style={{ fontSize: 18 }}>{r.name}</strong>
                    <span className="muted">{KIND[r.kind]}</span>
                    {r.caption && <p className="msg" style={{ margin: 0 }}>{r.caption}</p>}
                    <span><strong>Who sees it:</strong> {audienceSummary(r as any, b?.address?.split("\n").slice(-1)[0])}</span>
                    <span><strong>Budget:</strong> {money(r.daily_budget)} a day{r.starts_on ? `, ${r.starts_on} to ${r.ends_on ?? "until paused"}` : ""}</span>
                    {most != null && <span><strong>Most you'll spend:</strong> {money(most)}</span>}
                    {canApprove ? (
                      <form action={reviewAd} className="stack" style={{ gap: 8 }}>
                        <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="code" value={r.code} />
                        <textarea name="note" rows={2} placeholder="Want a change? Tell ZDMINC here (optional when approving)" />
                        <div className="row"><button className="btn blue small" name="decision" value="approve">Approve and launch</button><button className="btn secondary small" name="decision" value="change">Ask for a change</button></div>
                      </form>
                    ) : <p className="muted" style={{ margin: 0 }}>Your account owner approves ads.</p>}
                  </div>
                </div>
              </section>
            );
          })}

          <h2>Campaigns</h2>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Campaign</th><th>Status</th><th>Budget</th><th>Spent</th><th>Orders</th><th>Sales</th><th>Return</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><br /><span className="muted">{KIND[r.kind]} · code {r.code}</span>{r.status === "changes_requested" && r.client_note && <><br /><span className="muted">You asked: {r.client_note}</span></>}</td>
                    <td><span className={`badge ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span></td>
                    <td>{money(r.daily_budget)}/day</td>
                    <td>{money(r.spend)}</td>
                    <td>{r.orders}</td>
                    <td><strong>{money(r.sales)}</strong></td>
                    <td><strong>{r.roas != null ? `${r.roas}x` : "–"}</strong></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="muted">No ads yet. Ask ZDMINC in Help and support, or check your plan includes ads.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <form action={saveBudget} className="card stack">
            <h2>Monthly ad budget</h2>
            <input type="hidden" name="slug" value={slug} />
            {budget != null && <div><div className="row" style={{ justifyContent: "space-between" }}><span>Spent this month</span><strong>{money(t.spend)} of {money(budget)}</strong></div><div className="meter"><i style={{ width: `${budget > 0 ? Math.min(100, Math.round((t.spend / budget) * 100)) : 0}%` }} /></div></div>}
            <label>Budget (BBD a month)<input name="budget" type="number" min="0" step="10" defaultValue={budget ?? ""} disabled={!canApprove} /></label>
            {canApprove && <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save budget</button>}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{wallet ? "Ad spend comes out of your prepaid ad wallet." : "Meta charges ad spend to your card in your own ad account. ZDMINC never marks it up."}</p>
          </form>
          {wallet && (
            <form action={topUp} className="card stack">
              <h2>Ad wallet</h2>
              <input type="hidden" name="slug" value={slug} />
              <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: 40, fontWeight: 800, color: (balance ?? 0) < 50 ? "var(--coral)" : undefined }}>{money(balance ?? 0)}</span>
              {(balance ?? 0) < 50 && <p className="error" style={{ margin: 0 }}>Running low. Ads pause when the wallet can't cover a day's budget.</p>}
              {(entries ?? []).map((e: any, i: number) => <div key={i} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}><span className="muted">{e.kind === "topup" ? "Top-up" : e.kind === "spend" ? `Spend ${e.day ?? ""}` : e.note}</span><strong>{Number(e.amount) > 0 ? "+" : ""}{money(e.amount)}</strong></div>)}
              {canApprove && <><label>Top up (BBD)<input name="amount" type="number" min="20" step="10" defaultValue={budget ?? 300} /></label><button className="btn blue small" style={{ alignSelf: "flex-start" }}>Top up with Fygaro</button></>}
            </form>
          )}
          <section className="card stack">
            <h2>How results are counted</h2>
            <p className="muted" style={{ margin: 0 }}>{b?.meta_pixel_id ? "Meta Pixel is on your shop, so ads can reach people who visited or left a cart. " : "Your shop doesn't have a Meta Pixel yet, so ads can't retarget visitors. Ask ZDMINC to set it up. "}Every ad links to your shop with its own code ({rows[0]?.code ?? "A-1"}, and so on). When someone orders through that link, even up to 7 days later, the order counts for that ad once it's paid. Spend comes from Meta and is updated by ZDMINC.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
