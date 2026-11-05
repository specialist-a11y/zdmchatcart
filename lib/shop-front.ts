/** Shop front rules: themes, delivery zones, pickup and delivery slots, badges and visit sources. Pure, no I/O. */
import { DAYS, type Day, type Hours } from "./hours.ts";

// Themes ----------------------------------------------------------------------------------------
export type ThemeId = "warm" | "fresh" | "bold" | "minimal";
export const THEMES: { id: ThemeId; name: string; blurb: string; font: string; fontUrl: string; special: string }[] = [
  { id: "warm", name: "Warm bakery", blurb: "Cream background, rich browns, friendly headings.", font: "'Fraunces', Georgia, serif", fontUrl: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&display=swap", special: "#E0662B" },
  { id: "fresh", name: "Fresh market", blurb: "Light and green-tinted, clean rounded type.", font: "'Nunito', system-ui, sans-serif", fontUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap", special: "#D4A11A" },
  { id: "bold", name: "Island bold", blurb: "Big condensed headings and bright colour blocks.", font: "'Barlow Condensed', system-ui, sans-serif", fontUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&display=swap", special: "#E8503A" },
  { id: "minimal", name: "Clean minimal", blurb: "White space, black type, your colour as the accent.", font: "'DM Sans', system-ui, sans-serif", fontUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;800&display=swap", special: "#1D5FD1" },
];
export const theme = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? null;

const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0F7C7E");
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(hex(c).slice(i, i + 2), 16));
const toHex = (n: number[]) => `#${n.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
/** Mix a colour with white (amount > 0) or black (amount < 0). */
export function mix(c: string, amount: number) {
  const [r, g, b] = rgb(c);
  const t = amount >= 0 ? 255 : 0, a = Math.abs(amount);
  return toHex([r + (t - r) * a, g + (t - g) * a, b + (t - b) * a]);
}
/** Readable text colour on a background. */
export function onColor(c: string) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#0B0F0E" : "#FFFFFF";
}

/** CSS variables for a theme, built from the business's brand colour. */
export function themeVars(id: string | null | undefined, brand: string): Record<string, string> {
  const t = theme(id);
  if (!t) return {};
  const c = hex(brand);
  const base = { "--accent": c, "--on-accent": onColor(c), "--special": t.special, "--display": t.font };
  switch (t.id) {
    case "warm": return { ...base, "--bg": "#FFF8EF", "--surface": "#FFFFFF", "--ink": mix(c, -0.55), "--tint": mix(c, 0.88), "--radius": "18px" };
    case "fresh": return { ...base, "--bg": mix(c, 0.94), "--surface": "#FFFFFF", "--ink": "#13241B", "--tint": mix(c, 0.85), "--radius": "16px" };
    case "bold": return { ...base, "--bg": "#FFFFFF", "--surface": mix(c, 0.92), "--ink": "#0B0F0E", "--tint": mix(c, 0.8), "--radius": "6px" };
    case "minimal": return { ...base, "--bg": "#FFFFFF", "--surface": "#FFFFFF", "--ink": "#0B0F0E", "--tint": "#F3F4F4", "--radius": "10px" };
  }
}

// Delivery zones --------------------------------------------------------------------------------
export type Zone = { id: string; name: string; fee: number };
export function readZones(raw: unknown): Zone[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((z: any, i) => {
    const name = String(z?.name ?? "").trim().slice(0, 60);
    const fee = Math.round(Number(z?.fee) * 100) / 100;
    if (!name || !Number.isFinite(fee) || fee < 0 || fee > 10000) return [];
    return [{ id: /^[a-z0-9]{1,12}$/i.test(String(z?.id ?? "")) ? String(z.id) : `z${i + 1}`, name, fee }];
  }).slice(0, 10);
}

/** "Pickup · Delivery from BBD 10" for the shop's chip. */
export function fulfilmentChip(zones: Zone[], pickup: boolean, currency = "BBD") {
  const parts: string[] = [];
  if (pickup) parts.push("Pickup");
  if (zones.length) {
    const min = Math.min(...zones.map((z) => z.fee));
    parts.push(min === 0 ? "Free delivery" : `Delivery from ${currency} ${min % 1 ? min.toFixed(2) : min}`);
  }
  return parts.join(" · ");
}

// Slots -------------------------------------------------------------------------------------------
const OFFSET = 4 * 3600_000; // Barbados is UTC-4 all year
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export type Slot = { iso: string; day: string; label: string };

/**
 * Pickup or delivery times for the next few open days, from the opening hours.
 * Respects lead time (whole days from today) and the days every item in the cart is made.
 */
export function slotOptions(hours: Hours, opts: { now?: number; slotMinutes?: number; days?: number; leadDays?: number; readyDays?: Day[] | null; max?: number } = {}): Slot[] {
  const now = opts.now ?? Date.now();
  const step = opts.slotMinutes ?? 120;
  const out: Slot[] = [];
  const localToday = new Date(now - OFFSET);
  const midnight = Date.UTC(localToday.getUTCFullYear(), localToday.getUTCMonth(), localToday.getUTCDate()) + OFFSET;
  for (let d = opts.leadDays ?? 0; d < (opts.leadDays ?? 0) + (opts.days ?? 7) && out.length < (opts.max ?? 12); d++) {
    const dayStart = midnight + d * 864e5;
    const wd = DAYS[(new Date(dayStart - OFFSET).getUTCDay() + 6) % 7];
    if (opts.readyDays?.length && !opts.readyDays.includes(wd)) continue;
    for (const [a, b] of hours[wd] ?? []) {
      for (let m = mins(a); m + Math.min(step, 60) <= mins(b); m += step) {
        const at = dayStart + m * 60_000;
        if (at < now + 60 * 60_000) continue; // at least an hour's notice
        const local = new Date(at - OFFSET);
        const h = local.getUTCHours(), mm = local.getUTCMinutes();
        const time = `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
        const dayLabel = d === 0 ? "Today" : d === 1 ? "Tomorrow" : local.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
        out.push({ iso: new Date(at).toISOString(), day: dayLabel, label: `${dayLabel} ${time}` });
        if (out.length >= (opts.max ?? 12)) break;
      }
    }
  }
  return out;
}

/** Ready days every item shares (empty = any day). */
export function sharedReadyDays(items: { ready_days?: string[] | null }[]): Day[] | null {
  let set: Day[] | null = null;
  for (const it of items) {
    const days = (it.ready_days ?? []).filter((d): d is Day => (DAYS as readonly string[]).includes(d));
    if (!days.length) continue;
    set = set ? set.filter((d) => days.includes(d)) : days;
  }
  return set;
}

// Badges and sources ------------------------------------------------------------------------------
export type Badge = "bestseller" | "new" | "preorder" | "soldout" | null;
export function badgeFor(p: { id: string; badge?: string | null; stock?: number | null; lead_days?: number | null; ready_days?: string[] | null; allOut?: boolean }, best: Set<string>): Badge {
  if (p.stock === 0 || p.allOut) return "soldout";
  if (p.badge === "none") return null;
  if (p.badge === "bestseller" || p.badge === "new" || p.badge === "preorder") return p.badge;
  if ((p.lead_days ?? 0) > 0 || (p.ready_days?.length ?? 0) > 0) return "preorder";
  return best.has(p.id) ? "bestseller" : null;
}
const DAY_LONG: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export function readyText(p: { ready_days?: string[] | null; lead_days?: number | null }) {
  const days = (p.ready_days ?? []).map((d) => DAY_LONG[d]).filter(Boolean);
  const lead = p.lead_days ?? 0;
  if (!days.length && !lead) return "";
  return [days.length ? `Ready ${days.join(", ")}` : "", lead ? `order ${lead} day${lead === 1 ? "" : "s"} ahead` : ""].filter(Boolean).join(" · ");
}

/** Top sellers by paid quantity. */
export function bestsellers(items: { product_id: string | null; quantity: number }[], top = 3) {
  const m = new Map<string, number>();
  for (const i of items) if (i.product_id) m.set(i.product_id, (m.get(i.product_id) ?? 0) + i.quantity);
  return new Set([...m.entries()].filter(([, q]) => q >= 2).sort((a, b) => b[1] - a[1]).slice(0, top).map(([id]) => id));
}

/** Where a visitor came from, from the referrer and utm_source. */
export function sourceOf(referrer: string | null | undefined, utm?: string | null, ref?: string | null) {
  const s = `${utm ?? ""} ${referrer ?? ""}`.toLowerCase();
  if (/instagram|\big\b|l\.instagram/.test(s)) return "instagram";
  if (/facebook|fb\.|\bfb\b|m\.facebook/.test(s)) return "facebook";
  if (/whatsapp|wa\.me/.test(s)) return "whatsapp";
  if (/google/.test(s)) return "google";
  if (ref) return "link";
  return referrer ? "other" : "direct";
}

export const specialActive = (text: string | null | undefined, endsAt: string | null | undefined, now = Date.now()) =>
  !!text?.trim() && (!endsAt || Date.parse(endsAt) > now);

// Website page: shop score and results --------------------------------------------------------------
export type ScoreItem = { key: string; label: string; done: boolean; todo: string; href: string };
/** Shop score: the details that sell, each a one-minute job. */
export function shopScore(s: {
  logo: boolean; colour: boolean; domain: boolean; products: number; withPhotos: number; hours: boolean; about: boolean; special: boolean; base: string;
}) {
  const items: ScoreItem[] = [
    { key: "logo", label: "Logo and colours", done: s.logo && s.colour, todo: "Add your logo and brand colour", href: `${s.base}/business` },
    { key: "products", label: s.products ? `${s.products} products on the shop` : "Products on the shop", done: s.products >= 3, todo: s.products ? `Add ${3 - s.products} more product${3 - s.products === 1 ? "" : "s"}` : "Add your first 3 products", href: `${s.base}/products` },
    { key: "photos", label: "A photo on every product", done: s.products > 0 && s.withPhotos >= s.products, todo: s.products - s.withPhotos > 0 ? `Add photos to ${s.products - s.withPhotos} product${s.products - s.withPhotos === 1 ? "" : "s"}` : "Add product photos", href: `${s.base}/products` },
    { key: "hours", label: "Opening hours", done: s.hours, todo: "Set your opening hours", href: `${s.base}/business#hours` },
    { key: "about", label: "About your business", done: s.about, todo: "Write two lines about your business", href: `${s.base}/business` },
    { key: "special", label: "Specials strip", done: s.special, todo: "Add this week's special", href: `${s.base}/website#front` },
    { key: "domain", label: "Own domain", done: s.domain, todo: "Connect your own domain", href: `${s.base}/website#domain` },
  ];
  return { pct: Math.round((items.filter((i) => i.done).length / items.length) * 100), items };
}

/** Percent change, or null when there's nothing to compare with. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
