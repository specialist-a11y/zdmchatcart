/**
 * Rental mode: products rented by the day or night, booked for dates, with a set number of units owned.
 * Pure functions (no server imports) so they can be tested and used in the shop page.
 * Dates are ISO "YYYY-MM-DD" in the shop's local calendar. A booking runs from start (pickup) to end (return), end exclusive:
 * pick up Sat 14, 2 days, return Mon 16; the units are free again on the 16th (plus any buffer days for cleaning).
 */

export type RentalUnit = "day" | "night";
export type RentalProduct = {
  id: string; name: string; price: number | string; stock: number | null; active: boolean;
  rental?: boolean | null; rental_unit?: RentalUnit | string | null; deposit?: number | string | null; min_days?: number | null;
};
export type Booking = { product_id: string | null; quantity: number; start: string; end: string };

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
export const MAX_DAYS = 30;

export function unitLabel(unit: string | null | undefined, n = 1) {
  const u = unit === "night" ? "night" : "day";
  return n === 1 ? u : `${u}s`;
}

/** "Sat 14 Nov" */
export function prettyDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** One line for WhatsApp messages and the order page. */
export function rentalLine(o: { rental_start?: string | null; rental_end?: string | null; rental_days?: number | null; pickup_time?: string | null }, unit: string = "day") {
  if (!o.rental_start || !o.rental_end) return null;
  const n = o.rental_days ?? daysBetween(o.rental_start, o.rental_end);
  return `Rental: pick up ${prettyDate(o.rental_start)}${o.pickup_time ? ` at ${o.pickup_time}` : ""}, return ${prettyDate(o.rental_end)} (${n} ${unitLabel(unit, n)})`;
}

/** Check the dates a shopper picked. */
export function validateDates(start: string, days: number, today: string, leadDays = 0): string | null {
  if (!ISO.test(start) || Number.isNaN(ms(start))) return "Pick your rental date.";
  if (!Number.isInteger(days) || days < 1) return "Pick how many days you need it.";
  if (days > MAX_DAYS) return `Rentals are up to ${MAX_DAYS} days. Message us for longer.`;
  const earliest = addDays(today, Math.max(0, leadDays));
  if (start < earliest) return leadDays > 0 ? `Please book at least ${leadDays} day${leadDays > 1 ? "s" : ""} ahead. The earliest date is ${prettyDate(earliest)}.` : "That date has passed.";
  if (start > addDays(today, 365)) return "We take bookings up to a year ahead.";
  return null;
}

/**
 * Units of each product free for every day from start to end (end exclusive).
 * Each existing booking also blocks `bufferDays` after its return, for cleaning and checks.
 */
export function availability(products: { id: string; stock: number | null }[], bookings: Booking[], start: string, end: string, bufferDays = 0): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products) {
    const owned = p.stock ?? 1;
    let peak = 0;
    for (let d = start; d < end; d = addDays(d, 1)) {
      let used = 0;
      for (const b of bookings) {
        if (b.product_id !== p.id) continue;
        const bEnd = addDays(b.end, Math.max(0, bufferDays));
        if (b.start <= d && d < bEnd) used += b.quantity;
      }
      peak = Math.max(peak, used);
    }
    out[p.id] = Math.max(0, owned - peak);
  }
  return out;
}

/** Packages: package id -> the rental items it is made of (one level, no packages inside packages). */
export type Kits = Record<string, { id: string; qty: number }[]>;
const UUID = /^[0-9a-f-]{36}$/i;

/** A package's item list as saved: valid ids, 1 to 20 of each, no repeats, not itself, at most 20 lines. */
export function cleanIncludes(raw: unknown, selfId?: string | null): { id: string; qty: number }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { id: string; qty: number }[] = [];
  for (const r of raw) {
    const id = String((r as any)?.id ?? "");
    const qty = Math.floor(Number((r as any)?.qty ?? 1));
    if (!UUID.test(id) || id === selfId || seen.has(id) || !(qty >= 1)) continue;
    seen.add(id);
    out.push({ id, qty: Math.min(20, qty) });
  }
  return out.slice(0, 20);
}

export function kitsFrom(products: { id: string; includes?: unknown }[]): Kits {
  const ids = new Set(products.map((p) => p.id));
  const kits: Kits = {};
  for (const p of products) {
    // Only items that are themselves rentals of this shop, and not packages (keeps it one level deep).
    const list = cleanIncludes(p.includes, p.id).filter((c) => ids.has(c.id));
    if (list.length) kits[p.id] = list;
  }
  for (const id of Object.keys(kits)) kits[id] = kits[id].filter((c) => !kits[c.id]);
  return kits;
}

/** A booked package also holds the items inside it. */
export function expandKits(bookings: Booking[], kits: Kits): Booking[] {
  const extra: Booking[] = [];
  for (const b of bookings) for (const c of (b.product_id && kits[b.product_id]) || []) extra.push({ ...b, product_id: c.id, quantity: b.quantity * c.qty });
  return extra.length ? bookings.concat(extra) : bookings;
}

/** A package is only free when every item inside it is free too. */
export function kitFree(free: Record<string, number>, kits: Kits): Record<string, number> {
  const out = { ...free };
  for (const [id, list] of Object.entries(kits)) {
    if (!(id in out)) continue;
    for (const c of list) if (c.id in free) out[id] = Math.min(out[id], Math.floor(free[c.id] / c.qty));
  }
  return out;
}

/** Products booked beyond what the business owns on any day from start to end (used to catch two bookings at the same moment). */
export function overbooked(products: { id: string; stock: number | null }[], bookings: Booking[], start: string, end: string, bufferDays = 0): string[] {
  return products.filter((p) => {
    const owned = p.stock ?? 1;
    for (let d = start; d < end; d = addDays(d, 1)) {
      let used = 0;
      for (const b of bookings) if (b.product_id === p.id && b.start <= d && d < addDays(b.end, Math.max(0, bufferDays))) used += b.quantity;
      if (used > owned) return true;
    }
    return false;
  }).map((p) => p.id);
}

export type PricedLine = { product_id: string | null; name: string; unit_price: number; quantity: number };

/**
 * Price a cart that has rental items: each rental line costs price x days.
 * The deposit is one per booking: the highest deposit of the rental items in the cart, added as its own line.
 * Packages (kits) also need every item inside them free, counting the same items booked on their own in this cart.
 * Ordinary products in the same cart are priced as usual (stock limits still apply to them).
 */
export function priceRentalCart(
  requested: { productId: string; quantity: number }[],
  catalog: RentalProduct[],
  days: number,
  free: Record<string, number>,
  kits: Kits = {},
): { items: PricedLine[]; subtotal: number; deposit: number; unit: RentalUnit } | { error: string } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const merged = new Map<string, number>();
  for (const r of requested) merged.set(r.productId, (merged.get(r.productId) ?? 0) + r.quantity);
  const items: PricedLine[] = [];
  let cents = 0, depositCents = 0;
  let unit: RentalUnit = "day";
  for (const [id, qty] of merged) {
    const p = byId.get(id);
    if (!p || !p.active) return { error: "Something in your cart is no longer available." };
    const priceCents = Math.round(Number(p.price) * 100);
    if (p.rental) {
      if (p.rental_unit === "night") unit = "night";
      const min = Math.max(1, p.min_days ?? 1);
      if (days < min) return { error: `${p.name} is rented for at least ${min} ${unitLabel(p.rental_unit, min)}.` };
      const left = free[id] ?? 0;
      if (qty > left) return { error: left === 0 ? `${p.name} is already booked on those dates. Try other dates.` : `Only ${left} ${p.name} free on those dates.` };
      cents += priceCents * days * qty;
      depositCents = Math.max(depositCents, Math.round(Number(p.deposit ?? 0) * 100));
      items.push({ product_id: p.id, name: `${p.name} · ${days} ${unitLabel(p.rental_unit, days)}`, unit_price: (priceCents * days) / 100, quantity: qty });
    } else {
      if (p.stock !== null && qty > p.stock) return { error: `Only ${p.stock} left of ${p.name}.` };
      cents += priceCents * qty;
      items.push({ product_id: p.id, name: p.name, unit_price: priceCents / 100, quantity: qty });
    }
  }
  if (!items.length) return { error: "Your cart is empty." };
  // The same item wanted on its own and inside a package (or in two packages): all of it must be free.
  const want = new Map<string, number>();
  for (const [id, qty] of merged) {
    if (!byId.get(id)?.rental) continue;
    want.set(id, (want.get(id) ?? 0) + qty);
    for (const c of kits[id] ?? []) want.set(c.id, (want.get(c.id) ?? 0) + qty * c.qty);
  }
  for (const [id, n] of want) {
    if (id in free && n > free[id]) {
      const name = byId.get(id)?.name;
      return { error: name ? `Not enough ${name} free on those dates for everything in your cart. Try other dates or remove an item.` : "Some of the equipment in your cart is already booked on those dates. Try other dates or remove an item." };
    }
  }
  if (depositCents > 0) items.push({ product_id: null, name: "Refundable deposit", unit_price: depositCents / 100, quantity: 1 });
  return { items, subtotal: (cents + depositCents) / 100, deposit: depositCents / 100, unit };
}

/** Orders that hold rental units: anything paid or being paid, and unpaid orders for the first `holdHours`. */
export const HOLDING = ["paid", "ready", "fulfilled", "transfer_pending"];
export const PENDING = ["awaiting_confirmation", "awaiting_payment"];
export function holdsUnits(status: string, createdAt: string, now = Date.now(), holdHours = 24) {
  if (HOLDING.includes(status)) return true;
  return PENDING.includes(status) && now - Date.parse(createdAt) < holdHours * 3_600_000;
}

/** "9:00 AM, 12 noon, 4:00 PM" -> list for the pickup time picker. */
export function pickupOptions(raw: string | null | undefined) {
  return (raw ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

/** Rental schedule: what goes out and comes back each day. */
export function schedule<T extends { rental_start: string; rental_end: string }>(orders: T[], from: string, days: number) {
  const out: { date: string; pickups: T[]; returns: T[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const pickups = orders.filter((o) => o.rental_start === date);
    const returns = orders.filter((o) => o.rental_end === date);
    if (pickups.length || returns.length) out.push({ date, pickups, returns });
  }
  return out;
}

/** Order summary text plus the rental dates line, when the order is a rental. */
export function withRental(summary: string, o: { rental_start?: string | null; rental_end?: string | null; rental_days?: number | null; pickup_time?: string | null; rental_unit?: string | null; deposit?: number | string | null }) {
  const line = rentalLine(o, o.rental_unit ?? "day");
  if (!line) return summary;
  const dep = Number(o.deposit ?? 0) > 0 ? "\nThe deposit is refunded when everything comes back in good condition." : "";
  return `${summary}\n${line}${dep}`;
}
