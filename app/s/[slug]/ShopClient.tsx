"use client";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/order-text";
import { cartKey, displayPrice, readVariants, splitKey, template, type Variant } from "@/lib/catalog";
import { SHOP_CSS } from "./shop-css";

type Product = {
  id: string; name: string; description: string | null; price: number; image_url: string | null; stock: number | null;
  kind?: "product" | "service"; category?: string | null; price_note?: string | null; variants?: unknown; featured?: boolean;
};
type Business = {
  name: string; slug: string; tagline: string | null; logo_url: string | null; brand_color: string; currency: string; whatsapp_number: string | null;
  description?: string | null; address?: string | null; opening_hours?: string | null; delivery_info?: string | null;
  public_email?: string | null; instagram?: string | null; facebook?: string | null; website_url?: string | null;
  meta_pixel_id?: string | null; site_template?: string | null; hero_image_url?: string | null;
  hero_headline?: string | null; hero_subheadline?: string | null; hero_text?: string | null;
};

declare global { interface Window { fbq?: (...args: any[]) => void; _fbq?: unknown } }

/** Meta's standard Pixel loader, run only after the visitor accepts. */
function loadPixel(id: string) {
  if (window.fbq) return;
  const q: any = function (...args: any[]) { q.callMethod ? q.callMethod(...args) : q.queue.push(args); };
  q.push = q; q.loaded = true; q.version = "2.0"; q.queue = [];
  window.fbq = q; window._fbq = q;
  const s = document.createElement("script");
  s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  q("init", id);
  q("track", "PageView");
}

const handle = (s: string) => s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//, "").replace(/\/$/, "");

export default function ShopClient({ business, products, attribution, previewTemplate, openNow }: {
  openNow?: { open: boolean; label: string; reason: string } | null;
  business: Business;
  products: Product[];
  attribution: string | null;
  previewTemplate?: string | null;
}) {
  const t = template(previewTemplate ?? business.site_template);
  const storageKey = `chatcart:${business.slug}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Ads tracking: only with a Pixel set up, and only after the visitor says yes.
  const pixel = business.meta_pixel_id && /^\d{8,20}$/.test(business.meta_pixel_id) ? business.meta_pixel_id : null;
  const [consent, setConsent] = useState<"unknown" | "yes" | "no">("unknown");
  const [fbc, setFbc] = useState<string | null>(null);
  useEffect(() => {
    try {
      const c = localStorage.getItem("chatcart:consent");
      if (c === "yes" || c === "no") setConsent(c);
      // fbclid on an ad click becomes Meta's "fbc" id, kept 90 days, sent with the order for the purchase event.
      const key = `${storageKey}:fbc`;
      const click = new URLSearchParams(window.location.search).get("fbclid");
      if (click && /^[\w-]{10,250}$/.test(click)) {
        const v = `fb.1.${Date.now()}.${click}`;
        localStorage.setItem(key, JSON.stringify({ v, at: Date.now() }));
        setFbc(v);
      } else {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null");
        if (saved?.v && Date.now() - saved.at < 90 * 864e5) setFbc(saved.v);
      }
    } catch {}
  }, [storageKey]);
  useEffect(() => { if (pixel && consent === "yes") loadPixel(pixel); }, [pixel, consent]);
  const choose = (c: "yes" | "no") => { setConsent(c); try { localStorage.setItem("chatcart:consent", c); } catch {} };
  const track = (event: string, data: Record<string, unknown>) => { if (pixel && consent === "yes") window.fbq?.("track", event, { currency: business.currency, ...data }); };

  // Remember which ad or post brought the shopper for 7 days, so a later visit still counts for it.
  const [ref, setRef] = useState<string | null>(attribution);
  useEffect(() => {
    const key = `${storageKey}:ref`;
    try {
      if (attribution) localStorage.setItem(key, JSON.stringify({ ref: attribution, at: Date.now() }));
      else {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null");
        if (saved?.ref && Date.now() - saved.at < 7 * 864e5) setRef(String(saved.ref));
      }
    } catch {}
  }, [attribution, storageKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch {}
  }, [cart, storageKey]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, { ...p, opts: readVariants(p.variants) }])), [products]);

  /** A cart line's product, option, name and unit price, or null if it no longer exists. */
  function line(key: string) {
    const { productId, variantId } = splitKey(key);
    const p = byId.get(productId);
    if (!p) return null;
    if (p.opts.length) {
      const v = p.opts.find((x) => x.id === variantId && x.available);
      return v ? { p, v, name: `${p.name} (${v.name})`, price: v.price } : null;
    }
    return variantId ? null : { p, v: null as Variant | null, name: p.name, price: Number(p.price) };
  }
  const lines = Object.entries(cart).flatMap(([key, q]) => { const l = q > 0 ? line(key) : null; return l ? [{ key, q, ...l }] : []; });
  const count = lines.reduce((s, l) => s + l.q, 0);
  const total = lines.reduce((s, l) => s + l.price * l.q, 0);
  const onRequest = lines.some((l) => l.price === 0);
  const inCart = (productId: string) => lines.filter((l) => l.p.id === productId).reduce((s, l) => s + l.q, 0);

  function change(key: string, delta: number) {
    const l = line(key);
    if (!l) return;
    setCart((c) => {
      const others = inCart(l.p.id) - (c[key] ?? 0);
      const max = l.p.stock == null ? 99 : Math.max(0, l.p.stock - others);
      return { ...c, [key]: Math.min(max, Math.max(0, (c[key] ?? 0) + delta)) };
    });
    if (delta > 0) track("AddToCart", { content_ids: [l.p.id], content_type: "product", content_name: l.name, value: l.price });
  }
  const pickFor = (p: { id: string; opts: Variant[] }) => picks[p.id] ?? p.opts.find((v) => v.available)?.id ?? null;

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: business.slug,
          items: lines.map((l) => ({ productId: l.p.id, ...(l.v ? { variantId: l.v.id } : {}), quantity: l.q })),
          name: name || undefined,
          phone: phone || undefined,
          optIn,
          marketing,
          attribution: ref ?? undefined,
          fbc: consent === "yes" ? fbc ?? undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setCart({});
      track("InitiateCheckout", { value: total, num_items: count, content_ids: lines.map((l) => l.p.id), content_type: "product" });
      window.location.href = json.whatsappUrl;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const priceText = (p: Product, v?: Variant | null) => {
    const { amount, from } = v ? { amount: v.price, from: false } : displayPrice(p);
    if (amount === 0) return t.id === "trades" ? "Price on quote" : "Price on request";
    return `${from ? "From " : ""}${money(amount, business.currency)}${p.price_note ? ` ${p.price_note}` : ""}`;
  };

  // Group by category (in the order they first appear); items without one go first.
  // Featured items go first: their own "Featured" group when the shop uses categories.
  const groups = useMemo(() => {
    const featured = products.filter((p) => p.featured);
    const usesCategories = products.some((p) => p.category?.trim());
    const rest = usesCategories ? products.filter((p) => !p.featured) : [...featured, ...products.filter((p) => !p.featured)];
    const m = new Map<string, Product[]>();
    if (usesCategories && featured.length) m.set("Featured", featured);
    for (const p of rest) { const c = p.category?.trim() || ""; m.set(c, [...(m.get(c) ?? []), p]); }
    return [...m.entries()];
  }, [products]);

  const headline = business.hero_headline?.trim() || null;
  const subheadline = business.hero_subheadline?.trim() || business.tagline || null;
  const heroText = business.hero_text?.trim() || null;
  // Classic keeps its slim bar unless a hero section has been written for it.
  const classicBar = t.id === "classic" && !headline && !business.hero_subheadline && !heroText;
  const hero = business.hero_image_url || (t.id === "classic" ? null : products.find((p) => p.image_url)?.image_url) || null;
  const wa = business.whatsapp_number ? `https://wa.me/${business.whatsapp_number.replace(/\D/g, "")}` : null;
  const services = products.length > 0 && products.every((p) => p.kind === "service");
  const heroCta = { classic: "Shop now", caterer: "See the menu", artist: "View the work", beauty: services ? "See services" : "Book now", trades: "See services" }[t.id];

  /** Option chips + add / quantity controls for one item. */
  function Buy({ p, big }: { p: Product; big?: boolean }) {
    const item = byId.get(p.id)!;
    const vid = item.opts.length ? pickFor(item) : null;
    const key = cartKey(p.id, vid);
    const q = cart[key] ?? 0;
    const allOut = item.opts.length > 0 && !item.opts.some((v) => v.available);
    const soldOut = p.stock === 0 || allOut;
    return (
      <div className="s-buy">
        {item.opts.length > 0 && (
          <div className="s-opts" role="radiogroup" aria-label={`${p.name} options`}>
            {item.opts.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={v.id === vid} disabled={!v.available}
                onClick={(e) => { e.stopPropagation(); setPicks((s) => ({ ...s, [p.id]: v.id })); }}>
                {v.name}{v.price > 0 && item.opts.some((o) => o.price !== v.price) ? <small> · {money(v.price, business.currency).replace("BBD ", "")}</small> : null}
              </button>
            ))}
          </div>
        )}
        <div className="s-buyrow">
          <strong className="s-price">{priceText(p, item.opts.find((v) => v.id === vid))}</strong>
          {soldOut ? (
            <span className="s-out">{p.kind === "service" ? "Unavailable" : "Sold out"}</span>
          ) : q === 0 ? (
            <button className={`s-add${big ? " big" : ""}`} onClick={(e) => { e.stopPropagation(); change(key, 1); }}>{t.add}</button>
          ) : (
            <div className="s-qty" onClick={(e) => e.stopPropagation()}>
              <button aria-label={`Remove one ${p.name}`} onClick={() => change(key, -1)}>−</button>
              <span aria-live="polite">{q}</span>
              <button aria-label={`Add one ${p.name}`} onClick={() => change(key, 1)}>+</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const Img = ({ p }: { p: Product }) => p.image_url
    ? <img src={p.image_url} alt={p.name} loading="lazy" />
    : <div className="s-noimg" aria-hidden="true">{p.name.slice(0, 1)}</div>;

  return (
    <div className={`shop t-${t.id}`} style={{ ["--accent" as any]: business.brand_color || "#0F7C7E", ...(t.font ? { ["--display" as any]: t.font.family } : {}) }}>
      {t.font && <link rel="stylesheet" href={t.font.url} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: SHOP_CSS }} />

      {classicBar ? (
        <header className="s-bar">
          <div className="s-wrap s-brand">
            {business.logo_url && <img src={business.logo_url} alt="" width={56} height={56} />}
            <div><h1>{business.name}</h1>{business.tagline && <p>{business.tagline}</p>}</div>
          </div>
        </header>
      ) : (
        <header className="s-hero" style={hero ? { ["--hero" as any]: `url("${hero.replace(/"/g, "%22")}")` } : undefined} data-has-image={hero ? "" : undefined}>
          <div className="s-wrap s-herotext">
            {business.logo_url && <img className="s-logo" src={business.logo_url} alt="" width={64} height={64} />}
            {headline && <span className="s-eyebrow">{business.name}</span>}
            <h1>{headline ?? business.name}</h1>
            {subheadline && <p className="s-sub">{subheadline}</p>}
            {heroText && <p className="s-herop">{heroText}</p>}
            <div className="s-herocta">
              <a className="s-btn" href="#items">{heroCta}</a>
              {t.id === "trades" && wa && <a className="s-btn ghost" href={wa} target="_blank" rel="noreferrer">WhatsApp us</a>}
            </div>
            {t.id === "trades" && (business.address || business.opening_hours) && (
              <ul className="s-trust">
                {business.address && <li>Serving {business.address.split("\n")[0]}</li>}
                {business.opening_hours && <li>{business.opening_hours.split("\n")[0]}</li>}
                {wa && <li>Quotes on WhatsApp</li>}
              </ul>
            )}
          </div>
        </header>
      )}

      {openNow && (
        <div className="s-wrap" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, fontWeight: 700, fontSize: 14,
            background: openNow.open ? "#e6f7ee" : openNow.reason === "holiday" ? "#fff3e0" : "#f1f2f2", color: openNow.open ? "#146c43" : openNow.reason === "holiday" ? "#8a4b00" : "#4a5c5b" }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: openNow.open ? "#2bb673" : openNow.reason === "holiday" ? "#e0a23b" : "#9aa7a2" }} />
            {openNow.label}{!openNow.open && openNow.reason !== "holiday" ? ". You can still order now." : ""}
          </div>
        </div>
      )}
      <main id="items" className="s-wrap s-main">
        {products.length === 0 && <p className="s-empty">Nothing here yet. Check back soon.</p>}
        {groups.map(([cat, items]) => (
          <section key={cat || "_"} className="s-group">
            {cat && <h2 className="s-cat">{cat}</h2>}
            {t.layout === "menu" ? (
              <div className="s-menu">
                {items.map((p) => (
                  <article key={p.id} className="s-row">
                    {p.image_url && <div className="s-thumb"><Img p={p} /></div>}
                    <div className="s-rowtext">
                      <div className="s-rowhead"><h3>{p.name}</h3><span className="s-dots" aria-hidden="true" /></div>
                      {p.description && <p>{p.description}</p>}
                      <Buy p={p} />
                    </div>
                  </article>
                ))}
              </div>
            ) : t.layout === "gallery" ? (
              <div className="s-gallery">
                {items.map((p) => (
                  <button key={p.id} type="button" className="s-piece" onClick={() => setFocus(p)} aria-label={`View ${p.name}`}>
                    <Img p={p} />
                    <span className="s-caption"><b>{p.name}</b><span>{priceText(p)}</span></span>
                    {inCart(p.id) > 0 && <span className="s-badge">✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="s-grid">
                {items.map((p) => (
                  <article key={p.id} className="s-card">
                    {(t.id === "classic" || p.image_url) && <div className="s-cardimg"><Img p={p} /></div>}
                    <div className="s-cardbody">
                      <h3>{p.name}</h3>
                      {p.description && <p>{p.description}</p>}
                      <Buy p={p} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}

        {(business.description || business.address || business.opening_hours || business.delivery_info) && (
          <section className="s-about" aria-label={`About ${business.name}`}>
            {business.description && <p className="s-desc">{business.description}</p>}
            <div className="s-facts">
              {business.opening_hours && <div><strong>{t.id === "beauty" ? "Opening hours" : "Hours"}</strong><p>{business.opening_hours}</p></div>}
              {business.address && <div><strong>{t.id === "trades" ? "Areas we cover" : "Find us"}</strong><p>{business.address}</p></div>}
              {business.delivery_info && <div><strong>{t.id === "caterer" ? "Pickup, delivery and events" : "Pickup and delivery"}</strong><p>{business.delivery_info}</p></div>}
            </div>
            <div className="s-links">
              {business.instagram && <a href={`https://instagram.com/${handle(business.instagram)}`} target="_blank" rel="noreferrer">Instagram</a>}
              {business.facebook && <a href={`https://facebook.com/${handle(business.facebook)}`} target="_blank" rel="noreferrer">Facebook</a>}
              {business.website_url && /^https?:\/\//.test(business.website_url) && <a href={business.website_url} target="_blank" rel="noreferrer">Website</a>}
              {business.public_email && <a href={`mailto:${business.public_email}`}>{business.public_email}</a>}
            </div>
          </section>
        )}
      </main>

      {focus && (
        <div className="s-modal" role="dialog" aria-modal="true" aria-label={focus.name} onClick={() => setFocus(null)}>
          <div className="s-modalbox" onClick={(e) => e.stopPropagation()}>
            <button className="s-close" onClick={() => setFocus(null)} aria-label="Close">✕</button>
            {focus.image_url && <img src={focus.image_url} alt={focus.name} />}
            <div className="s-modaltext">
              <h3>{focus.name}</h3>
              {focus.description && <p>{focus.description}</p>}
              <Buy p={focus} big />
            </div>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="s-cart">
          <div className="s-wrap">
            {!open ? (
              <div className="s-cartbar">
                <span><strong>{count} {count > 1 ? "items" : "item"}</strong> · {money(total, business.currency)}{onRequest ? " + quote" : ""}</span>
                <button className="s-btn" onClick={() => setOpen(true)}>{t.cta}</button>
              </div>
            ) : (
              <div className="s-checkout">
                <div className="s-cartbar">
                  <strong>Your {t.id === "beauty" ? "booking" : t.id === "trades" ? "quote request" : t.id === "artist" ? "enquiry" : "order"}</strong>
                  <button className="s-btn ghost small" onClick={() => setOpen(false)}>Back</button>
                </div>
                <ul className="s-lines">
                  {lines.map((l) => (
                    <li key={l.key}>
                      <span>{l.name}</span>
                      <span className="s-qty small">
                        <button aria-label={`Remove one ${l.name}`} onClick={() => change(l.key, -1)}>−</button>
                        <span>{l.q}</span>
                        <button aria-label={`Add one ${l.name}`} onClick={() => change(l.key, 1)}>+</button>
                      </span>
                      <b>{l.price ? money(l.price * l.q, business.currency) : "On request"}</b>
                    </li>
                  ))}
                  <li className="s-total"><span>Total</span><span /><b>{money(total, business.currency)}{onRequest ? " + quote" : ""}</b></li>
                </ul>
                <div className="s-fields">
                  <label>Name (optional)<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
                  <label>WhatsApp number (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
                </div>
                <label className="s-check">
                  <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                  Save my cart and send me a WhatsApp reminder if I don&apos;t finish
                </label>
                <label className="s-check">
                  <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                  Send me {business.name}&apos;s offers, and show me its ads
                </label>
                <button className="s-btn" disabled={busy || !business.whatsapp_number} onClick={checkout}>
                  {busy ? "Opening WhatsApp..." : `Send on WhatsApp`}
                </button>
                {!business.whatsapp_number && <p style={{ margin: 0 }}>This business has not added its WhatsApp number yet.</p>}
                {error && <p className="s-err">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      {pixel && consent === "unknown" && (
        <div role="dialog" aria-label="Cookies" className="s-consent" style={{ bottom: count > 0 ? 96 : 16 }}>
          <span>{business.name} uses Meta cookies to measure its ads and show you relevant offers on Instagram and Facebook. Is that OK?</span>
          <div className="row"><button className="btn small" onClick={() => choose("yes")}>That's fine</button><button className="btn small secondary" onClick={() => choose("no")}>No thanks</button></div>
        </div>
      )}
    </div>
  );
}
