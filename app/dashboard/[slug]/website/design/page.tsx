import Link from "next/link";
import { PageHeader } from "@/components/CrmShell";
import { num } from "@/lib/crm-nav";
import { requireMembership } from "@/lib/business";
import { DESIGN_BUDGET, DESIGN_FEATURES, DESIGN_PAGES, DESIGN_STYLES, DESIGN_TIMING } from "@/lib/design-brief";
import { requestDesign } from "../design-actions";

/** For clients who'd rather have ZDMINC design their website: a few questions, a concept image, then a quote. */
export default async function DesignRequestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { slug } = await params;
  const { msg } = await searchParams;
  const { business } = await requireMembership(slug);
  const about = [business.tagline, business.description].filter(Boolean).join(". ").slice(0, 600);
  const primary = /^#[0-9a-f]{6}$/i.test(business.brand_color ?? "") ? business.brand_color : "#3D8BFF";
  const check = (name: string, values: readonly string[], on: string[]) => (
    <div className="design-checks">
      {values.map((v) => (
        <label key={v} className="row"><input type="checkbox" name={name} value={v} defaultChecked={on.includes(v)} />{v}</label>
      ))}
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader n={num("website")} title="A website designed for you" sub="Prefer a custom website instead of the ChatCart shop page? Answer a few questions. We draw a first concept straight away and ZDMINC sends you a quote." />
      {msg && <p className="error">{msg}</p>}
      <p style={{ margin: 0 }}><Link href={`/dashboard/${slug}/website`}>Back to Website</Link></p>

      <form action={requestDesign} className="card stack">
        <input type="hidden" name="slug" value={slug} />
        <label>Business name<input name="business" defaultValue={business.name} maxLength={80} /></label>
        <label>What does your business do?<textarea name="about" rows={3} required minLength={10} maxLength={600} defaultValue={about} placeholder="Outdoor movie night rentals in Barbados: projectors, giant screens and popcorn machines." /></label>
        <label>Who are your customers?<input name="customers" maxLength={300} placeholder="Families, birthday parties, schools and churches" /></label>

        <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Which style feels like you?</legend>
          <div className="design-styles">
            {Object.entries(DESIGN_STYLES).map(([k, s], i) => (
              <label key={k} className="design-style" style={{ background: s.bg, color: s.text, borderRadius: Math.min(s.radius, 14) }}>
                <input type="radio" name="style" value={k} defaultChecked={i === 0} />
                <b>{s.label}</b>
                <span style={{ color: s.muted }}>Aa · Book now</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid">
          <label>Main colour<input type="color" name="primary" defaultValue={primary} style={{ height: 48, padding: 4 }} /></label>
          <label>Second colour<input type="color" name="accent" defaultValue="#FECA57" style={{ height: 48, padding: 4 }} /></label>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Pages you need</legend>
          {check("pages", DESIGN_PAGES, ["Home", "About", "Gallery", "Contact"])}
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Must-haves</legend>
          {check("features", DESIGN_FEATURES, ["WhatsApp chat button"])}
        </fieldset>

        <label>Websites you like (optional)<textarea name="examples" rows={2} maxLength={500} placeholder="Paste links, and what you like about them" /></label>
        <div className="grid">
          <label>Do you have a domain name?<select name="domain" defaultValue="Not sure"><option>I have one</option><option>I need one</option><option>Not sure</option></select></label>
          <label>When do you need it?<select name="timing" defaultValue="Within a month">{DESIGN_TIMING.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Budget<select name="budget" defaultValue="Not sure yet">{DESIGN_BUDGET.map((t) => <option key={t}>{t}</option>)}</select></label>
        </div>
        <label>Anything else? (optional)<textarea name="notes" rows={3} maxLength={1500} placeholder="Things to include, things to avoid, photos you'll send" /></label>

        <p className="muted" style={{ margin: 0, fontSize: 14 }}>We use your logo, photos and colours to draw a first concept of your homepage. It arrives with your request in Help and support, and ZDMINC replies there with a quote.</p>
        <button className="btn blue" style={{ alignSelf: "flex-start" }}>Send my request</button>
      </form>
    </div>
  );
}
