import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { connectionHealth } from "@/lib/nightly";
import type { TokenState } from "@/lib/health";
import { changeRole, inviteMember, removeMember } from "./team-actions";
import { cleanHours, hasHours } from "@/lib/hours";

async function requireAdmin(slug: string) {
  const ctx = await requireMembership(slug);
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    redirect(`/dashboard/${slug}/settings?msg=Only owners and admins can change settings`);
  }
  return ctx;
}

export default async function SettingsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { supabase, business, role } = await requireMembership(slug);
  const isAdmin = role === "owner" || role === "admin";
  const { data: integrations } = await supabase
    .from("integrations")
    .select("provider, status, config")
    .eq("business_id", business.id);
  const fygaro = integrations?.find((i) => i.provider === "fygaro");
  const whatsapp = integrations?.find((i) => i.provider === "whatsapp");
  const social = integrations?.find((i) => i.provider === "instagram" && i.status === "connected");
  const sc = (social?.config ?? {}) as { page_name?: string; ig_username?: string | null; ig_followers?: number | null; pages?: { id: string; name: string; ig: string | null }[] };
  const path = `/dashboard/${slug}/settings`;
  const { data: bank } = await createAdminClient().from("businesses").select("bank_transfer_enabled, bank_details, rental_agreement_url, rental_pickup_times, rental_lead_days, rental_buffer_days").eq("id", business.id).single();
  const { count: rentalCount } = await createAdminClient().from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("rental", true);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  async function saveBank(formData: FormData) {
    "use server";
    const { business } = await requireAdmin(slug);
    const details = String(formData.get("bank_details") ?? "").trim().slice(0, 600);
    const enabled = formData.get("bank_transfer_enabled") === "on";
    if (enabled && details.length < 10) redirect(`${path}?msg=${encodeURIComponent("Add your bank details before turning bank transfer on")}#bank`);
    await createAdminClient().from("businesses").update({ bank_transfer_enabled: enabled, bank_details: details || null }).eq("id", business.id);
    redirect(`${path}?msg=${encodeURIComponent(enabled ? "Bank transfer is on" : "Bank transfer saved (off)")}#bank`);
  }

  async function saveRentals(formData: FormData) {
    "use server";
    const { business } = await requireAdmin(slug);
    const url = String(formData.get("rental_agreement_url") ?? "").trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) redirect(`${path}?msg=${encodeURIComponent("The agreement link must start with https://")}#rentals`);
    const n = (k: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(formData.get(k) ?? 0) || 0)));
    await createAdminClient().from("businesses").update({
      rental_agreement_url: url || null,
      rental_pickup_times: String(formData.get("rental_pickup_times") ?? "").trim().slice(0, 300) || null,
      rental_lead_days: n("rental_lead_days", 60),
      rental_buffer_days: n("rental_buffer_days", 7),
    }).eq("id", business.id);
    redirect(`${path}?msg=${encodeURIComponent("Rental settings saved")}#rentals`);
  }

  async function disconnectSocial() {
    "use server";
    const { business } = await requireAdmin(slug);
    const admin = createAdminClient();
    await admin.from("integration_secrets").delete().eq("business_id", business.id).eq("provider", "instagram");
    await admin.from("integrations").update({ status: "pending" }).eq("business_id", business.id).eq("provider", "instagram");
    redirect(`${path}?msg=Instagram and Facebook disconnected#social`);
  }

  async function saveFygaro(formData: FormData) {
    "use server";
    const { business } = await requireAdmin(slug);
    const buttonUrl = String(formData.get("button_url") ?? "").trim();
    const keyId = String(formData.get("key_id") ?? "").trim();
    const secret = String(formData.get("secret") ?? "").trim();
    if (!/^https:\/\//.test(buttonUrl) || !keyId) redirect(`${path}?msg=Fygaro link URL and API key are required`);
    const admin = createAdminClient();
    await admin.from("integrations").upsert({
      business_id: business.id, provider: "fygaro", status: "connected",
      config: { button_url: buttonUrl, key_id: keyId }, updated_at: new Date().toISOString(),
    });
    if (secret) {
      await admin.from("integration_secrets").upsert({ business_id: business.id, provider: "fygaro", secret, updated_at: new Date().toISOString() });
    }
    redirect(`${path}?msg=Fygaro saved`);
  }

  async function saveWhatsApp(formData: FormData) {
    "use server";
    const { business } = await requireAdmin(slug);
    const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();
    const wabaId = String(formData.get("waba_id") ?? "").trim();
    if (wabaId && !/^\d+$/.test(wabaId)) redirect(`${path}?msg=Business account ID should be digits only`);
    const token = String(formData.get("access_token") ?? "").trim();
    if (!/^\d+$/.test(phoneNumberId)) redirect(`${path}?msg=Phone number ID should be digits only`);
    const admin = createAdminClient();
    await admin.from("integrations").upsert({
      business_id: business.id, provider: "whatsapp", status: "connected",
      config: { phone_number_id: phoneNumberId, ...(wabaId ? { waba_id: wabaId } : {}) }, updated_at: new Date().toISOString(),
    });
    if (token) {
      await admin.from("integration_secrets").upsert({ business_id: business.id, provider: "whatsapp", secret: token, updated_at: new Date().toISOString() });
    }
    redirect(`${path}?msg=WhatsApp saved`);
  }

  async function saveNotify(formData: FormData) {
    "use server";
    const { business } = await requireAdmin(slug);
    const { error } = await createAdminClient().from("businesses").update({ daily_summary: formData.get("daily_summary") === "on" }).eq("id", business.id);
    redirect(`${path}?msg=${encodeURIComponent(error ? "Run supabase/migrations/0015_priority_features.sql first" : "Notifications saved")}#notify`);
  }
  const { data: notify } = await supabase.from("businesses").select("daily_summary").eq("id", business.id).maybeSingle();

  const cfg = (i?: { config: any }) => (i?.config ?? {}) as Record<string, string>;
  // Ask Meta whether the saved tokens still work, and when they stop.
  const health: Record<string, TokenState | null> = hasServiceRoleKey() ? await connectionHealth(createAdminClient(), business.id) : {};
  const sinceText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "America/Barbados", day: "numeric", month: "short" }) : null);
  const [{ data: lastPay }, { data: lastWa }, { data: domain }, { count: productCount }, { data: hb }, { data: members }, { data: subPlan }] = await Promise.all([
    supabase.from("orders").select("paid_at").eq("business_id", business.id).not("fygaro_transaction_id", "is", null).neq("fygaro_transaction_id", "manual").order("paid_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("messages").select("created_at").eq("business_id", business.id).eq("channel", "whatsapp").eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("business_domains").select("domain, status").eq("business_id", business.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
    supabase.from("businesses").select("hours").eq("id", business.id).maybeSingle(),
    supabase.from("business_members").select("user_id, role, created_at").eq("business_id", business.id).order("created_at"),
    supabase.from("subscriptions").select("plans!subscriptions_plan_id_fkey(seats)").eq("business_id", business.id).maybeSingle<any>(),
  ]);
  // Names and emails for the team list (server key only).
  const people = new Map<string, { email?: string; name?: string }>();
  if (hasServiceRoleKey() && isAdmin) {
    const adminDb = createAdminClient();
    await Promise.all((members ?? []).map(async (m) => {
      const { data } = await adminDb.auth.admin.getUserById(m.user_id);
      if (data?.user) people.set(m.user_id, { email: data.user.email ?? undefined, name: data.user.user_metadata?.full_name || data.user.user_metadata?.name });
    }));
  }
  const seats = subPlan?.plans?.seats ?? null;
  type Check = { name: string; state: "ok" | "warn" | "bad" | "off"; detail: string; fix?: { href: string; label: string } };
  const st = (k: string) => health[k];
  const checks: Check[] = [
    { name: "Payments (Fygaro)", state: fygaro?.status === "connected" ? "ok" : "off",
      detail: fygaro?.status === "connected" ? (lastPay?.paid_at ? `Working. Last online payment ${sinceText(lastPay.paid_at)}.` : "Connected. No online payments yet.") : "Not set up. ZDMINC connects this for you." },
    { name: "WhatsApp", state: whatsapp?.status !== "connected" ? "off" : st("whatsapp")?.state === "expired" ? "bad" : st("whatsapp")?.state === "soon" ? "warn" : "ok",
      detail: whatsapp?.status !== "connected" ? "Not connected." : `${st("whatsapp")?.label ?? "Connected"}.${lastWa?.created_at ? ` Last customer message ${sinceText(lastWa.created_at)}.` : ""}`,
      fix: st("whatsapp")?.state === "expired" || st("whatsapp")?.state === "soon" ? { href: `/dashboard/${slug}/support?t=new&subject=${encodeURIComponent("WhatsApp needs reconnecting")}`, label: "Ask ZDMINC" } : undefined },
    { name: "Instagram and Facebook", state: !social ? "off" : st("instagram")?.state === "expired" ? "bad" : st("instagram")?.state === "soon" ? "warn" : "ok",
      detail: !social ? "Not connected." : `${sc.ig_username ? `@${sc.ig_username}. ` : ""}${st("instagram")?.label ?? "Connected"}.`,
      fix: !social || st("instagram")?.state === "expired" || st("instagram")?.state === "soon" ? { href: `/api/social/connect?slug=${slug}`, label: social ? "Reconnect" : "Connect" } : undefined },
    { name: "Your own domain", state: domain?.status === "active" ? "ok" : domain ? "warn" : "off",
      detail: domain?.status === "active" ? `${domain.domain} is live.` : domain ? `${domain.domain} is waiting for its DNS settings.` : "Optional. Your shop works on the ZDM ChatCart link.",
      fix: domain?.status === "active" ? undefined : { href: `/dashboard/${slug}/website`, label: domain ? "See settings" : "Add one" } },
    { name: "Shop basics", state: (productCount ?? 0) > 0 && business.logo_url && hasHours(cleanHours(hb?.hours)) ? "ok" : "warn",
      detail: [(productCount ?? 0) > 0 ? `${productCount} products live` : "No products yet", business.logo_url ? "logo added" : "no logo", hasHours(cleanHours(hb?.hours)) ? "hours set" : "hours not set"].join(" · "),
      fix: !(productCount ?? 0) ? { href: `/dashboard/${slug}/products`, label: "Add products" } : !business.logo_url || !hasHours(cleanHours(hb?.hours)) ? { href: `/dashboard/${slug}/business`, label: "Business info" } : undefined },
  ];
  const light = { ok: "#2bb673", warn: "#e0a23b", bad: "#d4553a", off: "#c4ccc8" };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader n={num("settings")} title="Settings" sub="Is everything working, who's on your team, and what we message you about." />
      {msg && <p className="ok">{msg}</p>}
      {!isAdmin && <p className="muted">Only owners and admins can change these settings.</p>}

      <section className="card stack" style={{ gap: 0 }} aria-label="Health checklist">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Health checklist</h2>
          <span className="muted" style={{ fontSize: 13 }}>{checks.filter((c) => c.state === "ok").length} of {checks.length} green</span>
        </div>
        {checks.map((c) => (
          <div key={c.name} className="row" style={{ borderTop: "1px solid #eef2f1", padding: "10px 0", flexWrap: "nowrap", alignItems: "flex-start" }}>
            <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: light[c.state], flex: "none", marginTop: 5 }} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><br /><span className="muted" style={{ fontSize: 14 }}>{c.detail}</span></span>
            {c.fix && <a className={`btn small ${c.state === "bad" ? "coral" : "secondary"}`} href={c.fix.href}>{c.fix.label}</a>}
          </div>
        ))}
        <span className="muted" style={{ fontSize: 13, marginTop: 6 }}>Checked when you open this page and every night. If one goes red we WhatsApp you. Anything you can't fix here, <Link href={`/dashboard/${slug}/support?t=new`}>ask ZDMINC</Link>.</span>
      </section>

      <form id="rentals" action={saveRentals} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>Rentals</h2>
          <span className={`badge ${rentalCount ? "paid" : ""}`}>{rentalCount ? `${rentalCount} rental item${rentalCount > 1 ? "s" : ""}` : "no rental items"}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Turn any product into a rental from Products (Rental settings). Customers then pick a pickup date and how many days or nights, only see what&apos;s free on those dates, and the booking holds the item so nobody else can take it.
        </p>
        <label>Rental agreement link (customers must tick to accept it)
          <input name="rental_agreement_url" type="url" defaultValue={bank?.rental_agreement_url ?? ""} disabled={!isAdmin} placeholder="https://starlightcinemaexperiences.com/rental-agreement" />
        </label>
        <label>Pickup times customers can choose (comma separated, leave blank to arrange on WhatsApp)
          <input name="rental_pickup_times" defaultValue={bank?.rental_pickup_times ?? ""} disabled={!isAdmin} placeholder="9:00 AM, 12:00 PM, 4:00 PM" />
        </label>
        <div className="grid">
          <label>Book at least this many days ahead<input name="rental_lead_days" type="number" min="0" max="60" defaultValue={bank?.rental_lead_days ?? 1} disabled={!isAdmin} /></label>
          <label>Days blocked after each return (cleaning, checks)<input name="rental_buffer_days" type="number" min="0" max="7" defaultValue={bank?.rental_buffer_days ?? 0} disabled={!isAdmin} /></label>
        </div>
        {isAdmin && <button className="btn" style={{ alignSelf: "flex-start" }}>Save rental settings</button>}
      </form>

      <form id="bank" action={saveBank} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>Bank transfer (1st Pay or any bank)</h2>
          <span className={`badge ${bank?.bank_transfer_enabled ? "paid" : ""}`}>{bank?.bank_transfer_enabled ? "on" : "off"}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          A second way to pay, next to card links. Customers get your details on WhatsApp with their order code as the reference, then send a screenshot or reference number.
          The order shows as <b>Transfer to check</b> until you confirm the money is in your account. Card payments still confirm on their own.
        </p>
        <label>Bank details customers will see
          <textarea name="bank_details" rows={4} maxLength={600} defaultValue={bank?.bank_details ?? ""} disabled={!isAdmin}
            placeholder={"CIBC Caribbean, Holetown branch\nAccount name: Island Crumb Bakery Ltd\nAccount number: 1002345678\n1st Pay: use the account number above"} />
        </label>
        <label className="row" style={{ gap: 8, fontWeight: 500 }}>
          <input type="checkbox" name="bank_transfer_enabled" defaultChecked={!!bank?.bank_transfer_enabled} disabled={!isAdmin} style={{ width: "auto" }} />
          Offer bank transfer at checkout and on WhatsApp
        </label>
        {isAdmin && <button className="btn" style={{ alignSelf: "flex-start" }}>Save bank transfer</button>}
      </form>

      <section id="team" className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>Team</h2>
          {seats != null && <span className="muted" style={{ fontSize: 13 }}>{members?.length ?? 0} of {seats} seats used</span>}
        </div>
        <span className="muted" style={{ fontSize: 14 }}>Staff can take orders, use the Inbox, and manage customers and products. They can't see billing or change settings. Admins can do everything except remove the owner.</span>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Role</th><th /></tr></thead>
            <tbody>
              {(members ?? []).map((m) => {
                const p = people.get(m.user_id);
                return (
                  <tr key={m.user_id}>
                    <td>{p?.name ?? p?.email ?? "Team member"}{p?.name && p?.email && <><br /><span className="muted" style={{ fontSize: 13 }}>{p.email}</span></>}</td>
                    <td>
                      {role === "owner" && m.role !== "owner" ? (
                        <form action={changeRole} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="user_id" value={m.user_id} />
                          <select name="role" defaultValue={m.role} aria-label="Role" style={{ minWidth: 100 }}><option value="admin">Admin</option><option value="staff">Staff</option></select>
                          <button className="btn secondary small">Save</button>
                        </form>
                      ) : <span className="badge">{m.role}</span>}
                    </td>
                    <td>{isAdmin && m.role !== "owner" && (role === "owner" || m.role === "staff") && (
                      <form action={removeMember}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="user_id" value={m.user_id} /><button className="btn secondary small">Remove</button></form>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <form action={inviteMember} className="row" style={{ gap: 8 }}>
            <input type="hidden" name="slug" value={slug} />
            <input name="email" type="email" required placeholder="Their email" aria-label="Email to invite" style={{ flex: "1 1 220px" }} />
            <select name="role" defaultValue="staff" aria-label="Role"><option value="staff">Staff</option>{role === "owner" && <option value="admin">Admin</option>}</select>
            <button className="btn small" disabled={seats != null && (members?.length ?? 0) >= seats}>Invite</button>
          </form>
        )}
        {seats != null && (members?.length ?? 0) >= seats && <span className="muted" style={{ fontSize: 13 }}>All seats are used. <Link href={`/dashboard/${slug}/billing`}>Upgrade</Link> for more.</span>}
      </section>

      <form id="notify" action={saveNotify} className="card stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 22 }}>WhatsApp messages to you</h2>
        <label className="row" style={{ flexDirection: "row", gap: 8, fontWeight: 600 }}>
          <input type="checkbox" name="daily_summary" defaultChecked={notify?.daily_summary ?? true} disabled={!isAdmin} style={{ width: 20, height: 20 }} />
          Daily summary each morning: yesterday's sales, unpaid orders and chats waiting
        </label>
        <span className="muted" style={{ fontSize: 13 }}>Sent from the ZDMINC WhatsApp number to the owner phone in Business info. Alerts about your ad wallet and connections always go out.</span>
        {isAdmin && <button className="btn secondary small" style={{ alignSelf: "flex-start" }}>Save</button>}
      </form>

      <p className="card">Business name, logo, hours, address and contact details are in <Link href={`/dashboard/${slug}/business`}>Business info</Link>. Your plan and invoices are in <Link href={`/dashboard/${slug}/billing`}>Plan and billing</Link>.</p>

      <section id="social" className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>Instagram and Facebook</h2>
          <span className={`badge ${social ? "paid" : ""}`}>{social ? "connected" : "not connected"}</span>
        </div>
        {social ? (
          <>
            <p style={{ margin: 0 }}>
              {sc.ig_username ? <><b>@{sc.ig_username}</b>{sc.ig_followers != null && <span className="muted"> · {sc.ig_followers.toLocaleString()} followers</span>}<br /></> : <span className="muted">No Instagram professional account is linked to this Page yet.<br /></span>}
              Facebook Page: <b>{sc.page_name}</b>
            </p>
            {(sc.pages?.length ?? 0) > 1 && <p className="muted" style={{ margin: 0 }}>You manage {sc.pages!.length} Pages. To use a different one, connect again and tick only that Page.</p>}
            <div className="row">
              <a className="btn secondary small" href={`/api/social/connect?slug=${slug}`}>Reconnect</a>
              {isAdmin && <form action={disconnectSocial}><button className="btn secondary small">Disconnect</button></form>}
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Included on every plan. Log in with Facebook and pick your business Page and the Instagram professional account linked to it.
              We fill your shop page's social links, and your Instagram is ready for messages, posting and ads as you grow.
            </p>
            {isAdmin
              ? <a className="btn blue" href={`/api/social/connect?slug=${slug}`} style={{ alignSelf: "flex-start" }}>Connect Instagram and Facebook</a>
              : <p className="muted" style={{ margin: 0 }}>Ask the owner or an admin to connect.</p>}
            <span className="muted" style={{ fontSize: 13 }}>Your Instagram must be a Business or Creator account linked to a Facebook Page. ZDMINC can do this with you during setup.</span>
          </>
        )}
      </section>

      <details id="keys" className="card">
        <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>Connection keys · ZDMINC manages these</summary>
        <p className="muted" style={{ margin: "6px 0 12px" }}>ZDMINC sets up payments and WhatsApp for you. Only change these if the team asks you to.</p>
        <div className="stack">
      <form action={saveFygaro} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>Fygaro payments</h2>
          <span className="badge">{fygaro?.status ?? "not connected"}</span>
        </div>
        <p className="muted">
          Needs the Fygaro Pro plan or above. In Fygaro, create a Fygaro Link with an open amount and copy its URL.
          Then go to Settings, API Credentials and generate a key. Set the Hook URL to <code>{site}/api/webhooks/fygaro</code>.
        </p>
        <label>Fygaro Link URL<input name="button_url" type="url" required defaultValue={cfg(fygaro).button_url ?? ""} /></label>
        <label>API key (public key / key ID)<input name="key_id" required defaultValue={cfg(fygaro).key_id ?? ""} /></label>
        <label>API secret {fygaro ? "(leave blank to keep the saved one)" : ""}<input name="secret" type="password" autoComplete="off" required={!fygaro} /></label>
        <button className="btn" disabled={!isAdmin} style={{ alignSelf: "flex-start" }}>Save Fygaro</button>
      </form>

      <form id="whatsapp" action={saveWhatsApp} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>WhatsApp Cloud API</h2>
          <span className="badge">{whatsapp?.status ?? "not connected"}</span>
        </div>
        <p className="muted">
          From your Meta app: WhatsApp, API Setup. Webhook URL: <code>{site}/api/webhooks/whatsapp</code>, subscribed to <code>messages</code>.
        </p>
        <label>Phone number ID<input name="phone_number_id" required defaultValue={cfg(whatsapp).phone_number_id ?? ""} /></label>
        <label>WhatsApp business account ID <span className="muted" style={{ fontWeight: 400 }}>(optional, lets template approvals update on their own)</span><input name="waba_id" inputMode="numeric" defaultValue={cfg(whatsapp).waba_id ?? ""} /></label>
        <label>Permanent access token {whatsapp ? "(leave blank to keep the saved one)" : ""}<input name="access_token" type="password" autoComplete="off" required={!whatsapp} /></label>
        <button className="btn" disabled={!isAdmin} style={{ alignSelf: "flex-start" }}>Save WhatsApp</button>
      </form>
        </div>
      </details>
    </div>
  );
}
