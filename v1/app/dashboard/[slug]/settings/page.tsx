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
  const path = `/dashboard/${slug}/settings`;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  async function saveProfile(formData: FormData) {
    "use server";
    const { supabase, business } = await requireAdmin(slug);
    await supabase.from("businesses").update({
      name: String(formData.get("name") ?? "").trim() || business.name,
      tagline: String(formData.get("tagline") ?? "").trim() || null,
      whatsapp_number: String(formData.get("whatsapp") ?? "").replace(/\D/g, "") || null,
      brand_color: /^#[0-9a-fA-F]{6}$/.test(String(formData.get("brand_color"))) ? String(formData.get("brand_color")) : business.brand_color,
      logo_url: String(formData.get("logo_url") ?? "").trim() || null,
    }).eq("id", business.id);
    redirect(`${path}?msg=Profile saved`);
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
      <h1>Settings</h1>
      {msg && <p className="ok">{msg}</p>}
      {!isAdmin && <p className="muted">Only owners and admins can change these settings.</p>}

      <form action={saveProfile} className="card stack">
        <h2 style={{ fontSize: 22 }}>Shop profile</h2>
        <p className="muted">Shop link: <a href={`/s/${slug}`} target="_blank">{site}/s/{slug}</a></p>
        <label>Business name<input name="name" defaultValue={business.name} /></label>
        <label>Tagline<input name="tagline" defaultValue={business.tagline ?? ""} /></label>
        <label>WhatsApp number customers message (with country code)<input name="whatsapp" defaultValue={business.whatsapp_number ?? ""} /></label>
        <label>Brand colour<input name="brand_color" type="color" defaultValue={business.brand_color} /></label>
        <label>Logo URL<input name="logo_url" type="url" defaultValue={business.logo_url ?? ""} /></label>
        <button className="btn" disabled={!isAdmin} style={{ alignSelf: "flex-start" }}>Save profile</button>
      </form>

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
