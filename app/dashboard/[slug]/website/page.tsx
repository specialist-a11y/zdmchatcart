import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/CrmShell";
import { CopyButton } from "@/components/CopyButton";
import { num } from "@/lib/crm-nav";
import { dnsRecord, normaliseDomain, shortUrl, slugifyCode, validCode, validRef } from "@/lib/links";
import { addDomainToHost, checkDomain, removeDomainFromHost } from "@/lib/domains";
import { money } from "@/lib/order-text";
import TemplatePicker from "./TemplatePicker";

export default async function WebsitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  const canEdit = role === "owner" || role === "admin";
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const base = `/dashboard/${slug}`;
  const path = `${base}/website`;

  const [{ count: products }, { data: domains }, { data: links }, { data: look }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
    supabase.from("business_domains").select("id, domain, status, last_error, last_checked_at").eq("business_id", business.id).order("created_at"),
    supabase.from("short_links").select("id, code, label, ref, clicks, last_click_at, created_at").eq("business_id", business.id).order("created_at", { ascending: false }),
    supabase.from("businesses").select("site_template, hero_image_url").eq("id", business.id).maybeSingle(),
  ]);
  const refs = [...new Set((links ?? []).map((l) => l.ref))];
  const { data: sold } = refs.length
    ? await supabase.from("orders").select("attribution, total").eq("business_id", business.id).in("attribution", refs).in("status", ["paid", "ready", "fulfilled"])
    : { data: [] as { attribution: string | null; total: number }[] };
  const byRef = new Map<string, { n: number; sales: number }>();
  for (const o of sold ?? []) { const c = byRef.get(o.attribution!) ?? { n: 0, sales: 0 }; c.n++; c.sales += Number(o.total); byRef.set(o.attribution!, c); }
  const live = (domains ?? []).find((d) => d.status === "active");
  const shopUrl = live ? `https://${live.domain}` : `${site}/s/${slug}`;

  async function guard() {
    "use server";
    const ctx = await requireMembership(slug);
    if (ctx.role !== "owner" && ctx.role !== "admin") redirect(`${path}?msg=${encodeURIComponent("Only owners and admins can change this")}`);
    return ctx;
  }

  async function addDomain(formData: FormData) {
    "use server";
    const { business } = await guard();
    const domain = normaliseDomain(String(formData.get("domain") ?? ""));
    if (!domain) redirect(`${path}?msg=${encodeURIComponent("That doesn't look like a domain. Try islandcrumb.com or shop.islandcrumb.com")}#domain`);
    const admin = createAdminClient();
    const { count } = await admin.from("business_domains").select("id", { count: "exact", head: true }).eq("business_id", business.id);
    if ((count ?? 0) >= 3) redirect(`${path}?msg=${encodeURIComponent("Up to 3 domains per shop")}#domain`);
    const { error } = await admin.from("business_domains").insert({ business_id: business.id, domain });
    if (error) redirect(`${path}?msg=${encodeURIComponent(error.code === "23505" ? "That domain is already connected to a shop" : error.message)}#domain`);
    const host = await addDomainToHost(domain);
    if (!host.ok) await admin.from("business_domains").update({ status: "error", last_error: host.error }).eq("domain", domain);
    redirect(`${path}?msg=${encodeURIComponent(`Added ${domain}. Now add the DNS record below at your domain provider.`)}#domain`);
  }

  async function verifyDomain(formData: FormData) {
    "use server";
    const { business } = await guard();
    const domain = String(formData.get("domain"));
    const admin = createAdminClient();
    const r = await checkDomain(domain);
    const now = new Date().toISOString();
    await admin.from("business_domains").update(r.ok
      ? { status: "active", last_error: null, last_checked_at: now, verified_at: now }
      : { status: "pending", last_error: r.error ?? null, last_checked_at: now })
      .eq("business_id", business.id).eq("domain", domain);
    redirect(`${path}?msg=${encodeURIComponent(r.ok ? `${domain} is live` : `Not yet: ${r.error}`)}#domain`);
  }

  async function removeDomain(formData: FormData) {
    "use server";
    const { business } = await guard();
    const domain = String(formData.get("domain"));
    await createAdminClient().from("business_domains").delete().eq("business_id", business.id).eq("domain", domain);
    await removeDomainFromHost(domain);
    redirect(`${path}?msg=${encodeURIComponent(`Removed ${domain}`)}#domain`);
  }

  async function addLink(formData: FormData) {
    "use server";
    const { business } = await guard();
    const label = String(formData.get("label") ?? "").trim().slice(0, 80);
    let code = slugifyCode(String(formData.get("code") ?? "") || label);
    const ref = (String(formData.get("ref") ?? "").trim() || code.toUpperCase()).slice(0, 40);
    if (!label) redirect(`${path}?msg=${encodeURIComponent("Give the link a name, like Black cake Story")}#links`);
    if (!validCode(code)) redirect(`${path}?msg=${encodeURIComponent("Short name needs 2 to 40 letters, numbers or dashes")}#links`);
    if (!validRef(ref)) redirect(`${path}?msg=${encodeURIComponent("Tracking code can only use letters, numbers and dashes")}#links`);
    const admin = createAdminClient();
    // Short names are shared across all shops; add a number if it's taken.
    for (let i = 2; i < 50; i++) {
      const { error } = await admin.from("short_links").insert({ business_id: business.id, code, label, ref });
      if (!error) redirect(`${path}?msg=${encodeURIComponent(`Link ready: ${shortUrl(code, (await admin.from("business_domains").select("domain").eq("business_id", business.id).eq("status", "active").limit(1).maybeSingle()).data?.domain)}`)}#links`);
      if (error.code !== "23505") redirect(`${path}?msg=${encodeURIComponent(error.message)}#links`);
      code = `${code.replace(/-\d+$/, "").slice(0, 36)}-${i}`;
    }
    redirect(`${path}?msg=${encodeURIComponent("Try a different short name")}#links`);
  }

  async function deleteLink(formData: FormData) {
    "use server";
    const { business } = await guard();
    await createAdminClient().from("short_links").delete().eq("business_id", business.id).eq("id", String(formData.get("id")));
    revalidatePath(path);
  }

  return (
    <div className="stack">
      <PageHeader n={num("website")} title="Website" sub="Your shop page, your own domain, and short links that track sales."
        actions={<Link className="btn small" href={live ? shopUrl : `/s/${slug}`} target="_blank">Open my shop</Link>} />
      {msg && <p className="ok" style={{ wordBreak: "break-word" }}>{msg}</p>}

      <div className="cols">
        <section className="card stack" style={{ gap: 8 }}>
          <h2>Your shop link</h2>
          <div className="row" style={{ gap: 8 }}><code style={{ wordBreak: "break-all", fontSize: 15, flex: "1 1 200px" }}>{shopUrl}</code><CopyButton text={shopUrl} /></div>
          <span className="muted">Put it in your Instagram bio and WhatsApp profile. For posts, Stories and ads, make a short link below so each one's sales are counted.</span>
        </section>
        <section className="card stack" style={{ gap: 8 }}>
          <h2>What's on it</h2>
          <Link href={`${base}/products`}>{products ?? 0} products and services ›</Link>
          <Link href="#look">Website look and template ›</Link>
          <Link href={`${base}/business`}>Name, logo, colour, hours, address and social links ›</Link>
        </section>
      </div>

      <TemplatePicker slug={slug} current={(look as any)?.site_template ?? "classic"} heroUrl={(look as any)?.hero_image_url ?? null} canEdit={canEdit} />

      <section id="domain" className="card stack">
        <h2>Your own domain</h2>
        <p className="muted" style={{ margin: 0 }}>Show your shop on your own name, like <b>islandcrumb.com</b> or <b>shop.islandcrumb.com</b>. You buy the domain from any provider; we connect it and handle the security certificate.</p>
        {(domains ?? []).map((d) => {
          const rec = dnsRecord(d.domain);
          return (
            <div key={d.id} className="card stack" style={{ gap: 8, background: "#fafbfa" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b style={{ wordBreak: "break-all" }}>{d.domain}</b>
                <span className={`badge ${d.status === "active" ? "paid" : d.status === "error" ? "cancelled" : "sent"}`}>{d.status === "active" ? "Live" : d.status === "error" ? "Needs ZDMINC" : "Waiting for DNS"}</span>
              </div>
              {d.status !== "active" && (
                <>
                  <span>At your domain provider, add this record:</span>
                  <div className="table-wrap"><table><thead><tr><th>Type</th><th>Name / host</th><th>Value / points to</th></tr></thead>
                    <tbody><tr><td><b>{rec.type}</b></td><td><code>{rec.host}</code></td><td><code>{rec.value}</code></td></tr></tbody></table></div>
                  {d.last_error && <span className="muted" style={{ fontSize: 13 }}>{d.last_error}</span>}
                </>
              )}
              {canEdit && (
                <div className="row">
                  {d.status !== "active" && <form action={verifyDomain}><input type="hidden" name="domain" value={d.domain} /><button className="btn small">Check now</button></form>}
                  {d.status === "active" && <a className="btn secondary small" href={`https://${d.domain}`} target="_blank" rel="noreferrer">Visit</a>}
                  <form action={removeDomain}><input type="hidden" name="domain" value={d.domain} /><button className="btn secondary small">Remove</button></form>
                </div>
              )}
            </div>
          );
        })}
        {canEdit && (domains?.length ?? 0) < 3 && (
          <form action={addDomain} className="row" style={{ alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 240px" }}>Domain<input name="domain" placeholder="islandcrumb.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
            <button className="btn blue">Connect domain</button>
          </form>
        )}
        {!(domains?.length) && <span className="muted" style={{ fontSize: 13 }}>Don't have one yet? Ask ZDMINC in Help and support and we'll buy and connect it for you.</span>}
      </section>

      <section id="links" className="card stack">
        <h2>Short links</h2>
        <p className="muted" style={{ margin: 0 }}>{live ? <>Links use your own domain, like <b>{live.domain}/cake</b>. </> : <>Connect your own domain above and links become <b>yourname.com/cake</b>. </>}Short, tidy links for Stories, your bio, ads, flyers and QR codes. Each one counts clicks and the paid orders it brings.</p>
        {canEdit && (
          <form action={addLink} className="grid" style={{ alignItems: "end" }}>
            <label>Name<input name="label" placeholder="Black cake Story" required maxLength={80} /></label>
            <label>Short name (optional)<input name="code" placeholder="cake" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} /></label>
            <label>Tracking code (optional)<input name="ref" placeholder="Same as short name, or an ad code like A-3" maxLength={40} /></label>
            <button className="btn blue">Make short link</button>
          </form>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Link</th><th>Name</th><th>Clicks</th><th>Paid orders</th><th>Sales</th><th /></tr></thead>
            <tbody>
              {(links ?? []).map((l) => {
                const s = byRef.get(l.ref);
                const url = shortUrl(l.code, live?.domain);
                return (
                  <tr key={l.id}>
                    <td><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><code>{url.replace(/^https?:\/\//, "")}</code><CopyButton text={url} /></div></td>
                    <td>{l.label}<br /><span className="muted" style={{ fontSize: 12 }}>tracks as {l.ref}</span></td>
                    <td><b>{l.clicks}</b></td>
                    <td><b>{s?.n ?? 0}</b>{l.clicks > 0 && s ? <span className="muted" style={{ fontSize: 12 }}> · {Math.round((s.n / l.clicks) * 100)}%</span> : null}</td>
                    <td>{money(s?.sales ?? 0, business.currency)}</td>
                    <td>{canEdit && <form action={deleteLink}><input type="hidden" name="id" value={l.id} /><button className="btn secondary small" aria-label={`Delete ${l.label}`}>Delete</button></form>}</td>
                  </tr>
                );
              })}
              {!links?.length && <tr><td colSpan={6} className="muted">No short links yet. Make one for your next Story.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
