"use client";
import { useState } from "react";
import { codePrefix, shopAddress } from "@/lib/signup";

/** The business details step. The shop address and order code fill in from the business name, and can be changed. */
export function SignupForm({ action, plan, defaults, site, note, error }: {
  action: (f: FormData) => void | Promise<void>;
  plan: string;
  defaults: { contact_name: string; email: string; name: string; slug: string; prefix: string; whatsapp: string };
  site: string;
  note: string;
  error?: string;
}) {
  const [name, setName] = useState(defaults.name);
  const [slug, setSlug] = useState(defaults.slug);
  const [slugTouched, setSlugTouched] = useState(!!defaults.slug);
  const [prefix, setPrefix] = useState(defaults.prefix);
  const [prefixTouched, setPrefixTouched] = useState(!!defaults.prefix);

  return (
    <form action={action} className="card stack" style={{ maxWidth: 620 }}>
      <h2>Your business</h2>
      <input type="hidden" name="plan" value={plan} />
      <label>Your name<input name="contact_name" required defaultValue={defaults.contact_name} autoComplete="name" /></label>
      <label>Email
        <input name="email" type="email" required defaultValue={defaults.email} autoComplete="email" inputMode="email" autoCapitalize="none" />
        <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>Invoices and account updates go here. You log in with the email you signed up with.</span>
      </label>
      <label>Business name
        <input name="name" required placeholder="Island Crumb Bakery" value={name} onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(shopAddress(e.target.value));
          if (!prefixTouched) setPrefix(codePrefix(e.target.value));
        }} />
      </label>
      <label>Shop address
        <input name="slug" required placeholder="island-crumb-bakery" value={slug} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => { setSlugTouched(true); setSlug(shopAddress(e.target.value) + (/[\s-]$/.test(e.target.value) ? "-" : "")); }}
          onBlur={() => setSlug((s) => shopAddress(s))} />
        <span className="muted" style={{ fontSize: 13, fontWeight: 400, wordBreak: "break-all" }}>Your shop will be at {site}/s/<b>{slug || "your-shop"}</b>. Spaces become dashes.</span>
      </label>
      <label>Order code prefix (1 to 4 letters)
        <input name="prefix" required maxLength={4} placeholder="IC" value={prefix}
          onChange={(e) => { setPrefixTouched(true); setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)); }} />
        <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>Orders will look like {prefix || "IC"}-1048.</span>
      </label>
      <label>WhatsApp number for orders (with country code)<input name="whatsapp" required inputMode="tel" placeholder="1 246 555 1234" defaultValue={defaults.whatsapp} autoComplete="tel" /></label>
      <p className="muted" style={{ margin: 0 }}>{note}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn blue" style={{ alignSelf: "flex-start" }}>Create my account</button>
    </form>
  );
}
