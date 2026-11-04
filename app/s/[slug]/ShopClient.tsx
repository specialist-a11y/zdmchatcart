"use client";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/order-text";

type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; stock: number | null };
type Business = {
  name: string; slug: string; tagline: string | null; logo_url: string | null; brand_color: string; currency: string; whatsapp_number: string | null;
  description?: string | null; address?: string | null; opening_hours?: string | null; delivery_info?: string | null;
  public_email?: string | null; instagram?: string | null; facebook?: string | null; website_url?: string | null;
  meta_pixel_id?: string | null;
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

export default function ShopClient({ business, products, attribution }: {
  business: Business;
  products: Product[];
  attribution: string | null;
}) {
  const storageKey = `chatcart:${business.slug}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
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

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id));
  const count = lines.reduce((s, [, q]) => s + q, 0);
  const total = lines.reduce((s, [id, q]) => s + Number(byId.get(id)!.price) * q, 0);

  function change(id: string, delta: number) {
    setCart((c) => {
      const p = byId.get(id);
      const max = p?.stock ?? 99;
      const next = Math.min(max, Math.max(0, (c[id] ?? 0) + delta));
      return { ...c, [id]: next };
    });
    const p = byId.get(id);
    if (delta > 0 && p) track("AddToCart", { content_ids: [id], content_type: "product", content_name: p.name, value: Number(p.price) });
  }

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: business.slug,
          items: lines.map(([productId, quantity]) => ({ productId, quantity })),
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
      track("InitiateCheckout", { value: total, num_items: count, content_ids: lines.map(([id]) => id), content_type: "product" });
      window.location.href = json.whatsappUrl;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const accent = business.brand_color;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: accent, color: "#fff" }}>
        <div className="container row" style={{ gap: 16 }}>
          {business.logo_url && <img src={business.logo_url} alt="" width={56} height={56} style={{ borderRadius: 14, objectFit: "cover", background: "#fff" }} />}
          <div>
            <h1 style={{ fontSize: 30 }}>{business.name}</h1>
            {business.tagline && <p style={{ margin: "4px 0 0", opacity: 0.92 }}>{business.tagline}</p>}
          </div>
        </div>
      </header>

      <main className="container" style={{ flex: 1 }}>
        {products.length === 0 ? (
          <p className="muted">No products yet. Check back soon.</p>
        ) : (
          <div className="grid">
            {products.map((p) => {
              const q = cart[p.id] ?? 0;
              const soldOut = p.stock === 0;
              return (
                <article key={p.id} className="card product-card stack" style={{ gap: 10 }}>
                  {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div style={{ aspectRatio: "4 / 3", background: "var(--sand)", borderRadius: 10 }} aria-hidden="true" />}
                  <h2 style={{ fontSize: 20 }}>{p.name}</h2>
                  {p.description && <p className="muted" style={{ margin: 0 }}>{p.description}</p>}
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{money(p.price, business.currency)}</strong>
                    {soldOut ? (
                      <span className="badge cancelled">Sold out</span>
                    ) : q === 0 ? (
                      <button className="btn small" style={{ background: accent, borderColor: accent }} onClick={() => change(p.id, 1)}>Add</button>
                    ) : (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn small secondary" aria-label={`Remove one ${p.name}`} onClick={() => change(p.id, -1)}>-</button>
                        <span aria-live="polite" style={{ minWidth: 20, textAlign: "center" }}>{q}</span>
                        <button className="btn small secondary" aria-label={`Add one ${p.name}`} onClick={() => change(p.id, 1)}>+</button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {(business.description || business.address || business.opening_hours || business.delivery_info) && (
          <section className="card stack" style={{ marginTop: 24 }} aria-label={`About ${business.name}`}>
            {business.description && <p style={{ margin: 0 }}>{business.description}</p>}
            <div className="cols">
              {business.opening_hours && <div><strong>Opening hours</strong><p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{business.opening_hours}</p></div>}
              {business.address && <div><strong>Find us</strong><p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{business.address}</p></div>}
              {business.delivery_info && <div><strong>Pickup and delivery</strong><p className="muted" style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{business.delivery_info}</p></div>}
            </div>
            <div className="row">
              {business.instagram && <a href={`https://instagram.com/${handle(business.instagram)}`} target="_blank" rel="noreferrer">Instagram</a>}
              {business.facebook && <a href={`https://facebook.com/${handle(business.facebook)}`} target="_blank" rel="noreferrer">Facebook</a>}
              {business.website_url && /^https?:\/\//.test(business.website_url) && <a href={business.website_url} target="_blank" rel="noreferrer">Website</a>}
              {business.public_email && <a href={`mailto:${business.public_email}`}>{business.public_email}</a>}
            </div>
          </section>
        )}
      </main>

      {count > 0 && (
        <div className="cart-bar">
          <div className="container">
            {!open ? (
              <>
                <span><strong>{count} item{count > 1 ? "s" : ""}</strong> · {money(total, business.currency)}</span>
                <button className="btn coral" onClick={() => setOpen(true)}>Order on WhatsApp</button>
              </>
            ) : (
              <div className="stack" style={{ width: "100%", gap: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Your order · {money(total, business.currency)}</strong>
                  <button className="btn small secondary" onClick={() => setOpen(false)}>Back</button>
                </div>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <label style={{ color: "#fff", flex: "1 1 180px" }}>Name (optional)<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
                  <label style={{ color: "#fff", flex: "1 1 180px" }}>WhatsApp number (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
                </div>
                <label style={{ color: "#fff", flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                  Save my cart and send me a WhatsApp reminder if I don&apos;t finish
                </label>
                <label style={{ color: "#fff", flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                  Send me {business.name}&apos;s offers, and show me its ads
                </label>
                <button className="btn coral" disabled={busy || !business.whatsapp_number} onClick={checkout}>
                  {busy ? "Opening WhatsApp..." : "Send order on WhatsApp"}
                </button>
                {!business.whatsapp_number && <p style={{ margin: 0 }}>This shop has not added its WhatsApp number yet.</p>}
                {error && <p style={{ margin: 0, color: "#ffd2c7", fontWeight: 600 }}>{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      {pixel && consent === "unknown" && (
        <div role="dialog" aria-label="Cookies" style={{ position: "fixed", left: 16, right: 16, bottom: count > 0 ? 96 : 16, zIndex: 20, maxWidth: 560, margin: "0 auto", background: "#fff", color: "var(--ink)", border: "1.5px solid var(--line)", borderRadius: 16, padding: 16, boxShadow: "0 12px 30px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", gap: 10 }}>
          <span>{business.name} uses Meta cookies to measure its ads and show you relevant offers on Instagram and Facebook. Is that OK?</span>
          <div className="row"><button className="btn small" onClick={() => choose("yes")}>That's fine</button><button className="btn small secondary" onClick={() => choose("no")}>No thanks</button></div>
        </div>
      )}
    </div>
  );
}
