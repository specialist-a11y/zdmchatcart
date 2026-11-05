import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CopyButton } from "@/components/CopyButton";
import { QrButton } from "@/components/QrButton";
import { shortUrl } from "@/lib/links";
import { cleanHours, hasHours } from "@/lib/hours";
import { THEMES, change, shopScore, specialActive } from "@/lib/shop-front";
import { quickLink, saveShopFront } from "./front-actions";

const PAID = ["paid", "ready", "fulfilled"];
const DAY = 864e5;
const CSS = `
.wr-funnel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.wr-funnel b { font-family: "Barlow Condensed", sans-serif; font-size: 34px; line-height: 1; display: block; }
.wr-bar { height: 8px; border-radius: 4px; background: #eef2f1; overflow: hidden; margin-top: 8px; }
.wr-bar i { display: block; height: 100%; background: var(--blue); border-radius: 4px; }
.wr-ring { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.wr-ring span { width: 70px; height: 70px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-family: "Barlow Condensed", sans-serif; font-size: 26px; font-weight: 800; }
.wr-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.wr-themes label { border: 2px solid var(--line); border-radius: 12px; padding: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; font-weight: 700; }
.wr-themes input { position: absolute; opacity: 0; }
.wr-themes label:has(input:checked) { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(61,139,255,.2); }
.wr-themes small { font-weight: 400; color: var(--muted); font-size: 12px; }
@media (max-width: 640px) { .wr-funnel { grid-template-columns: 1fr 1fr; } }
`;

/** Top of the Website page: is the shop working, one thing to improve, and a link for today's post. */
export default async function WebsiteResults({ supabase, business, slug, canEdit, shopUrl, domain, made }: {
  supabase: SupabaseClient; business: { id: string; name: string; logo_url: string | null; brand_color: string; description?: string | null };
  slug: string; canEdit: boolean; shopUrl: string; domain: string | null; made?: string;
}) {
  const now = Date.now();
  const wk = new Date(now - 7 * DAY).toISOString(), prev = new Date(now - 14 * DAY).toISOString();
  const month = new Date(now - 30 * DAY).toISOString();
  const [{ data: ev, error: evErr }, { data: orders }, { data: front }, { data: prods }, { data: links }] = await Promise.all([
    supabase.from("shop_events").select("kind, source, created_at").eq("business_id", business.id).gte("created_at", prev).limit(20000),
    supabase.from("orders").select("status, source, attribution, created_at, paid_at").eq("business_id", business.id).gte("created_at", prev).limit(5000),
    supabase.from("businesses").select("hours, shop_theme, special_text, special_ends_at, announcement").eq("id", business.id).maybeSingle(),
    supabase.from("products").select("image_url").eq("business_id", business.id).eq("active", true),
    supabase.from("short_links").select("code, ref, clicks").eq("business_id", business.id),
  ]);
  const inWeek = (iso: string) => iso >= wk, inPrev = (iso: string) => iso >= prev && iso < wk;
  const count = (rows: any[] | null, f: (r: any) => boolean) => (rows ?? []).filter(f).length;
  const stats = (w: (iso: string) => boolean) => ({
    visits: count(ev, (e) => e.kind === "visit" && w(e.created_at)),
    carts: count(ev, (e) => e.kind === "cart" && w(e.created_at)),
    orders: count(orders, (o) => o.source === "web" && w(o.created_at)),
    paid: count(orders, (o) => o.paid_at && PAID.includes(o.status) && w(o.paid_at)),
  });
  const cur = stats(inWeek), was = stats(inPrev);
  const top = Math.max(1, cur.visits, cur.carts, cur.orders, cur.paid);
  const delta = change(cur.visits + cur.orders * 5, was.visits + was.orders * 5);
  const igVisits = count(ev, (e) => e.kind === "visit" && e.source === "instagram" && inWeek(e.created_at));
  const igOrders = count(orders, (o) => inWeek(o.created_at) && (o.source === "instagram" || /^IG-/i.test(o.attribution ?? "")));
  const looking = count(ev, (e) => e.kind === "visit" && Date.parse(e.created_at) > now - 5 * 60_000);

  const special = specialActive(front?.special_text, front?.special_ends_at);
  const score = shopScore({
    logo: !!business.logo_url, colour: !!business.brand_color && business.brand_color.toUpperCase() !== "#0F7C7E", domain: !!domain,
    products: prods?.length ?? 0, withPhotos: (prods ?? []).filter((p) => p.image_url).length,
    hours: hasHours(cleanHours(front?.hours)), about: !!business.description?.trim(), special, base: `/dashboard/${slug}`,
  });
  const todo = score.items.filter((i) => !i.done);

  // Best link this month by paid orders.
  const { data: sold } = (links ?? []).length
    ? await supabase.from("orders").select("attribution").eq("business_id", business.id).in("attribution", (links ?? []).map((l) => l.ref)).in("status", PAID).gte("created_at", month)
    : { data: [] as any[] };
  const n = new Map<string, number>();
  for (const o of sold ?? []) n.set(o.attribution, (n.get(o.attribution) ?? 0) + 1);
  const bestLink = (links ?? []).map((l) => ({ ...l, orders: n.get(l.ref) ?? 0 })).sort((a, b) => b.orders - a.orders)[0];
  const madeUrl = made && /^[a-z0-9-]{2,40}$/.test(made) ? shortUrl(made, domain) : null;
  const endsLocal = front?.special_ends_at ? new Date(Date.parse(front.special_ends_at) - 4 * 3600_000).toISOString().slice(0, 16) : "";
  const pct = (v: number) => `${Math.max(3, Math.round((v / top) * 100))}%`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section className="card stack" style={{ gap: 10 }} aria-label="This week">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>This week{delta != null ? <span className="muted" style={{ fontSize: 16, fontFamily: "inherit", fontWeight: 600 }}> · vs last week {delta >= 0 ? "+" : ""}{delta}%</span> : null}</h2>
          {looking > 0 && <span className="badge paid" style={{ textTransform: "none" }}>● {looking} {looking === 1 ? "person" : "people"} looking now</span>}
        </div>
        {evErr ? <p className="muted" style={{ margin: 0 }}>Visit counts start once supabase/migrations/0016_shop_front.sql has run.</p> : (
          <div className="wr-funnel">
            {([["Visits", cur.visits], ["Carts started", cur.carts], ["WhatsApp orders", cur.orders], ["Paid", cur.paid]] as const).map(([k, v]) => (
              <div key={k}><span className="muted" style={{ fontSize: 13 }}>{k}</span><b>{v}</b><div className="wr-bar"><i style={{ width: pct(v) }} /></div></div>
            ))}
          </div>
        )}
        {!evErr && <span className="muted" style={{ fontSize: 14 }}>{igVisits ? `${igVisits} ${igVisits === 1 ? "person" : "people"} opened your shop from Instagram this week${igOrders ? ` and ${igOrders} ordered` : ""}.` : cur.visits ? "Share your link on Instagram to see visits from there." : "Visits show here as people open your shop link."}</span>}
      </section>

      <div className="cols">
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Shop score</h2>
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 16 }}>
            <div className="wr-ring" style={{ background: `conic-gradient(var(--blue) ${score.pct * 3.6}deg, #eef2f1 0)` }}><span>{score.pct}%</span></div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, fontSize: 14, minWidth: 0 }}>
              {score.items.map((i) => <li key={i.key} style={i.done ? { color: "var(--muted)" } : undefined}>{i.done ? "✓" : "○"} {i.done ? i.label : <Link href={i.href}>{i.todo}</Link>}</li>)}
            </ul>
          </div>
          {todo[0] && <Link className="btn small" href={todo[0].href} style={{ alignSelf: "flex-start" }}>Next: {todo[0].todo}</Link>}
        </section>

        <section id="today" className="card stack" style={{ gap: 10 }}>
          <h2>Make a link for today&apos;s post</h2>
          {madeUrl ? (
            <div className="stack" style={{ gap: 8 }}>
              <code style={{ fontSize: 16, wordBreak: "break-all" }}>{madeUrl.replace(/^https?:\/\//, "")}</code>
              <div className="row" style={{ gap: 6 }}>
                <CopyButton text={madeUrl} />
                <a className="btn secondary small" href={`https://wa.me/?text=${encodeURIComponent(`Order from ${business.name} here: ${madeUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp Status</a>
                <Link className="btn secondary small" href={`/dashboard/${slug}/website/qr-card?code=${made}`} target="_blank">QR card</Link>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>Every order from this link is counted under {made!.toUpperCase()}. <Link href={`/dashboard/${slug}/website`}>Make another</Link></span>
            </div>
          ) : canEdit ? (
            <form action={quickLink} className="stack" style={{ gap: 8 }}>
              <input type="hidden" name="slug" value={slug} />
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>{(domain ?? shopUrl.replace(/^https?:\/\//, "").split("/")[0])}/</span>
                <input name="code" required placeholder="rumcake" maxLength={40} aria-label="Short name for the link" style={{ flex: 1, minWidth: 0 }} />
              </div>
              <input name="label" placeholder="What's the post? (optional)" maxLength={80} aria-label="What the post is" />
              <button className="btn small" style={{ alignSelf: "flex-start" }}>Make the link</button>
            </form>
          ) : <p className="muted" style={{ margin: 0 }}>Ask the owner to make links.</p>}
          {bestLink && bestLink.orders > 0 && <span style={{ fontSize: 14 }}>🏆 /{bestLink.code}: {bestLink.orders} order{bestLink.orders === 1 ? "" : "s"} this month</span>}
        </section>
      </div>

      <form id="front" action={saveShopFront} className="card stack" style={{ gap: 12 }}>
        <input type="hidden" name="slug" value={slug} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Shop front</h2>
          <Link href={`/s/${slug}`} target="_blank" style={{ fontWeight: 700, fontSize: 14 }}>See it live ↗</Link>
        </div>
        <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
          <label>Specials strip <span className="muted" style={{ fontWeight: 400 }}>(shows above your products)</span>
            <input name="special_text" maxLength={160} defaultValue={front?.special_text ?? ""} placeholder="This Saturday only: rum cake, pre-order by Friday 6pm" />
          </label>
          <label style={{ maxWidth: 300 }}>Ends <span className="muted" style={{ fontWeight: 400 }}>(it hides itself after this)</span>
            <input name="special_ends" type="datetime-local" defaultValue={endsLocal} />
          </label>
          <label className="row" style={{ flexDirection: "row", gap: 8, fontWeight: 600 }}><input type="checkbox" name="announce_on" defaultChecked={!!front?.announcement} style={{ width: 20, height: 20 }} />Announcement bar across the top</label>
          <input name="announcement" maxLength={160} defaultValue={front?.announcement ?? ""} placeholder="Closed Monday for the holiday" aria-label="Announcement" />
          <b style={{ fontSize: 14 }}>Theme <span className="muted" style={{ fontWeight: 400 }}>(colours and fonts built from your brand colour)</span></b>
          <div className="wr-themes" role="radiogroup" aria-label="Theme">
            <label style={{ position: "relative" }}><input type="radio" name="theme" value="" defaultChecked={!front?.shop_theme} />Template colours<small>Keep the look of your website template.</small></label>
            {THEMES.map((t) => (
              <label key={t.id} style={{ position: "relative" }}>
                <input type="radio" name="theme" value={t.id} defaultChecked={front?.shop_theme === t.id} />
                <span style={{ display: "flex", gap: 4 }}><i style={{ width: 16, height: 16, borderRadius: 4, background: business.brand_color }} /><i style={{ width: 16, height: 16, borderRadius: 4, background: t.special }} /></span>
                {t.name}<small>{t.blurb}</small>
                <a href={`/s/${slug}?theme=${t.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Preview ↗</a>
              </label>
            ))}
          </div>
          {canEdit && <button className="btn" style={{ alignSelf: "flex-start" }}>Save shop front</button>}
        </fieldset>
      </form>
    </>
  );
}
