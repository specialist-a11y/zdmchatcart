import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/zdm-billing";

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);
const who = (u: { email?: string | null; user_metadata?: any }) => u.user_metadata?.full_name || u.user_metadata?.name || (u.email ?? "Client").split("@")[0];

async function saveBusinessInfo(f: FormData) {
  "use server";
  const slug = str(f, "slug");
  const { user, business, role, viewingAsStaff } = await requireMembership(slug);
  const path = `/dashboard/${slug}/business`;
  const back = (m: string): never => redirect(`${path}?msg=${encodeURIComponent(m)}`);
  if (role !== "owner" && role !== "admin") back("Only the account owner or an admin can edit business info");
  const name = str(f, "name", 80);
  if (name.length < 2) back("Business name is needed");
  const color = str(f, "brand_color");
  const prefix = str(f, "order_prefix", 4).toUpperCase();
  const url = (k: string) => { const v = str(f, k); return v && !/^https:\/\//.test(v) ? null : v || null; };
  if (str(f, "logo_url") && !url("logo_url")) back("Logo link must start with https://");
  if (str(f, "website_url") && !/^https?:\/\//.test(str(f, "website_url"))) back("Website must start with https://");
  const publicEmail = str(f, "public_email");
  const contactEmail = str(f, "contact_email");
  for (const e of [publicEmail, contactEmail]) if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) back(`"${e}" doesn't look like an email`);
  if (!/^[A-Z]{1,4}$/.test(prefix)) back("Order code prefix: 1 to 4 letters");

  // Role checked above. The server key writes the private owner-contact fields too.
  const admin = createAdminClient();
  const { error } = await admin.from("businesses").update({
    name,
    tagline: str(f, "tagline", 120) || null,
    description: str(f, "description", 600) || null,
    logo_url: url("logo_url"),
    brand_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : business.brand_color,
    order_prefix: prefix,
    whatsapp_number: str(f, "whatsapp").replace(/\D/g, "") || null,
    public_email: publicEmail || null,
    address: str(f, "address", 400) || null,
    opening_hours: str(f, "opening_hours", 400) || null,
    delivery_info: str(f, "delivery_info", 400) || null,
    instagram: str(f, "instagram", 80) || null,
    facebook: str(f, "facebook", 120) || null,
    website_url: str(f, "website_url") || null,
    contact_name: str(f, "contact_name", 80) || null,
    contact_phone: str(f, "contact_phone").replace(/\D/g, "") || null,
    contact_email: contactEmail || null,
  }).eq("id", business.id);
  if (error) back(error.message);
  await logEvent(admin, business.id, { id: user.id, name: viewingAsStaff ? `${who(user)} (ZDMINC)` : who(user) }, "contact", "Business info updated");
  back("Saved. Your shop page shows the changes now.");
}

export default async function BusinessInfoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { business, role } = await requireMembership(slug);
  const canEdit = role === "owner" || role === "admin";
  const { data: priv } = canEdit
    ? await createAdminClient().from("businesses").select("contact_name, contact_phone, contact_email").eq("id", business.id).single()
    : { data: null };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <form action={saveBusinessInfo} className="stack" style={{ maxWidth: 900 }}>
      <input type="hidden" name="slug" value={slug} />
      <PageHeader n={num("business")} title="Business info" sub="What customers see on your shop page, and how ZDMINC reaches you."
        actions={<><Link className="btn secondary small" href={`/s/${slug}`} target="_blank">View shop</Link>{canEdit && <button className="btn blue small">Save changes</button>}</>} />
      {msg && <p className="ok">{msg}</p>}
      {!canEdit && <p className="muted">Only the account owner or an admin can edit this.</p>}

      <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <section className="card stack">
          <h2>Brand</h2>
          <div className="cols">
            <label>Business name<input name="name" required defaultValue={business.name} /></label>
            <label>Tagline<input name="tagline" maxLength={120} defaultValue={business.tagline ?? ""} placeholder="Fresh Bajan bakes, ordered on WhatsApp" /></label>
          </div>
          <label>About the business<textarea name="description" rows={3} maxLength={600} defaultValue={business.description ?? ""} placeholder="Two or three sentences for your shop page." /></label>
          <div className="cols">
            <label>Logo link (https://)<input name="logo_url" type="url" defaultValue={business.logo_url ?? ""} /></label>
            <label>Brand colour<input name="brand_color" type="color" defaultValue={business.brand_color} /></label>
            <label>Order code prefix<input name="order_prefix" required pattern="[A-Za-z]{1,4}" defaultValue={business.order_prefix} /></label>
          </div>
          <p className="muted" style={{ margin: 0 }}>Shop link: <a href={`/s/${slug}`} target="_blank">{site}/s/{slug}</a>. Ask ZDMINC if you need the link itself changed.</p>
        </section>

        <section className="card stack">
          <h2>How customers reach you</h2>
          <div className="cols">
            <label>WhatsApp number customers message (with country code)<input name="whatsapp" defaultValue={business.whatsapp_number ?? ""} placeholder="1 246 555 0123" /></label>
            <label>Public email<input name="public_email" type="email" defaultValue={business.public_email ?? ""} /></label>
          </div>
          <div className="cols">
            <label>Address or pickup point<textarea name="address" rows={3} defaultValue={business.address ?? ""} placeholder={"Queen Street\nSpeightstown, St Peter"} /></label>
            <label>Opening hours<textarea name="opening_hours" rows={3} defaultValue={business.opening_hours ?? ""} placeholder={"Tue to Fri 8am to 5pm\nSat 7am to 2pm"} /></label>
            <label>Pickup and delivery<textarea name="delivery_info" rows={3} defaultValue={business.delivery_info ?? ""} placeholder={"Pickup from the shop\nDelivery island-wide Saturdays, BBD $20"} /></label>
          </div>
        </section>

        <section className="card stack">
          <h2>Social and website</h2>
          <div className="cols">
            <label>Instagram<input name="instagram" defaultValue={business.instagram ?? ""} placeholder="@islandcrumb" /></label>
            <label>Facebook<input name="facebook" defaultValue={business.facebook ?? ""} placeholder="islandcrumbbakery" /></label>
            <label>Website<input name="website_url" type="url" defaultValue={business.website_url ?? ""} placeholder="https://" /></label>
          </div>
        </section>

        {canEdit && (
          <section className="card stack">
            <h2>Owner contact for ZDMINC</h2>
            <p className="muted" style={{ margin: 0 }}>Private. ZDMINC uses this for support replies, video alerts and invoices on WhatsApp.</p>
            <div className="cols">
              <label>Your name<input name="contact_name" defaultValue={priv?.contact_name ?? ""} /></label>
              <label>Your WhatsApp (with country code)<input name="contact_phone" defaultValue={priv?.contact_phone ?? ""} /></label>
              <label>Your email<input name="contact_email" type="email" defaultValue={priv?.contact_email ?? ""} /></label>
            </div>
          </section>
        )}
      </fieldset>
      {canEdit && <button className="btn blue" style={{ alignSelf: "flex-start" }}>Save changes</button>}
    </form>
  );
}
