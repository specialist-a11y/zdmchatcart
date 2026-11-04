import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  async function disconnectSocial() {
    "use server";
    const { business } = await requireAdmin(slug);
    const admin = createAdminClient();
    await admin.from("integration_secrets").delete().eq("business_id", business.id).eq("provider", "instagram");
    await admin.from("integrations").update({ status: "disconnected" }).eq("business_id", business.id).eq("provider", "instagram");
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
    const token = String(formData.get("access_token") ?? "").trim();
    if (!/^\d+$/.test(phoneNumberId)) redirect(`${path}?msg=Phone number ID should be digits only`);
    const admin = createAdminClient();
    await admin.from("integrations").upsert({
      business_id: business.id, provider: "whatsapp", status: "connected",
      config: { phone_number_id: phoneNumberId }, updated_at: new Date().toISOString(),
    });
    if (token) {
      await admin.from("integration_secrets").upsert({ business_id: business.id, provider: "whatsapp", secret: token, updated_at: new Date().toISOString() });
    }
    redirect(`${path}?msg=WhatsApp saved`);
  }

  const cfg = (i?: { config: any }) => (i?.config ?? {}) as Record<string, string>;

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader n={num("settings")} title="Settings" sub="Instagram and Facebook, WhatsApp, payments and Meta ads tracking." />
      {msg && <p className="ok">{msg}</p>}
      {!isAdmin && <p className="muted">Only owners and admins can change these settings.</p>}

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

      <form action={saveWhatsApp} className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 22 }}>WhatsApp Cloud API</h2>
          <span className="badge">{whatsapp?.status ?? "not connected"}</span>
        </div>
        <p className="muted">
          From your Meta app: WhatsApp, API Setup. Webhook URL: <code>{site}/api/webhooks/whatsapp</code>, subscribed to <code>messages</code>.
        </p>
        <label>Phone number ID<input name="phone_number_id" required defaultValue={cfg(whatsapp).phone_number_id ?? ""} /></label>
        <label>Permanent access token {whatsapp ? "(leave blank to keep the saved one)" : ""}<input name="access_token" type="password" autoComplete="off" required={!whatsapp} /></label>
        <button className="btn" disabled={!isAdmin} style={{ alignSelf: "flex-start" }}>Save WhatsApp</button>
      </form>
    </div>
  );
}
