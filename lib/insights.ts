/** "Zero guesswork" tips from real orders. Pure, so it can be tested. */

export type OrderLite = {
  id: string; status: string; source: string; total: number | string; created_at: string; paid_at: string | null;
  order_items?: { product_id: string | null; name: string; quantity: number; unit_price: number | string }[];
};
type Tip = { title: string; detail: string };
const PAID = ["paid", "ready", "fulfilled"];
const DAY = 864e5;

export function insights(orders: OrderLite[], products: { id: string; name: string; active: boolean; created_at: string }[], now = Date.now(), timeZone = "America/Barbados"): { scale: Tip; kill: Tip; timing: Tip } {
  const paid = orders.filter((o) => PAID.includes(o.status) && now - Date.parse(o.created_at) <= 30 * DAY);

  // SCALE: the product in the most paid orders, and how far ahead it is.
  const orderCount = new Map<string, { name: string; n: number }>();
  for (const o of paid) {
    const seen = new Set<string>();
    for (const i of o.order_items ?? []) {
      const k = i.product_id ?? i.name;
      if (seen.has(k)) continue;
      seen.add(k);
      orderCount.set(k, { name: i.name, n: (orderCount.get(k)?.n ?? 0) + 1 });
    }
  }
  const ranked = [...orderCount.values()].sort((a, b) => b.n - a.n);
  const scale: Tip = ranked.length
    ? { title: `${ranked[0].name}: in ${ranked[0].n} paid order${ranked[0].n > 1 ? "s" : ""}.`, detail: ranked[1] ? `${ranked[1].name} is next with ${ranked[1].n}. Feature ${ranked[0].name} in posts and ads.` : "Feature it in your next posts and ads." }
    : { title: "Not enough sales yet.", detail: "Tips appear after your first paid orders." };

  // KILL: an active product listed 30+ days ago with no orders in the last 30 days.
  const soldIds = new Set(paid.flatMap((o) => (o.order_items ?? []).map((i) => i.product_id)));
  const stale = products.filter((p) => p.active && now - Date.parse(p.created_at) > 30 * DAY && !soldIds.has(p.id));
  const kill: Tip = stale.length
    ? { title: `${stale[0].name}: 0 orders in 30 days.`, detail: stale.length > 1 ? `${stale.length - 1} more products also had none. Hide them or try a special.` : "Hide it or try it as a special." }
    : { title: "Every product sold this month.", detail: "Nothing to cut right now." };

  // TIMING: the 2-hour window with the most paid orders.
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", hour: "numeric", hour12: false });
  const slots = new Map<string, number>();
  for (const o of paid) {
    const parts = fmt.formatToParts(new Date(o.paid_at ?? o.created_at));
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    const k = `${wd}|${h - (h % 2)}`;
    slots.set(k, (slots.get(k) ?? 0) + 1);
  }
  const best = [...slots.entries()].sort((a, b) => b[1] - a[1])[0];
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  const timing: Tip = best && best[1] >= 2
    ? (() => { const [wd, h] = best[0].split("|"); const hh = Number(h); return { title: `${wd} orders peak ${h12(hh)} to ${h12((hh + 2) % 24)}.`, detail: `Post or send offers the evening before.` }; })()
    : { title: "No clear peak yet.", detail: "Shows once a few more orders are paid." };

  return { scale, kill, timing };
}
