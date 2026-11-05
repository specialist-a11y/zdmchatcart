/** Opening hours by day, "open now", away replies and FAQ matching. Pure, no I/O. */

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_NAME: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export type Hours = Partial<Record<Day, [string, string][]>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Keep only well-formed ranges (open before close), at most 3 a day. */
export function cleanHours(raw: unknown): Hours {
  const out: Hours = {};
  if (!raw || typeof raw !== "object") return out;
  for (const d of DAYS) {
    const list = (raw as any)[d];
    if (!Array.isArray(list)) continue;
    const ok = list.filter((r: any) => Array.isArray(r) && TIME.test(r[0]) && TIME.test(r[1]) && mins(r[0]) < mins(r[1])).slice(0, 3) as [string, string][];
    if (ok.length) out[d] = ok.map(([a, b]) => [a, b]);
  }
  return out;
}

export const hasHours = (h: Hours | null | undefined) => !!h && DAYS.some((d) => (h[d]?.length ?? 0) > 0);

/** Day and minute-of-day in a time zone. */
function wall(now: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as Day;
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export type OpenState = { open: boolean; label: string; reason: "open" | "closed" | "holiday" | "unknown" };

/** "Open now, until 5pm", "Closed, opens Tue 7am", "Closed until 2 Jan". */
export function openState(hours: Hours | null | undefined, opts: { now?: number; tz?: string; closedUntil?: string | null; closedNote?: string | null } = {}): OpenState {
  const now = opts.now ?? Date.now();
  const tz = opts.tz ?? "America/Barbados";
  const w = wall(now, tz);
  if (opts.closedUntil && w.date <= opts.closedUntil) {
    const d = new Date(`${opts.closedUntil}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const back = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return { open: false, reason: "holiday", label: `${opts.closedNote?.trim() || "Closed for a break"}. Back ${back}` };
  }
  if (!hasHours(hours)) return { open: true, reason: "unknown", label: "" };
  const today = hours![w.day] ?? [];
  const now1 = today.find(([a, b]) => w.minute >= mins(a) && w.minute < mins(b));
  if (now1) return { open: true, reason: "open", label: `Open now, until ${fmt(now1[1])}` };
  const later = today.find(([a]) => mins(a) > w.minute);
  if (later) return { open: false, reason: "closed", label: `Closed, opens ${fmt(later[0])} today` };
  const idx = DAYS.indexOf(w.day);
  for (let i = 1; i <= 7; i++) {
    const d = DAYS[(idx + i) % 7];
    const first = hours![d]?.[0];
    if (first) return { open: false, reason: "closed", label: `Closed, opens ${i === 1 ? "tomorrow" : DAY_NAME[d]} ${fmt(first[0])}` };
  }
  return { open: false, reason: "closed", label: "Closed" };
}

/** 07:00 -> 7am, 13:30 -> 1:30pm */
export function fmt(t: string) {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  const h12 = h % 12 || 12;
  return `${h12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
}

/** "Mon closed · Tue to Fri 7am to 5pm · Sat 6am to 1pm" with matching days grouped. */
export function hoursSummary(hours: Hours | null | undefined) {
  if (!hasHours(hours)) return "";
  const text = (d: Day) => (hours![d]?.length ? hours![d]!.map(([a, b]) => `${fmt(a)} to ${fmt(b)}`).join(", ") : "closed");
  const out: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && text(DAYS[j + 1]) === text(DAYS[i])) j++;
    out.push(`${DAY_NAME[DAYS[i]]}${j > i ? ` to ${DAY_NAME[DAYS[j]]}` : ""} ${text(DAYS[i])}`);
    i = j + 1;
  }
  return out.join(" · ");
}

/** Away reply: once per closed spell (we wait 12 hours before sending another). */
export function awayDue(lastAwayIso: string | null | undefined, now = Date.now()) {
  return !lastAwayIso || now - Date.parse(lastAwayIso) > 12 * 3600_000;
}

export function awayText(template: string | null | undefined, state: OpenState, shop: string) {
  const base = template?.trim() || `Thanks for your message! ${shop} is closed right now.`;
  return `${base}${state.label ? `\n${state.label}.` : ""}\nYou can still order any time: {shop_link}`;
}

export type Faq = { id: string; keywords: string[]; answer: string; active?: boolean };

/** First active FAQ whose keyword appears as a whole word or phrase. Longer keywords win. */
export function matchFaq(text: string, faqs: Faq[]): Faq | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  let best: { f: Faq; len: number } | null = null;
  for (const f of faqs) {
    if (f.active === false) continue;
    for (const k of f.keywords) {
      const kw = k.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      if (kw.length >= 2 && t.includes(` ${kw} `) && (!best || kw.length > best.len)) best = { f, len: kw.length };
    }
  }
  return best?.f ?? null;
}

export const splitKeywords = (s: string) => [...new Set(s.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2).map((k) => k.slice(0, 40)))].slice(0, 12);
