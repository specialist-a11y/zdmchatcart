/**
 * Ordering inside a WhatsApp chat ("I would like to rent the projector"): pure helpers for reading what the
 * customer wrote. The conversation itself lives in lib/wa-booking.ts.
 */

/** "I would like to rent…", "can I book…", "I want to hire…", "rent the 14ft screen", "how do I book". */
export function wantsToOrder(text: string) {
  const t = text.toLowerCase();
  return /\b(i'?d|i would|i'?m|i am|we'?d|we would|i|we)\s+(like|love|want|wanna|need|looking|hoping)\s+(to\s+)?(rent|book|reserve|hire|order)\b/.test(t)
    || /\b(can|could|may)\s+(i|we)\s+(rent|book|reserve|hire|order)\b/.test(t)
    || /\bhow\s+(do|can)\s+(i|we)\s+(rent|book|reserve|hire|order)\b/.test(t)
    || /^\s*(rent|book|reserve|hire|order)\s+(a|an|the|your|my|some|\d)\b/.test(t);
}

export const isYes = (t: string) => /^\s*(y|yes|yeah|yep|yup|ok|okay|sure|confirm|confirmed|book it|go ahead|agree|i agree|accept|i accept|correct|that'?s right)\b/i.test(t);
export const isNo = (t: string) => /^\s*(n|no|nope|not now|cancel|stop booking|never ?mind|nevermind)\b/i.test(t);
export const isCancel = (t: string) => /^\s*(cancel|stop booking|never ?mind|nevermind|start over|restart)\b/i.test(t);

const STOP = new Set(["i", "id", "would", "like", "love", "want", "wanna", "need", "to", "rent", "book", "reserve", "hire", "order",
  "the", "a", "an", "and", "with", "for", "my", "me", "please", "pls", "of", "on", "in", "at", "can", "could", "get", "some",
  "your", "you", "we", "our", "is", "it", "this", "that", "x", "inch", "ft", "adults", "adult", "hi", "hello", "good", "morning",
  "afternoon", "evening", "movie", "night", "set", "setup"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
  .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));

/**
 * Which products a message names. A word found in only one product picks it; a word shared by several
 * picks the one whose main noun it is (then the shortest name), unless one is already picked or it is a tie.
 */
export function matchProducts<T extends { id: string; name: string }>(text: string, products: T[]): T[] {
  const said = new Set(words(text));
  // The main noun of a name is its last word before "with", "and" or a bracket: "4K Projector with WiFi" -> projector.
  const key = (name: string) => words(name.split(/\s+(?:with|and)\s+|\(/i)[0]).at(-1);
  const names = products.map((p) => ({ p, w: new Set(words(p.name)), k: key(p.name) }));
  const picked = new Set<string>();
  const shared: string[] = [];
  for (const w of said) {
    const hits = names.filter((n) => n.w.has(w));
    if (hits.length === 1) picked.add(hits[0].p.id);
    else if (hits.length > 1) shared.push(w);
  }
  for (const w of shared) {
    let hits = names.filter((n) => n.w.has(w));
    if (hits.some((h) => picked.has(h.p.id))) continue;
    if (hits.some((h) => h.k === w)) hits = hits.filter((h) => h.k === w);
    const min = Math.min(...hits.map((h) => h.w.size));
    const best = hits.filter((h) => h.w.size === min);
    if (best.length === 1) picked.add(best[0].p.id);
  }
  return products.filter((p) => picked.has(p.id));
}

/** "1", "1, 3", "2 and 4" -> list positions (1-based), only within 1..max. */
export function pickNumbers(text: string, max: number): number[] {
  if (!/^[\s\d,&+and.]+$/i.test(text)) return [];
  const out: number[] = [];
  for (const m of text.matchAll(/\d+/g)) { const n = Number(m[0]); if (n >= 1 && n <= max && !out.includes(n)) out.push(n); }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};

/** A date from a chat message: "19 Dec", "Dec 19th", "19/12", "2026-12-19", "tomorrow", "Saturday". Past dates roll to next year. */
export function parseDate(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const [ty, tm, td] = today.split("-").map(Number);
  const roll = (m: number, d: number, y?: number) => {
    if (y) return iso(y < 100 ? 2000 + y : y, m, d);
    const s = iso(ty, m, d);
    return s && s < today ? iso(ty + 1, m, d) : s;
  };
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?\b/);
  if (m && MONTHS.includes(m[2])) return roll(MONTHS.indexOf(m[2]), +m[1], m[3] ? +m[3] : undefined);
  m = t.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (m && MONTHS.includes(m[1])) return roll(MONTHS.indexOf(m[1]), +m[2], m[3] ? +m[3] : undefined);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m) return roll(+m[2] - 1, +m[1], m[3] ? +m[3] : undefined); // day/month, as written in Barbados
  const add = (n: number) => new Date(Date.UTC(ty, tm - 1, td + n)).toISOString().slice(0, 10);
  if (/\btomorrow\b/.test(t)) return add(1);
  if (/\btoday\b/.test(t)) return today;
  m = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (m) {
    const now = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
    let n = (DAYS.indexOf(m[1]) - now + 7) % 7;
    if (n === 0 || /\bnext\b/.test(t)) n += 7;
    return add(n);
  }
  return null;
}
