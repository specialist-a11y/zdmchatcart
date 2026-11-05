/** Customer journey rules: consent words, follow-up messages and template filling. Pure, no I/O. */

const STOP = new Set(["stop", "unsubscribe", "stop all", "stopall", "cancel messages", "opt out", "optout", "remove me", "end", "quit"]);
const START = new Set(["start", "subscribe", "unstop", "opt in", "optin", "resume"]);

/** "STOP" style messages switch marketing off; "START" switches it back on. Whole message only, so "stop by at 3" is not a STOP. */
export function consentCommand(text: string | null | undefined): "stop" | "start" | null {
  const t = (text ?? "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (STOP.has(t)) return "stop";
  if (START.has(t)) return "start";
  return null;
}

export function stopReply(shop: string) {
  return `Done. You won't get offers or updates from ${shop} on WhatsApp. You'll still get messages about orders you place. Reply START to turn them back on.`;
}
export function startReply(shop: string) {
  return `Welcome back! You'll get offers and updates from ${shop} again. Reply STOP any time to turn them off.`;
}

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";

/** WhatsApp text when the owner marks an order Ready. */
export function readyMessage(o: { code: string; name?: string | null; fulfillment?: string | null; shop: string; address?: string | null }) {
  const hi = first(o.name) ? `Hi ${first(o.name)}! ` : "Hi! ";
  if (o.fulfillment === "delivery") return `${hi}Your order ${o.code} from ${o.shop} is ready and will be on its way soon.`;
  const where = o.address ? ` at ${o.address}` : "";
  return `${hi}Your order ${o.code} from ${o.shop} is ready for pickup${where}. See you soon!`;
}

/** Unpaid cart reminder sent inside the 24-hour window. */
export function cartReminderText(o: { code: string; name?: string | null; shop: string; paymentUrl?: string | null }) {
  const hi = first(o.name) ? `Hi ${first(o.name)}, ` : "Hi, ";
  const pay = o.paymentUrl ? ` You can pay here: ${o.paymentUrl}` : " Reply here if you'd like to finish it.";
  return `${hi}your order ${o.code} from ${o.shop} is still waiting.${pay} Reply STOP to opt out.`;
}

/** Send one reminder between 20 and 47 hours after the order was made (abandoned at 48). */
export function reminderDue(createdAt: string, now = Date.now()) {
  const age = now - Date.parse(createdAt);
  return age >= 20 * 3600_000 && age < 47 * 3600_000;
}

/** Values a template placeholder can be filled with, in the order the template lists them. */
export type TemplateParam = "name" | "code" | "total" | "link" | "shop";
export const TEMPLATE_PARAMS: TemplateParam[] = ["name", "code", "total", "link", "shop"];

export function templateValues(params: string[], ctx: Partial<Record<TemplateParam, string | null | undefined>>) {
  return params.map((p) => {
    const v = ctx[p as TemplateParam];
    if (p === "name") return first(v) || "there";
    return (v ?? "").toString() || "-";
  });
}

/** Fill {{1}}, {{2}} placeholders for a preview. Missing values stay visible as {{n}}. */
export function fillTemplate(body: string, values: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] ?? m);
}

/** How many {{n}} placeholders a template body uses (the highest n). */
export function placeholderCount(body: string) {
  let max = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** "40m", "3h", "2d" since a time. */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The 8pm WhatsApp summary to the owner. */
export function dailySummary(d: {
  shop: string; currency: string; sales: number; paidOrders: number; newOrders: number;
  unpaid: number; unpaidTotal: number; ready: number; waiting: number; link: string; day?: "Today" | "Yesterday";
}) {
  const m = (n: number) => `${d.currency} ${n.toFixed(2)}`;
  const lines = [
    `${d.day ?? "Today"} at ${d.shop}`,
    `Sales: ${m(d.sales)} from ${d.paidOrders} paid order${d.paidOrders === 1 ? "" : "s"}`,
    `New orders: ${d.newOrders}`,
  ];
  if (d.unpaid) lines.push(`Unpaid: ${d.unpaid} (${m(d.unpaidTotal)}). Each gets one reminder the day after.`);
  if (d.ready) lines.push(`Ready to collect: ${d.ready}`);
  if (d.waiting) lines.push(`Chats waiting for you: ${d.waiting}`);
  if (!d.sales && !d.newOrders && !d.unpaid && !d.waiting) lines.push(`A quiet day. Share your shop link to bring in orders.`);
  lines.push(`Open Today: ${d.link}`);
  return lines.join("\n");
}
