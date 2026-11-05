/** Month calendar helpers. Pure, no I/O. Dates are plain YYYY-MM-DD strings. */

export function parseMonth(m: string | undefined, today: string) {
  const ok = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  return { year: Number(ok.slice(0, 4)), month: Number(ok.slice(5, 7)), key: ok };
}

export function shiftMonth(key: string, by: number) {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Weeks (Monday first) covering the month; days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** UTC range for a month in Barbados time (UTC-4). */
export function monthRange(key: string) {
  const start = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 4)).toISOString();
  const end = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1, 4)).toISOString();
  return { start, end };
}

/** Barbados date for a timestamp. */
export const bbDate = (iso: string) => new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(0, 10);
