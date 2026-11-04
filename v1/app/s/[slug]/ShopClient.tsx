"use client";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/order-text";

type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; stock: number | null };
type Business = { name: string; slug: string; tagline: string | null; logo_url: string | null; brand_color: string; currency: string; whatsapp_number: string | null };

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          attribution: attribution ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setCart({});
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
    </div>
  );
}
