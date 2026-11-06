"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { money } from "@/lib/order-text";
import { cartKey, displayPrice, readVariants, splitKey, template, type Variant } from "@/lib/catalog";
import { cleanHours } from "@/lib/hours";
import { badgeFor, fulfilmentChip, readyText, readZones, sharedReadyDays, slotOptions, sourceOf, specialActive, theme as shopTheme, themeVars } from "@/lib/shop-front";
import { SHOP_CSS } from "./shop-css";
import { FRONT_CSS } from "./front-css";
import { addDays, MAX_DAYS, pickupOptions, prettyDate, unitLabel } from "@/lib/rental";

const WA_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" /></svg>
);
const BADGE_TEXT: Record<string, string> = { bestseller: "Bestseller", new: "New", preorder: "Pre-order", soldout: "Sold out" };

type Product = {
  id: string; name: string; description: string | null; price: number; image_url: string | null; stock: number | null;
  kind?: "product" | "service"; category?: string | null; price_note?: string | null; variants?: unknown; featured?: boolean;
  images?: string[] | null; ready_days?: string[] | null; lead_days?: number | null; pairs_with?: string | null; badge?: string | null; slug?: string | null;
  rental?: boolean | null; rental_unit?: string | null; deposit?: number | string | null; min_days?: number | null;
};
type Business = {
  name: string; slug: string; tagline: string | null; logo_url: string | null; brand_color: string; currency: string; whatsapp_number: string | null;
  description?: string | null; address?: string | null; opening_hours?: string | null; delivery_info?: string | null;
  public_email?: string | null; instagram?: string | null; facebook?: string | null; website_url?: string | null;
  meta_pixel_id?: string | null; site_template?: string | null; hero_image_url?: string | null;
  hero_headline?: string | null; hero_subheadline?: string | null; hero_text?: string | null;
  shop_theme?: string | null; special_text?: string | null; special_ends_at?: string | null; announcement?: string | null;
  delivery_zones?: unknown; pickup_enabled?: boolean | null; slot_minutes?: number | null; hours?: unknown;
  bank_transfer_enabled?: boolean | null;
  rental_agreement_url?: string | null; rental_pickup_times?: string | null; rental_lead_days?: number | null;
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

export default function ShopClient({ business, products, attribution, previewTemplate, openNow, best = [], previewTheme, basePath, initialFocus, today, cartRecovery = true }: {
  cartRecovery?: boolean;
  today?: string;
  basePath?: string;
  initialFocus?: string | null;
  openNow?: { open: boolean; label: string; reason: string } | null;
  best?: string[];
  previewTheme?: string | null;
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
  const [focus, setFocus] = useState<Product | null>(() => products.find((p) => p.id === initialFocus) ?? null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Pickup or delivery, zone, time slot and address (migration 0016).
  const zones = useMemo(() => readZones(business.delivery_zones), [business.delivery_zones]);
  const pickupOn = business.pickup_enabled !== false;
  const [mode, setMode] = useState<"pickup" | "delivery" | null>(null);
  const [zoneId, setZoneId] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [address, setAddress] = useState("");
  const [shown, setShown] = useState(0); // bumps when checkout opens, so time slots are worked out in the browser
  const [photo, setPhoto] = useState(0);
  const [activeCat, setActiveCat] = useState<string>("");
  const [payBy, setPayBy] = useState<"card" | "transfer">("card");
  // Rental mode: shoppers pick dates first, then see what's free for those dates.
  const hasRentals = products.some((p) => p.rental);
  const earliest = addDays(today ?? new Date().toISOString().slice(0, 10), Math.max(0, business.rental_lead_days ?? 0));
  const unit = products.find((p) => p.rental)?.rental_unit ?? "day";
  const [start, setStart] = useState(earliest);
  const [days, setDays] = useState(() => Math.max(1, products.find((p) => p.rental)?.min_days ?? 1));
  const [free, setFree] = useState<Record<string, number> | null>(null);
  const [dateError, setDateError] = useState("");
  const times = pickupOptions(business.rental_pickup_times);
  const [pickupTime, setPickupTime] = useState("");
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (!hasRentals) return;
    let live = true;
    setFree(null); setDateError("");
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/rentals/availability?slug=${encodeURIComponent(business.slug)}&start=${start}&days=${days}`);
        const j = await r.json();
        if (!live) return;
        if (!r.ok) { setDateError(j.error ?? "Couldn't check those dates"); return; }
        setFree(j.free);
      } catch { if (live) setDateError("Couldn't check those dates. Try again."); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [hasRentals, start, days, business.slug]);
  const th = shopTheme(previewTheme ?? business.shop_theme);
  const preview = !!(previewTemplate || previewTheme);
  // Every product has its own address (good for Google and for sharing). Opening one updates the address bar.
  const home = basePath ?? `/s/${business.slug}`;
  const productHref = (p: Product) => `${home}/p/${p.slug || p.id}`;
  const openProduct = (p: Product) => {
    setPhoto(0);
    setFocus(p);
    if (!preview && basePath !== undefined) try { window.history.pushState({ product: p.id }, "", productHref(p) + window.location.search); } catch {}
  };
  const closeProduct = () => {
    setFocus(null);
    if (!preview && basePath !== undefined && /\/p\/[^/]+$/.test(window.location.pathname)) try { window.history.pushState({}, "", (home || "/") + window.location.search); } catch {}
  };
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/\/p\/([^/]+)$/);
      setFocus(m ? products.find((p) => p.slug === m[1] || p.id === m[1]) ?? null : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [products]);
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

  // Visits and cart starts for the owner's Website results (once per browser session each).
  const trackShop = (kind: "visit" | "cart") => {
    if (preview) return;
    try {
      const k = `chatcart:t:${business.slug}:${kind}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
      const sp = new URLSearchParams(window.location.search);
      const body = JSON.stringify({ slug: business.slug, kind, source: sourceOf(document.referrer, sp.get("utm_source"), attribution), ref: attribution ?? null });
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {}
  };
  useEffect(() => { trackShop("visit"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Rentals cost the daily price times the days booked.
    if (p.rental) return variantId ? null : { p, v: null as Variant | null, name: `${p.name} · ${days} ${unitLabel(p.rental_unit, days)}`, price: Number(p.price) * days };
    return variantId ? null : { p, v: null as Variant | null, name: p.name, price: Number(p.price) };
  }
  const lines = Object.entries(cart).flatMap(([key, q]) => { const l = q > 0 ? line(key) : null; return l ? [{ key, q, ...l }] : []; });
  const count = lines.reduce((s, l) => s + l.q, 0);
  const cartHasRental = lines.some((l) => l.p.rental);
  const deposit = lines.reduce((s, l) => s + (l.p.rental ? Number(l.p.deposit ?? 0) * l.q : 0), 0);
  const total = lines.reduce((s, l) => s + l.price * l.q, 0) + deposit;
  const rentalReady = !cartHasRental || (!!free && !dateError && (!times.length || !!pickupTime) && (!business.rental_agreement_url || agreed));
  // Dates changed: keep rental items within what's free.
  useEffect(() => {
    if (!free) return;
    setCart((c) => {
      let changed = false;
      const next = { ...c };
      for (const [key, q] of Object.entries(c)) {
        const p = byId.get(splitKey(key).productId);
        if (p?.rental && q > (free[p.id] ?? 0)) { next[key] = free[p.id] ?? 0; changed = true; }
      }
      return changed ? next : c;
    });
  }, [free, byId]);
  const onRequest = lines.some((l) => l.price === 0);
  // Rentals have their own pickup date and time, so pickup or delivery is only asked for other goods.
  const hasGoods = !cartHasRental && lines.some((l) => l.p.kind !== "service");
  const zone = mode === "delivery" ? zones.find((z) => z.id === zoneId) ?? null : null;
  const fee = zone?.fee ?? 0;
  const grand = total + fee;
  const hours = useMemo(() => cleanHours(business.hours), [business.hours]);
  const slots = useMemo(() => (shown && !cartHasRental && Object.keys(hours).length ? slotOptions(hours, {
    slotMinutes: business.slot_minutes ?? 120,
    leadDays: Math.max(0, ...lines.map((l) => l.p.lead_days ?? 0)),
    readyDays: sharedReadyDays(lines.map((l) => l.p)),
  }) : []), [shown, cartHasRental, hours, business.slot_minutes, lines.map((l) => l.key).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const choices = [...(pickupOn ? ["pickup" as const] : []), ...(zones.length ? ["delivery" as const] : [])];
  useEffect(() => { if (hasGoods && choices.length === 1 && mode !== choices[0]) setMode(choices[0]); }, [hasGoods, choices.length, choices[0], mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const inCart = (productId: string) => lines.filter((l) => l.p.id === productId).reduce((s, l) => s + l.q, 0);

  function change(key: string, delta: number) {
    const l = line(key);
    if (!l) return;
    setCart((c) => {
      const others = inCart(l.p.id) - (c[key] ?? 0);
      const max = l.p.rental ? Math.max(0, (free?.[l.p.id] ?? 0) - others) : l.p.stock == null ? 99 : Math.max(0, l.p.stock - others);
      return { ...c, [key]: Math.min(max, Math.max(0, (c[key] ?? 0) + delta)) };
    });
    if (delta > 0) { track("AddToCart", { content_ids: [l.p.id], content_type: "product", content_name: l.name, value: l.price }); trackShop("cart"); }
  }
  const pickFor = (p: { id: string; opts: Variant[] }) => picks[p.id] ?? p.opts.find((v) => v.available)?.id ?? null;

  async function checkout() {
    if (cartHasRental && !free) return setError("Pick your rental dates first");
    if (cartHasRental && times.length && !pickupTime) return setError("Choose a pickup time");
    if (cartHasRental && business.rental_agreement_url && !agreed) return setError("Please accept the rental agreement");
    if (hasGoods && choices.length > 1 && !mode) return setError("Choose pickup or delivery");
    if (mode === "delivery" && zones.length && !zone) return setError("Choose your delivery area");
    if (mode === "delivery" && !address.trim()) return setError("Add the delivery address");
    if (slots.length && !slot) return setError(`Choose a ${mode === "delivery" ? "delivery" : hasGoods ? "pickup" : ""} time`.replace("  ", " "));
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
          paymentMethod: business.bank_transfer_enabled ? payBy : undefined,
          rental: cartHasRental ? { start, days, pickupTime: pickupTime || undefined, agreed } : undefined,
          attribution: ref ?? undefined,
          fbc: consent === "yes" ? fbc ?? undefined : undefined,
          fulfillment: hasGoods && mode ? mode : undefined,
          zoneId: zone?.id,
          slot: slot || undefined,
          address: mode === "delivery" && address.trim() ? address.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setCart({});
      track("InitiateCheckout", { value: grand, num_items: count, content_ids: lines.map((l) => l.p.id), content_type: "product" });
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
    const left = p.rental ? (free ? free[p.id] ?? 0 : null) : null;
    const waiting = !!p.rental && (left === null || !!dateError);
    const soldOut = p.rental ? left === 0 : p.stock === 0 || allOut;
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
          <strong className="s-price">{priceText(p, item.opts.find((v) => v.id === vid))}{p.rental ? ` / ${unitLabel(p.rental_unit)}` : ""}</strong>
          {waiting ? (
            <span className="s-out">{dateError ? "Pick dates" : "Checking..."}</span>
          ) : soldOut ? (
            <span className="s-out">{p.rental ? "Booked those dates" : p.kind === "service" ? "Unavailable" : "Sold out"}</span>
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
        {p.rental && (Number(p.deposit ?? 0) > 0 || (p.min_days ?? 1) > 1 || (left !== null && left > 0 && left <= 3)) && (
          <small className="s-rentnote">
            {[Number(p.deposit ?? 0) > 0 ? `${money(Number(p.deposit), business.currency)} refundable deposit` : null,
              (p.min_days ?? 1) > 1 ? `minimum ${p.min_days} ${unitLabel(p.rental_unit, p.min_days ?? 1)}` : null,
              left !== null && left > 0 && left <= 3 ? `${left} free on your dates` : null].filter(Boolean).join(" · ")}
          </small>
        )}
      </div>
    );
  }

  const Img = ({ p, plain }: { p: Product; plain?: boolean }) => !p.image_url
    ? <div className="s-noimg" aria-hidden="true">{p.name.slice(0, 1)}</div>
    : plain ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" />
    : <Image src={p.image_url} alt={p.name} fill sizes="(max-width: 720px) 50vw, 280px" style={{ objectFit: "cover" }} />;
  const best$ = useMemo(() => new Set(best), [best]);
  const badge = (p: Product) => {
    const item = byId.get(p.id);
    const b = badgeFor({ ...p, allOut: !!item?.opts.length && !item.opts.some((v) => v.available) }, best$);
    return b ? <span className={`s-badgechip ${b}`}>{BADGE_TEXT[b]}</span> : null;
  };
  const tap = (p: Product) => ({ onClick: () => openProduct(p) });
  /** The product name as a real link, so search engines can follow it. */
  const NameLink = ({ p }: { p: Product }) => (
    <a href={productHref(p)} className="s-plink" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openProduct(p); }}>{p.name}</a>
  );
  const special = specialActive(business.special_text, business.special_ends_at) ? business.special_text!.trim() : null;
  const chip = fulfilmentChip(zones, pickupOn, business.currency);
  const named = groups.filter(([c]) => c);
  const initials = business.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const Chips = () => (openNow || chip ? (
    <div className="s-chips">
      {openNow && <span className={`s-chip ${openNow.open ? "open" : openNow.reason === "holiday" ? "holiday" : "closed"}`} role="status"><i />{openNow.label}{!openNow.open && openNow.reason !== "holiday" ? ". Order now" : ""}</span>}
      {chip && <span className="s-chip">{chip}</span>}
    </div>
  ) : null);

  return (
    <div className={`shop t-${t.id}${th ? ` th-any th-${th.id}` : ""}`} style={{ ["--accent" as any]: business.brand_color || "#0F7C7E", ...(t.font ? { ["--display" as any]: t.font.family } : {}),
      ...(th ? (() => { const v = themeVars(th.id, business.brand_color); return { ...v, "--fg": v["--ink"], "--card": v["--surface"] } as any; })() : {}) }}>
      {t.font && !th && <link rel="stylesheet" href={t.font.url} precedence="default" />}
      {th && <link rel="stylesheet" href={th.fontUrl} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: SHOP_CSS + FRONT_CSS }} />
      {business.announcement?.trim() && <div className="s-announce" role="note">{business.announcement.trim()}</div>}

      {classicBar ? (
        <header className="s-front">
          <div className="s-cover" data-img={business.hero_image_url ? "" : undefined}
            style={business.hero_image_url ? { ["--hero" as any]: `url("${business.hero_image_url.replace(/"/g, "%22")}")` } : undefined} />
          <div className="s-wrap s-fronttext">
            <div className="s-roundlogo">{business.logo_url ? <img src={business.logo_url} alt="" /> : initials}</div>
            <h1>{business.name}</h1>
            {business.tagline && <p className="s-tag">{business.tagline}</p>}
            <Chips />
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

      {!classicBar && (openNow || chip) && <div className="s-wrap"><Chips /></div>}
      <main id="items" className="s-wrap s-main">
        {special && <div className="s-special" role="note"><b>Special:</b> {special}</div>}
        {products.length === 0 && <p className="s-empty">Nothing here yet. Check back soon.</p>}
        {hasRentals && (
          <section className="s-rentbar" aria-label="Rental dates">
            <strong>When do you need it?</strong>
            <label>Pick up<input type="date" value={start} min={earliest} max={addDays(earliest, 365)} onChange={(e) => e.target.value && setStart(e.target.value)} /></label>
            <label>How long<select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {Array.from({ length: MAX_DAYS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {unitLabel(unit, n)}</option>)}
            </select></label>
            <span aria-live="polite">{dateError ? <b className="s-err">{dateError}</b> : <>Return {prettyDate(addDays(start, days))}{free ? "" : " · checking..."}</>}</span>
          </section>
        )}
        {named.length > 1 && (
          <nav className="s-catnav" aria-label="Categories">
            <div>
              <a href="#items" className={!activeCat ? "on" : ""} onClick={() => setActiveCat("")}>All</a>
              {named.map(([c]) => <a key={c} href={`#cat-${encodeURIComponent(c)}`} className={activeCat === c ? "on" : ""} onClick={() => setActiveCat(c)}>{c}</a>)}
            </div>
          </nav>
        )}
        {groups.map(([cat, items]) => (
          <section key={cat || "_"} id={cat ? `cat-${encodeURIComponent(cat)}` : undefined} className="s-group">
            {cat && <h2 className="s-cat">{cat}</h2>}
            {t.layout === "menu" ? (
              <div className="s-menu">
                {items.map((p) => (
                  <article key={p.id} className="s-row" {...tap(p)}>
                    {p.image_url && <div className="s-thumb" style={{ position: "relative" }}><Img p={p} /></div>}
                    <div className="s-rowtext">
                      <div className="s-rowhead"><h3><NameLink p={p} /></h3><span className="s-dots" aria-hidden="true" /></div>
                      {p.description && <p>{p.description}</p>}
                      <Buy p={p} />
                    </div>
                  </article>
                ))}
              </div>
            ) : t.layout === "gallery" ? (
              <div className="s-gallery">
                {items.map((p) => (
                  <a key={p.id} href={productHref(p)} className="s-piece" onClick={(e) => { e.preventDefault(); openProduct(p); }} aria-label={`View ${p.name}`}>
                    <Img p={p} plain />
                    <span className="s-caption"><b>{p.name}</b><span>{priceText(p)}</span></span>
                    {inCart(p.id) > 0 && <span className="s-badge">✓</span>}
                  </a>
                ))}
              </div>
            ) : (
              <div className="s-grid">
                {items.map((p) => (
                  <article key={p.id} className="s-card" {...tap(p)}>
                    {badge(p)}
                    {(t.id === "classic" || th || p.image_url) && <div className="s-cardimg" style={{ position: "relative" }}><Img p={p} /></div>}
                    <div className="s-cardbody">
                      <h3><NameLink p={p} /></h3>
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

      {focus && t.layout === "gallery" && (
        <div className="s-modal" role="dialog" aria-modal="true" aria-label={focus.name} onClick={closeProduct}>
          <div className="s-modalbox" onClick={(e) => e.stopPropagation()}>
            <button className="s-close" onClick={closeProduct} aria-label="Close">✕</button>
            {focus.image_url && <img src={focus.image_url} alt={focus.name} />}
            <div className="s-modaltext">
              <h3>{focus.name}</h3>
              {focus.description && <p>{focus.description}</p>}
              <Buy p={focus} big />
            </div>
          </div>
        </div>
      )}

      {focus && t.layout !== "gallery" && (() => {
        const photos = [focus.image_url, ...(focus.images ?? [])].filter((x): x is string => !!x);
        const ready = readyText(focus);
        const pair = focus.pairs_with ? byId.get(focus.pairs_with) : undefined;
        return (
          <div className="s-sheetwrap" role="dialog" aria-modal="true" aria-label={focus.name} onClick={closeProduct}>
            <div className="s-sheet" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
              <button className="s-close2" onClick={closeProduct} aria-label="Close">✕</button>
              {photos.length > 0 && (
                <>
                  <div className="s-carousel" onScroll={(e) => { const el = e.currentTarget; setPhoto(Math.round(el.scrollLeft / el.clientWidth)); }}>
                    {photos.map((src, i) => <img key={src + i} src={src} alt={i ? `${focus.name}, photo ${i + 1}` : focus.name} loading={i ? "lazy" : "eager"} />)}
                  </div>
                  {photos.length > 1 && <div className="s-dotsrow" aria-hidden="true">{photos.map((_, i) => <i key={i} className={i === photo ? "on" : ""} />)}</div>}
                </>
              )}
              <div className="s-sheetbody">
                <div className="s-sheethead">{focus.id === initialFocus ? <h1 style={{ margin: 0, fontSize: 28, textTransform: "uppercase" }}>{focus.name}</h1> : <h3>{focus.name}</h3>}{badge(focus)}</div>
                {focus.description && <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>{focus.description}</p>}
                {ready && <span className="s-ready"><b>{ready.split(" · ")[0]}</b>{ready.includes(" · ") ? ` · ${ready.split(" · ").slice(1).join(" · ")}` : ""}</span>}
                {pair && (
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="s-small">Pairs well with</span>
                    <div className="s-pair">
                      {pair.image_url ? <img src={pair.image_url} alt="" /> : <span className="s-pairimg" />}
                      <span>{pair.name} · {priceText(pair)}</span>
                      {!pair.opts.length && pair.stock !== 0 && <button type="button" aria-label={`Add ${pair.name}`} onClick={() => change(cartKey(pair.id, null), 1)}>+</button>}
                      {pair.opts.length > 0 && <a href={productHref(pair)} aria-label={`See ${pair.name}`} onClick={(e) => { e.preventDefault(); openProduct(pair); }} style={{ fontSize: 22, fontWeight: 800, textDecoration: "none", padding: "0 8px" }}>›</a>}
                    </div>
                  </div>
                )}
                <Buy p={focus} big />
                {inCart(focus.id) > 0 && <button className="s-btn" onClick={closeProduct}>Done · {money(total, business.currency)} in your order</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {count > 0 && !open && (
        <div className="s-cart s-light">
          <div className="s-wrap s-cartbar">
            <span><small>Your {t.id === "beauty" ? "booking" : t.id === "trades" ? "quote request" : t.id === "artist" ? "enquiry" : "order"}</small><strong>{count} {count > 1 ? "items" : "item"} · {money(total, business.currency)}{onRequest ? " + quote" : ""}</strong></span>
            <button className="s-btn s-wa" onClick={() => { setOpen(true); setShown((n) => n + 1); }}>{WA_ICON}{t.cta}</button>
          </div>
        </div>
      )}

      {count > 0 && open && (
        <div className="s-sheetwrap" role="dialog" aria-modal="true" aria-label="Your order" onClick={() => setOpen(false)}>
          <div className="s-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="s-sheetbody s-co">
              <div className="s-sheethead">
                <h3>Your {t.id === "beauty" ? "booking" : t.id === "trades" ? "quote" : t.id === "artist" ? "enquiry" : "order"}</h3>
                <button className="s-btn ghost small" onClick={() => setOpen(false)}>Keep shopping</button>
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
                {deposit > 0 && <li><span>Refundable deposit</span><span /><b>{money(deposit, business.currency)}</b></li>}
                {fee > 0 && <li><span>Delivery · {zone!.name}</span><span /><b>{money(fee, business.currency)}</b></li>}
              </ul>

              {hasGoods && choices.length > 1 && (
                <div className="s-toggle" role="group" aria-label="Pickup or delivery">
                  <button type="button" aria-pressed={mode === "pickup"} onClick={() => { setMode("pickup"); setSlot(""); }}>Pickup</button>
                  <button type="button" aria-pressed={mode === "delivery"} onClick={() => { setMode("delivery"); setSlot(""); }}>Delivery{zones.length ? ` +${Math.min(...zones.map((z) => z.fee))}` : ""}</button>
                </div>
              )}
              {mode === "pickup" && business.address && (
                <span style={{ fontSize: 14, color: "var(--muted)" }}>Pickup at {business.address.split("\n").join(", ")} · <a href={`https://maps.google.com/?q=${encodeURIComponent(business.address.replace(/\n/g, ", "))}`} target="_blank" rel="noreferrer">open map</a></span>
              )}
              {mode === "delivery" && (
                <>
                  {zones.length > 0 && (
                    <label>Delivery area
                      <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                        <option value="">Choose your area</option>
                        {zones.map((z) => <option key={z.id} value={z.id}>{z.name} · {z.fee ? money(z.fee, business.currency) : "Free"}</option>)}
                      </select>
                    </label>
                  )}
                  <label>Delivery address<input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="House, street, parish" /></label>
                </>
              )}
              {slots.length > 0 && (mode || !hasGoods) && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="s-small">{mode === "delivery" ? "Delivery time" : hasGoods ? "Pickup time" : "Preferred time"}</span>
                  <div className="s-slots" role="group" aria-label="Times">
                    {slots.map((x) => <button key={x.iso} type="button" aria-pressed={slot === x.iso} onClick={() => setSlot(x.iso)}>{x.label}</button>)}
                  </div>
                </div>
              )}

              {cartHasRental && (
                <div className="stack" style={{ gap: 8 }}>
                  <span><b>Rental:</b> pick up {prettyDate(start)}, return {prettyDate(addDays(start, days))} ({days} {unitLabel(unit, days)})</span>
                  {times.length > 0 && (
                    <label>Pickup time<select value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}>
                      <option value="">Choose a time</option>{times.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select></label>
                  )}
                  {business.rental_agreement_url && (
                    <label className="s-check">
                      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 20, minHeight: 20 }} />
                      <span>I accept the <a href={business.rental_agreement_url} target="_blank" rel="noreferrer">rental agreement</a></span>
                    </label>
                  )}
                </div>
              )}
              {business.bank_transfer_enabled && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="s-small">How would you like to pay?</span>
                  <div className="s-toggle" role="group" aria-label="How to pay">
                    <button type="button" aria-pressed={payBy === "card"} onClick={() => setPayBy("card")}>Card link</button>
                    <button type="button" aria-pressed={payBy === "transfer"} onClick={() => setPayBy("transfer")}>Bank transfer</button>
                  </div>
                  {payBy === "transfer" && <span style={{ fontSize: 14, color: "var(--muted)" }}>1st Pay or any bank. We send our account details on WhatsApp, with your order code as the reference.</span>}
                </div>
              )}

              <div className="s-fields">
                <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
                <label>WhatsApp number<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="Optional" /></label>
              </div>
              {cartRecovery && (
                <label className="s-check">
                  <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ width: 20, minHeight: 20 }} />
                  Send me a WhatsApp reminder if I don&apos;t finish
                </label>
              )}
              <label className="s-check">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} style={{ width: 20, minHeight: 20 }} />
                Tell me about {business.name}&apos;s specials on WhatsApp
              </label>
              <div className="s-sheethead" style={{ fontSize: 18 }}><b>Total</b><b>{money(grand, business.currency)}{onRequest ? " + quote" : ""}</b></div>
              <ol className="s-how" aria-label="How ordering works">
                <li>Your order code is typed for you in WhatsApp. Just press send.</li>
                <li>{payBy === "transfer" && business.bank_transfer_enabled ? "We reply with our bank details. Send the transfer, then the screenshot." : `We reply with a secure card payment link${onRequest ? " once the price is confirmed" : ""}.`}</li>
                <li>Your receipt arrives on WhatsApp.</li>
              </ol>
              <button className="s-btn s-wa" style={{ minHeight: 52, fontSize: 17 }} disabled={busy || !business.whatsapp_number || !rentalReady} onClick={checkout}>
                {WA_ICON}{busy ? "Opening WhatsApp..." : cartHasRental ? "Book on WhatsApp" : "Order on WhatsApp"}
              </button>
              {!business.whatsapp_number && <p style={{ margin: 0 }}>This business has not added its WhatsApp number yet.</p>}
              {error && <p className="s-err" role="alert">{error}</p>}
            </div>
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
