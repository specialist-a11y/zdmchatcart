/** The Barbados day to report on: today in the evening, yesterday when run in the morning (the daily cron runs at 8am). */
export function summaryWindow(now = Date.now()) {
  const local = new Date(now - 4 * 3600_000);
  const morning = local.getUTCHours() < 17;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (morning ? 1 : 0)));
  const start = day.getTime() + 4 * 3600_000;
  return { start: new Date(start).toISOString(), end: new Date(start + 864e5).toISOString(), date: day.toISOString().slice(0, 10), label: (morning ? "Yesterday" : "Today") as "Today" | "Yesterday" };
}
