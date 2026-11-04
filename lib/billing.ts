/**
 * Plan change maths. Pure functions so they can be tested without a database.
 * Dates are ISO "YYYY-MM-DD" strings in the business's local calendar.
 */

export type PlanLite = { id: string; name: string; monthly_price: number; rank: number };
export type Direction = "upgrade" | "downgrade" | "same";
export type Timing = "now" | "renewal";

const DAY = 86_400_000;
const toUtc = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`bad date ${iso}`);
  return Date.parse(`${iso}T00:00:00Z`);
};
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function direction(from: PlanLite, to: PlanLite): Direction {
  if (from.id === to.id) return "same";
  if (to.rank !== from.rank) return to.rank > from.rank ? "upgrade" : "downgrade";
  return to.monthly_price >= from.monthly_price ? "upgrade" : "downgrade";
}

/** Days left in the period, counting today, never below 0 or above the period length. */
export function daysLeft(periodStart: string, periodEnd: string, today: string) {
  const total = Math.max(1, Math.round((toUtc(periodEnd) - toUtc(periodStart)) / DAY));
  const left = Math.round((toUtc(periodEnd) - toUtc(today)) / DAY);
  return { total, left: Math.min(Math.max(left, 0), total) };
}

/**
 * Money owed (+) or credited (-) for switching plans today, for the unused part of the period.
 * Upgrade of BBD 650 -> 1450 with 29 of 31 days left: +748.39.
 */
export function proration(fromPrice: number, toPrice: number, periodStart: string, periodEnd: string, today: string) {
  const { total, left } = daysLeft(periodStart, periodEnd, today);
  return round2(((toPrice - fromPrice) * left) / total);
}

/** Default timing: upgrades start now, downgrades wait for renewal so nobody loses what they paid for. */
export function defaultTiming(dir: Direction): Timing {
  return dir === "downgrade" ? "renewal" : "now";
}

export type ChangePlanPreview = {
  direction: Direction;
  timing: Timing;
  chargeNow: number; // > 0 means send a Fygaro link now
  creditNow: number; // > 0 means take this off the next invoice
  nextInvoice: number; // price of the plan on the next renewal, after credit
  effectiveOn: string;
};

export function previewChange(opts: {
  from: PlanLite;
  to: PlanLite;
  timing?: Timing;
  periodStart: string;
  periodEnd: string;
  today: string;
  existingCredit?: number;
}): ChangePlanPreview {
  const dir = direction(opts.from, opts.to);
  const timing = opts.timing ?? defaultTiming(dir);
  const credit0 = opts.existingCredit ?? 0;
  if (dir === "same") {
    return { direction: dir, timing, chargeNow: 0, creditNow: 0, nextInvoice: Math.max(0, round2(opts.from.monthly_price - credit0)), effectiveOn: opts.today };
  }
  if (timing === "renewal") {
    return { direction: dir, timing, chargeNow: 0, creditNow: 0, nextInvoice: Math.max(0, round2(opts.to.monthly_price - credit0)), effectiveOn: opts.periodEnd };
  }
  const p = proration(opts.from.monthly_price, opts.to.monthly_price, opts.periodStart, opts.periodEnd, opts.today);
  const chargeNow = p > 0 ? p : 0;
  const creditNow = p < 0 ? -p : 0;
  return {
    direction: dir,
    timing,
    chargeNow,
    creditNow,
    nextInvoice: Math.max(0, round2(opts.to.monthly_price - credit0 - creditNow)),
    effectiveOn: opts.today,
  };
}

/** Add whole months, clamping to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number) {
  const d = new Date(toUtc(iso));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Which reminder (if any) an unpaid invoice is due today: day 3 and day 7 after the due date. */
export function reminderDue(dueDate: string, today: string, remindersSent: number): 1 | 2 | null {
  const late = Math.round((toUtc(today) - toUtc(dueDate)) / DAY);
  if (late >= 7 && remindersSent < 2) return 2;
  if (late >= 3 && remindersSent < 1) return 1;
  return null;
}

export function todayIn(timeZone = "America/Barbados", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Contact allowance. Each plan includes a number of contacts (customers in the CRM);
 * above that the client pays per started block, e.g. 1,000 included, BBD 50 per extra 1,000:
 * 1,000 -> 0, 1,001 -> 1 block (50), 2,400 -> 2 blocks (100).
 */
export function contactOverage(count: number, included: number, blockSize: number, blockPrice: number) {
  const over = Math.max(0, count - Math.max(0, included));
  const blocks = blockSize > 0 ? Math.ceil(over / blockSize) : 0;
  return { over, blocks, amount: round2(blocks * Math.max(0, blockPrice)) };
}

/** Ad results: Return = sales from the ad's orders divided by spend. Null when there's nothing to divide. */
export function adResults(spend: number, sales: number, orders: number) {
  return {
    roas: spend > 0 ? Math.round((sales / spend) * 10) / 10 : null,
    costPerOrder: orders > 0 ? round2(spend / orders) : null,
  };
}

/** Most a campaign can spend: daily budget times days in the run (inclusive). Null when open-ended. */
export function maxSpend(dailyBudget: number, startsOn: string | null, endsOn: string | null) {
  if (!startsOn || !endsOn) return null;
  const days = Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1;
  return days > 0 ? round2(dailyBudget * days) : null;
}
