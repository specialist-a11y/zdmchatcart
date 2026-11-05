/** ZDMINC support hours and reply promise. Barbados time (UTC-4, no daylight saving). Pure, no I/O. */

export const SUPPORT_HOURS = { open: 9, close: 17, days: [1, 2, 3, 4, 5], replyHours: 4, label: "Monday to Friday, 9am to 5pm" };
const OFFSET = -4 * 3600_000;
const HOUR = 3600_000;

/** Barbados wall-clock parts for a moment. */
function local(ms: number) {
  const d = new Date(ms + OFFSET);
  return { day: d.getUTCDay(), hour: d.getUTCHours() + d.getUTCMinutes() / 60, midnight: ms - ((ms + OFFSET) % 86_400_000 + 86_400_000) % 86_400_000 };
}

export function teamOnline(now = Date.now()) {
  const l = local(now);
  return SUPPORT_HOURS.days.includes(l.day) && l.hour >= SUPPORT_HOURS.open && l.hour < SUPPORT_HOURS.close;
}

/** When the team is next online (now if open). */
export function nextOpen(now = Date.now()) {
  if (teamOnline(now)) return now;
  let l = local(now);
  let t = l.midnight + SUPPORT_HOURS.open * HOUR;
  if (t <= now) t += 86_400_000;
  for (let i = 0; i < 8 && !SUPPORT_HOURS.days.includes(local(t).day); i++) t += 86_400_000;
  return t;
}

/** Add business hours to a start time, skipping nights and weekends. */
export function addBusinessHours(start: number, hours: number) {
  let t = nextOpen(start);
  let left = hours * HOUR;
  for (let guard = 0; guard < 30 && left > 0; guard++) {
    const l = local(t);
    const closeAt = l.midnight + SUPPORT_HOURS.close * HOUR;
    const room = closeAt - t;
    if (left <= room) return t + left;
    left -= room;
    t = nextOpen(closeAt);
  }
  return t;
}

/** Reply expected by, for a request still with ZDMINC. */
export function replyBy(lastClientMessageAt: string, now = Date.now()) {
  return addBusinessHours(Math.min(Date.parse(lastClientMessageAt), now), SUPPORT_HOURS.replyHours);
}

/** "today 2pm", "Mon 10am" in Barbados time. */
export function whenLabel(ms: number, now = Date.now()) {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Barbados", ...o }).format(new Date(ms));
  const sameDay = fmt({ year: "numeric", month: "numeric", day: "numeric" }) === new Intl.DateTimeFormat("en-US", { timeZone: "America/Barbados", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(now));
  const time = fmt({ hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  return sameDay ? `today ${time}` : `${fmt({ weekday: "short" })} ${time}`;
}
