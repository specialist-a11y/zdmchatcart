import { PageHeader } from "@/components/CrmShell";
import { adminNum } from "@/lib/crm-nav";
import { redirect } from "next/navigation";
import { requireStaff, money } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignStats, totals, KIND, STATUS } from "@/lib/ads";
import { todayIn } from "@/lib/billing";
import { createInvoice, logEvent, notifyClient, walletBalance } from "@/lib/zdm-billing";
import { audienceSummary, parseAudience, PARISHES, WARM } from "@/lib/audience";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (m: string): never => redirect(`/admin/ads?msg=${encodeURIComponent(m)}`);
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** For wallet clients, each day's logged spend is also taken off their prepaid balance (one entry per campaign per day). */
async function syncWalletSpend(admin: ReturnType<typeof createAdminClient>, campaignId: string, businessId: string, day: string, amount: number) {
  const { data: b } = await admin.from("businesses").select("ad_billing").eq("id", businessId).single();
  if (b?.ad_billing !== "wallet") return;
  await admin.from("ad_wallet_entries").delete().eq("campaign_id", campaignId).eq("day", day).eq("kind", "spend");
  if (amount > 0) await admin.from("ad_wallet_entries").insert({ business_id: businessId, kind: "spend", amount: -amount, campaign_id: campaignId, day, note: "Ad spend" });
}

async function createCampaign(f: FormData) {
  "use server";
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const businessId = str(f, "business_id");
  const daily = Number(str(f, "daily_budget"));
  if (!businessId || str(f, "name").length < 2 || !(daily > 0)) back("Client, name and a daily budget are needed");
  const { data: code } = await admin.rpc("next_ad_code", { bid: businessId });
  const aud = parseAudience((k) => str(f, k), (k) => f.getAll(k).map(String));
  const { data: c, error } = await admin.from("ad_campaigns").insert({
    business_id: businessId, code, name: str(f, "name"), kind: str(f, "kind") || "boost", daily_budget: daily,
    starts_on: str(f, "starts_on") || null, ends_on: str(f, "ends_on") || null, clip_id: str(f, "clip_id") || null,
    caption: str(f, "caption") || null, audience: str(f, "audience") || null, status: "needs_approval", created_by: staff.user_id, ...aud,
  }).select("id, code, name").single();
  if (error || !c) back(error?.message ?? "Could not create the campaign");
  const actor = { id: staff.user_id, name: staff.name };
  await logEvent(admin, businessId, actor, "ads", `Ad ${c!.code} "${c!.name}" sent for approval`);
  const { data: b } = await admin.from("businesses").select("slug").eq("id", businessId).single();
  let note = `Ad ${c!.code} created and waiting for the client's OK`;
  if (f.get("notify") === "on") {
    const res = await notifyClient(admin, businessId, `A new ad is ready for your OK: "${c!.name}", BBD $${daily.toFixed(2)} a day. Approve or ask for a change here: ${site()}/dashboard/${b?.slug}/ads`, actor);
    note += res.ok ? ". Client told on WhatsApp." : `. WhatsApp not sent: ${res.error}`;
  }
  back(note);
}

async function setStatus(f: FormData) {
  "use server";
  const { staff } = await requireStaff();
  const status = str(f, "status");
  if (!["needs_approval", "running", "paused", "ended", "draft"].includes(status)) back("Unknown status");
  const admin = createAdminClient();
  if (status === "running") {
    const { data: cur } = await admin.from("ad_campaigns").select("business_id, daily_budget, businesses(ad_billing)").eq("id", str(f, "id")).single<any>();
    if (cur?.businesses?.ad_billing === "wallet") {
      const bal = await walletBalance(admin, cur.business_id);
      if (bal < Number(cur.daily_budget)) back(`Not started: their ad wallet has ${money(bal)}, less than one day's budget. Send a top-up first.`);
    }
  }
  const { data: c } = await admin.from("ad_campaigns").update({ status }).eq("id", str(f, "id")).select("business_id, code, name").single();
  if (c) await logEvent(admin, c.business_id, { id: staff.user_id, name: staff.name }, "ads", `Ad ${c.code} ${STATUS[status]?.[0].toLowerCase() ?? status}`);
  back(`${c?.code ?? "Ad"} set to ${STATUS[status]?.[0] ?? status}`);
}

async function logSpend(f: FormData) {
  "use server";
  await requireStaff();
  const admin = createAdminClient();
  const amount = Number(str(f, "amount"));
  const day = str(f, "day");
  if (!(amount >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) back("Pick a date and an amount");
  const { data: c } = await admin.from("ad_campaigns").select("id, business_id, code").eq("id", str(f, "campaign_id")).single();
  if (!c) back("Pick a campaign");
  await admin.from("ad_spend").upsert({
    campaign_id: c!.id, business_id: c!.business_id, day, amount,
    impressions: str(f, "impressions") ? Number(str(f, "impressions")) : null, clicks: str(f, "clicks") ? Number(str(f, "clicks")) : null,
  });
  await syncWalletSpend(admin, c!.id, c!.business_id, day, amount);
  back(`Logged ${money(amount)} for ${c!.code} on ${day}`);
}

/** Paste rows from a Meta Ads Manager export: code, date, amount (one per line, commas or tabs). */
async function importSpend(f: FormData) {
  "use server";
  await requireStaff();
  const admin = createAdminClient();
  const businessId = str(f, "business_id");
  const { data: camps } = await admin.from("ad_campaigns").select("id, code").eq("business_id", businessId);
  const byCode = new Map((camps ?? []).map((c) => [c.code.toUpperCase(), c.id]));
  let ok = 0, skipped = 0;
  for (const line of str(f, "rows").split(/\r?\n/)) {
    const [code, day, amt] = line.split(/[,\t]/).map((x) => x.trim());
    const id = byCode.get((code ?? "").toUpperCase());
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || !(Number(amt) >= 0)) { if (line.trim()) skipped++; continue; }
    await admin.from("ad_spend").upsert({ campaign_id: id, business_id: businessId, day, amount: Number(amt) });
    await syncWalletSpend(admin, id, businessId, day!, Number(amt));
    ok++;
  }
  back(`Imported ${ok} day${ok === 1 ? "" : "s"} of spend${skipped ? `, skipped ${skipped} line${skipped === 1 ? "" : "s"} (check code, date YYYY-MM-DD, amount)` : ""}`);
}

async function saveAdSettings(f: FormData) {
  "use server";
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const id = str(f, "business_id");
  const pixel = str(f, "meta_pixel_id").replace(/\D/g, "");
  if (pixel && !/^\d{8,20}$/.test(pixel)) back("Pixel ID is the 15 or 16-digit number from Meta Events Manager");
  const billing = str(f, "ad_billing") === "wallet" ? "wallet" : "own_account";
  await admin.from("businesses").update({ meta_pixel_id: pixel || null, ad_billing: billing }).eq("id", id);
  const token = str(f, "capi_token");
  if (token) {
    await admin.from("integrations").upsert({ business_id: id, provider: "meta", status: "connected", config: { pixel_id: pixel }, updated_at: new Date().toISOString() });
    await admin.from("integration_secrets").upsert({ business_id: id, provider: "meta", secret: token, updated_at: new Date().toISOString() });
  }
  await logEvent(admin, id, { id: staff.user_id, name: staff.name }, "ads", `Ad settings: ${billing === "wallet" ? "prepaid wallet" : "own Meta ad account"}${pixel ? `, Pixel ${pixel}` : ""}${token ? ", Conversions API token saved" : ""}`);
  redirect(`/admin/ads?client=${id}&msg=${encodeURIComponent("Ad settings saved")}`);
}

async function sendTopUp(f: FormData) {
  "use server";
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const id = str(f, "business_id");
  const amount = Number(str(f, "amount"));
  if (!(amount >= 20)) back("Top-ups start at BBD $20");
  const inv = await createInvoice(admin, { businessId: id, description: `Ad wallet top-up`, amount, dueDate: new Date().toISOString().slice(0, 10), kind: "ad_topup" });
  const actor = { id: staff.user_id, name: staff.name };
  await logEvent(admin, id, actor, "ads", `Ad top-up ${inv.number} for ${money(amount)} sent`);
  let note = `Top-up invoice ${inv.number} created`;
  if (f.get("notify") === "on" && inv.payment_url) {
    const res = await notifyClient(admin, id, `Top up your ad wallet: BBD $${amount.toFixed(2)}. Pay here and we'll keep your ads running: ${inv.payment_url}`, actor);
    note += res.ok ? " and sent on WhatsApp" : `. WhatsApp not sent: ${res.error}`;
  }
  redirect(`/admin/ads?client=${id}&msg=${encodeURIComponent(note)}`);
}

export default async function AdminAds({ searchParams }: { searchParams: Promise<{ msg?: string; client?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const admin = createAdminClient();
  const monthStart = `${todayIn().slice(0, 7)}-01T00:00:00Z`;
  const [rows, { data: clients }] = await Promise.all([
    campaignStats(admin, { monthStart }),
    admin.from("businesses").select("id, name, slug, ad_budget_monthly, ad_billing, meta_pixel_id, address").order("name"),
  ]);
  const t = totals(rows);
  const clientId = sp.client ?? clients?.[0]?.id;
  const client = clients?.find((c) => c.id === clientId);
  const { data: clips } = clientId ? await admin.from("video_clips").select("id, title").eq("business_id", clientId).in("status", ["ready", "published"]).order("created_at", { ascending: false }).limit(60) : { data: [] as any[] };
  const balance = client?.ad_billing === "wallet" ? await walletBalance(admin, client.id) : null;
  const { data: capi } = client ? await admin.from("integrations").select("status").eq("business_id", client.id).eq("provider", "meta").maybeSingle() : { data: null };
  const { count: consented } = client ? await admin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", client.id).eq("marketing_opt_in", true) : { count: 0 };
  const name = (id: string) => clients?.find((c) => c.id === id)?.name ?? "";
  const slugOf = (id: string) => clients?.find((c) => c.id === id)?.slug ?? "";
  const live = rows.filter((r) => r.status !== "ended" && r.status !== "draft");

  return (
    <>
      <PageHeader n={adminNum("/admin/ads")} title="Ads" sub={`Every client"s campaigns, approvals, spend and return. Campaigns run in each client"s own Meta ad account.`} />
      {sp.msg && <p className="ok">{sp.msg}</p>}
      <div className="kpis">
        <div className="kpi"><span>Client ad spend this month</span><b>{money(t.spend)}</b></div>
        <div className="kpi" style={{ background: "var(--teal-soft)" }}><span>Orders from ads</span><b>{t.orders}</b></div>
        <div className="kpi"><span>Return across clients</span><b>{t.roas != null ? `${t.roas}x` : "–"}</b><span>{money(t.sales)} sales</span></div>
        <div className="kpi" style={{ background: "#fff8ec" }}><span>Waiting for client OK</span><b>{rows.filter((r) => r.status === "needs_approval").length}</b></div>
      </div>

      <div className="cols" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(300px, 1fr)" }}>
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Campaign</th><th>Status</th><th>Spent</th><th>Orders</th><th>Return</th><th>Shop link for Meta</th><th /></tr></thead>
            <tbody>
              {live.concat(rows.filter((r) => !live.includes(r))).map((r) => (
                <tr key={r.id}>
                  <td><strong>{name(r.business_id)}</strong><br />{r.code} · {r.name}<br /><span className="muted">{KIND[r.kind]} · {money(r.daily_budget)}/day</span><br /><span className="muted" style={{ fontSize: 13 }}>{audienceSummary(r as any)}</span>{r.client_note && <><br /><span className="error" style={{ fontWeight: 400 }}>Client asked: {r.client_note}</span></>}</td>
                  <td><span className={`badge ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span></td>
                  <td>{money(r.spend)}</td>
                  <td>{r.orders}</td>
                  <td><strong style={{ color: r.roas != null && r.roas < 2 ? "var(--coral)" : undefined }}>{r.roas != null ? `${r.roas}x` : "–"}</strong></td>
                  <td><code style={{ fontSize: 12, wordBreak: "break-all" }}>{site()}/s/{slugOf(r.business_id)}?ref={r.code}</code></td>
                  <td>
                    <form action={setStatus} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="id" value={r.id} />
                      {r.status === "approved" || r.status === "paused" ? <button className="btn blue small" name="status" value="running">Mark running</button> : null}
                      {r.status === "running" ? <button className="btn secondary small" name="status" value="paused">Pause</button> : null}
                      {r.status === "changes_requested" ? <button className="btn secondary small" name="status" value="needs_approval">Re-send for OK</button> : null}
                      {r.status !== "ended" ? <button className="btn secondary small" name="status" value="ended">End</button> : null}
                    </form>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="muted">No campaigns yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="stack">
          <form className="card row" action="/admin/ads">
            <label style={{ flex: 1 }}>Working on<select name="client" defaultValue={clientId}>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button className="btn secondary small" style={{ alignSelf: "flex-end" }}>Switch</button>
          </form>
          {client && (
            <form action={createCampaign} className="card stack">
              <h2>New campaign for {client.name}</h2>
              <input type="hidden" name="business_id" value={client.id} />
              {client.ad_budget_monthly != null && <p className="muted" style={{ margin: 0 }}>Their monthly ad budget: {money(client.ad_budget_monthly)}</p>}
              <label>Name<input name="name" required placeholder="Christmas pre-orders" /></label>
              <label>Type<select name="kind" defaultValue="boost">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <div className="row"><label style={{ flex: 1 }}>Daily budget (BBD)<input name="daily_budget" type="number" min="1" step="1" required /></label><label style={{ flex: 1 }}>Starts<input name="starts_on" type="date" /></label><label style={{ flex: 1 }}>Ends<input name="ends_on" type="date" /></label></div>
              <label>Clip from their library<select name="clip_id" defaultValue=""><option value="">None or picked in Meta</option>{(clips ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
              <label>Caption<textarea name="caption" rows={2} /></label>
              <fieldset className="stack" style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 14, margin: 0, gap: 10 }}>
                <legend style={{ fontWeight: 700, padding: "0 6px" }}>Who sees it</legend>
                <label>Where<select name="area" defaultValue="barbados"><option value="barbados">All of Barbados</option><option value="parishes">Chosen parishes</option><option value="radius">Around the shop</option></select></label>
                <div className="row" style={{ gap: 8 }}>{PARISHES.map((p) => <label key={p} style={{ flexDirection: "row", alignItems: "center", fontWeight: 400, fontSize: 13 }}><input type="checkbox" name="parishes" value={p} /> {p}</label>)}</div>
                <label>Distance from the shop (km, for "Around the shop")<input name="radius_km" type="number" min="1" max="80" placeholder="10" /></label>
                <div className="row"><label style={{ flex: 1 }}>Age from<input name="age_min" type="number" min="18" max="65" defaultValue={22} /></label><label style={{ flex: 1 }}>to<input name="age_max" type="number" min="18" max="65" defaultValue={55} /></label>
                <label style={{ flex: 1 }}>Gender<select name="gender" defaultValue="all"><option value="all">Everyone</option><option value="women">Women</option><option value="men">Men</option></select></label></div>
                <label>Interests (commas)<input name="interests" placeholder="Local food, baking, weddings" /></label>
                <div className="stack" style={{ gap: 4 }}><strong style={{ fontSize: 14 }}>Also show it to</strong>{Object.entries(WARM).map(([k, l]) => <label key={k} style={{ flexDirection: "row", alignItems: "center", fontWeight: 400, fontSize: 14 }}><input type="checkbox" name="warm" value={k} /> {l}{k === "past_customers" ? ` (${consented ?? 0} have agreed)` : ""}{(k === "shop_visitors" || k === "cart_abandoners") && !client.meta_pixel_id ? " (needs their Pixel)" : ""}</label>)}</div>
                <div className="row"><label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="placements" value="instagram" defaultChecked /> Instagram</label><label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="placements" value="facebook" defaultChecked /> Facebook</label></div>
                <label>Notes for the team (optional)<input name="audience" placeholder="Exclude people who bought this week" /></label>
              </fieldset>
              <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="notify" defaultChecked /> Ask the owner on WhatsApp</label>
              <button className="btn blue" style={{ alignSelf: "flex-start" }}>Send to client for approval</button>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Once they approve, build it in their Meta ad account with the shop link shown in the table, then mark it running.</p>
            </form>
          )}
          {client && (
            <form action={saveAdSettings} className="card stack">
              <h2>{client.name}: ad setup</h2>
              <input type="hidden" name="business_id" value={client.id} />
              <label>Who pays for ad spend<select name="ad_billing" defaultValue={client.ad_billing}><option value="own_account">Client's own Meta ad account and card</option><option value="wallet">Prepaid wallet (ZDMINC's ad account)</option></select></label>
              <label>Meta Pixel ID<input name="meta_pixel_id" inputMode="numeric" defaultValue={client.meta_pixel_id ?? ""} placeholder="From Meta Events Manager" /></label>
              <label>Conversions API token {capi ? "(saved; leave blank to keep)" : ""}<input name="capi_token" type="password" autoComplete="off" /></label>
              <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save ad setup</button>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>The Pixel loads on their shop once a visitor accepts cookies. The token lets paid WhatsApp orders count as purchases in Meta. {consented ? <a href={`/admin/ads/audience/${client.id}`}>Download {consented} consented customers for Meta (hashed CSV)</a> : "No customers have agreed to marketing yet."}</p>
            </form>
          )}
          {client?.ad_billing === "wallet" && (
            <form action={sendTopUp} className="card stack">
              <h2>Ad wallet: {money(balance ?? 0)}</h2>
              <input type="hidden" name="business_id" value={client.id} />
              <p className="muted" style={{ margin: 0 }}>Spend you log comes off this balance. Ads can't be marked running with less than one day's budget left.</p>
              <label>Top-up amount (BBD)<input name="amount" type="number" min="20" step="10" defaultValue={client.ad_budget_monthly ?? 300} /></label>
              <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}><input type="checkbox" name="notify" defaultChecked /> Send the payment link on WhatsApp</label>
              <button className="btn blue small" style={{ alignSelf: "flex-start" }}>Send top-up invoice</button>
            </form>
          )}
          <form action={logSpend} className="card stack">
            <h2>Log spend</h2>
            <label>Campaign<select name="campaign_id" required defaultValue="">{[<option key="" value="" disabled>Choose</option>, ...live.map((r) => <option key={r.id} value={r.id}>{name(r.business_id)} · {r.code} {r.name}</option>)]}</select></label>
            <div className="row"><label style={{ flex: 1 }}>Date<input name="day" type="date" defaultValue={todayIn()} required /></label><label style={{ flex: 1 }}>Spent (BBD)<input name="amount" type="number" min="0" step="0.01" required /></label></div>
            <div className="row"><label style={{ flex: 1 }}>Impressions<input name="impressions" type="number" min="0" /></label><label style={{ flex: 1 }}>Clicks<input name="clicks" type="number" min="0" /></label></div>
            <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save</button>
          </form>
          {client && (
            <form action={importSpend} className="card stack">
              <h2>Paste spend for {client.name}</h2>
              <input type="hidden" name="business_id" value={client.id} />
              <textarea name="rows" rows={4} placeholder={"A-1, 2026-11-03, 10.00\nA-2, 2026-11-03, 5.00"} />
              <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Import</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
