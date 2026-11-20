import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money, priceCart } from "./order-text";
import { availability, expandKits, kitFree, pickupOptions, prettyDate, priceRentalCart, rentalSpan, unitLabel, validateDates, type RentalProduct } from "./rental";
import { loadBookings, loadRentalCatalog, rentalSettings } from "./rental-server";
import { todayIn } from "./billing";
import { isCancel, isNo, isYes, matchProducts, parseDate, pickNumbers, wantsToOrder } from "./wa-order";

/**
 * Ordering inside a WhatsApp chat, on every plan. "I would like to rent the projector" starts it; the bot asks for
 * whatever is missing (items, event date, pickup time, the rental agreement), shows a summary, and on YES creates the
 * order through the same orders API as the website. The webhook then replies with the order code and payment details.
 */
type Step = "items" | "date" | "time" | "agree" | "confirm";
type Data = { ids?: string[]; list?: string[]; date?: string; time?: string; agreed?: boolean };
type Ctx = { businessId: string; customerId: string; text: string; name: string | null; phone: string; site: string; slug: string };
export type Turn = { handled: false } | { handled: true; reply?: string; code?: string };

const EXPIRE_HOURS = 6;
const CANCEL_HINT = "\n\nReply CANCEL any time to stop.";

export async function bookingTurn(admin: SupabaseClient, ctx: Ctx): Promise<Turn> {
  const { data: row, error } = await admin.from("wa_sessions").select("step, data, updated_at").eq("customer_id", ctx.customerId).maybeSingle();
  if (error) return { handled: false }; // before migration 0030
  const fresh = row && Date.now() - Date.parse(row.updated_at) < EXPIRE_HOURS * 3_600_000;
  const save = (step: Step, data: Data) => admin.from("wa_sessions").upsert({ customer_id: ctx.customerId, business_id: ctx.businessId, step, data, updated_at: new Date().toISOString() });
  const clear = () => admin.from("wa_sessions").delete().eq("customer_id", ctx.customerId);

  const shop = await loadShop(admin, ctx.businessId);
  if (!shop.products.length) return { handled: false };
  const today = todayIn();

  let data: Data;
  if (!fresh) {
    if (row) await clear();
    if (!wantsToOrder(ctx.text)) return { handled: false };
    data = { ids: matchProducts(ctx.text, shop.products).map((p) => p.id), date: parseDate(ctx.text, today) ?? undefined };
  } else {
    if (isCancel(ctx.text)) { await clear(); return { handled: true, reply: "No problem, I've cancelled that booking. Message us any time." }; }
    data = { ...(row!.data as Data) };
    const step = row!.step as Step;
    if (step === "items") {
      const nums = pickNumbers(ctx.text, data.list?.length ?? 0).map((n) => data.list![n - 1]);
      const ids = nums.length ? nums : matchProducts(ctx.text, shop.products).map((p) => p.id);
      if (!ids.length) return { handled: true, reply: `Sorry, I didn't catch that. ${itemsQuestion(shop, data)}` };
      data.ids = ids;
      data.date ??= parseDate(ctx.text, today) ?? undefined;
    } else if (step === "date") {
      const d = parseDate(ctx.text, today);
      if (!d) return { handled: true, reply: `Sorry, I didn't catch the date. ${dateQuestion(shop)}` };
      data.date = d;
    } else if (step === "time") {
      const n = pickNumbers(ctx.text, shop.times.length)[0];
      const t = n ? shop.times[n - 1] : shop.times.find((x) => x.toLowerCase().replace(/\s/g, "") === ctx.text.toLowerCase().replace(/\s/g, ""));
      if (!t) return { handled: true, reply: `Please reply with the number of a pickup time.\n${numbered(shop.times)}` };
      data.time = t;
    } else if (step === "agree") {
      if (isNo(ctx.text)) { await clear(); return { handled: true, reply: "No problem, I've cancelled that booking. Message us any time." }; }
      if (!isYes(ctx.text)) return { handled: true, reply: `Please reply YES to accept the rental agreement, or NO to cancel.\n${shop.agreementUrl}` };
      data.agreed = true;
    } else if (step === "confirm") {
      if (isNo(ctx.text)) { await clear(); return { handled: true, reply: "No problem, I've cancelled that booking. Message us any time." }; }
      // Changing their mind at the summary: a new date or different items.
      const d = parseDate(ctx.text, today);
      const ids = matchProducts(ctx.text, shop.products).map((p) => p.id);
      if (!isYes(ctx.text) && (d || ids.length)) {
        if (d) data.date = d;
        if (ids.length) data.ids = ids;
      } else if (isYes(ctx.text)) {
        const made = await createOrder(ctx, shop, data);
        if ("error" in made) return { handled: true, reply: `Sorry, I couldn't book that: ${made.error}${CANCEL_HINT}` };
        await clear();
        return { handled: true, code: made.code };
      } else {
        return { handled: true, reply: "Reply YES to book it, or NO to cancel. To change the date, just send the new date." };
      }
    }
  }

  // Ask for whatever is still missing, in order.
  if (!data.ids?.length) {
    data.list = shop.products.map((p) => p.id);
    await save("items", data);
    return { handled: true, reply: `Happy to help you book! ${itemsQuestion(shop, data)}` };
  }
  const rental = data.ids.some((id) => shop.byId.get(id)?.rental);
  if (rental && !data.date) { await save("date", data); return { handled: true, reply: `${picked(shop, data)}\n\n${dateQuestion(shop)}` }; }
  const q = await quote(admin, ctx.businessId, shop, data);
  if ("error" in q) {
    data.date = undefined;
    await save(rental ? "date" : "items", data);
    return { handled: true, reply: `${q.error}\n\n${rental ? "Send another date" : "Choose something else"}, or reply CANCEL.` };
  }
  if (rental && shop.times.length && !data.time) { await save("time", data); return { handled: true, reply: `What time would you like to pick up on ${prettyDate(q.pickup!)}?\n${numbered(shop.times)}` }; }
  if (rental && shop.agreementUrl && !data.agreed) { await save("agree", data); return { handled: true, reply: `Please read our rental agreement and liability waiver:\n${shop.agreementUrl}\n\nReply YES to accept it.` }; }
  await save("confirm", data);
  return { handled: true, reply: summary(shop, data, q) };
}

/* ---------- Shop data and questions ---------- */

type Shop = Awaited<ReturnType<typeof loadShop>>;

async function loadShop(admin: SupabaseClient, businessId: string) {
  const [{ data: b }, settings, { data: rows, error }] = await Promise.all([
    admin.from("businesses").select("slug, currency, rental_pickup_times, rental_agreement_url, rental_lead_days, rental_buffer_days, bank_transfer_enabled, bank_details").eq("id", businessId).maybeSingle<any>(),
    rentalSettings(admin, businessId),
    admin.from("products").select("id, name, price, stock, active, variants, rental, rental_unit, deposit, min_days").eq("business_id", businessId).eq("active", true).order("sort_order").order("created_at").limit(30),
  ]);
  // Items with options (sizes, flavours) need a choice the chat can't make yet, so they are left out here.
  const products = ((error ? [] : rows) ?? []).filter((p: any) => !(Array.isArray(p.variants) && p.variants.length)) as (RentalProduct & { variants?: unknown })[];
  const { data: fy } = await admin.from("integrations").select("status, config").eq("business_id", businessId).eq("provider", "fygaro").maybeSingle<any>();
  return {
    slug: b?.slug as string, currency: (b?.currency ?? "BBD") as string, products, byId: new Map(products.map((p) => [p.id, p])),
    times: pickupOptions(b?.rental_pickup_times), agreementUrl: (b?.rental_agreement_url ?? null) as string | null,
    leadDays: (b?.rental_lead_days ?? 0) as number, buffer: (b?.rental_buffer_days ?? 0) as number, settings,
    transfer: !!(b?.bank_transfer_enabled && b?.bank_details?.trim()), card: fy?.status === "connected" && !!fy?.config?.button_url,
  };
}

const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join("\n");
const priceText = (p: RentalProduct, cur: string) => Number(p.price) > 0 ? `${money(p.price, cur)}${p.rental ? ` per ${unitLabel(p.rental_unit)}` : ""}` : "price on request";

function itemsQuestion(shop: Shop, data: Data) {
  const list = (data.list ?? shop.products.map((p) => p.id)).map((id) => shop.byId.get(id)!).filter(Boolean);
  data.list = list.map((p) => p.id);
  return `What would you like? Reply with the number, or several like 1, 4:\n${numbered(list.map((p) => `${p.name}, ${priceText(p, shop.currency)}`))}${CANCEL_HINT}`;
}

function dateQuestion(shop: Shop) {
  return shop.settings.eve
    ? "What date is your event? Send it like 19 Dec. You pick up the day before, so you have time to set up, and return the following day."
    : "What date would you like to pick up? Send it like 19 Dec.";
}

const picked = (shop: Shop, data: Data) => `Great choice: ${data.ids!.map((id) => shop.byId.get(id)?.name).filter(Boolean).join(", ")}.`;

/* ---------- Availability, price and the order ---------- */

type Quote = { total: number; deposit: number; lines: { name: string; amount: number }[]; pickup?: string; end?: string };

async function quote(admin: SupabaseClient, businessId: string, shop: Shop, data: Data): Promise<Quote | { error: string }> {
  const req = data.ids!.map((id) => ({ productId: id, quantity: 1 }));
  const rentalReq = req.filter((r) => shop.byId.get(r.productId)?.rental);
  const otherReq = req.filter((r) => !shop.byId.get(r.productId)?.rental);
  const out: Quote = { total: 0, deposit: 0, lines: [] };
  if (rentalReq.length) {
    const eve = shop.settings.eve;
    const bad = validateDates(data.date!, 1, todayIn(), shop.leadDays + (eve ? 1 : 0));
    if (bad) return { error: bad };
    const { pickup, end } = rentalSpan(data.date!, 1, eve);
    const cat = await loadRentalCatalog(admin, businessId);
    const bookings = expandKits(await loadBookings(admin, businessId, pickup, end, shop.buffer), cat.kits);
    const free = kitFree(availability(cat.products, bookings, pickup, end, shop.buffer), cat.kits);
    const r = priceRentalCart(rentalReq, shop.products, 1, free, cat.kits, shop.settings.depositMode);
    if ("error" in r) return { error: r.error.replace("Try other dates.", "").trim() };
    out.total += r.subtotal; out.deposit = r.deposit; out.pickup = pickup; out.end = end;
    out.lines.push(...r.items.map((i) => ({ name: i.name, amount: i.unit_price * i.quantity })));
  }
  if (otherReq.length) {
    const r = priceCart(otherReq, shop.products as any);
    if ("error" in r) return { error: r.error };
    out.total += r.subtotal;
    out.lines.push(...r.items.map((i) => ({ name: i.name, amount: Number(i.unit_price) * i.quantity })));
  }
  return out;
}

function summary(shop: Shop, data: Data, q: Quote) {
  const cur = shop.currency;
  const lines = q.lines.map((l) => `• ${l.name}: ${l.amount ? money(l.amount, cur) : "price to confirm"}`).join("\n");
  const when = q.pickup
    ? `\n${shop.settings.eve ? `Event: ${prettyDate(data.date!)}\n` : ""}Pick up ${prettyDate(q.pickup)}${data.time ? ` at ${data.time}` : ""}, return ${prettyDate(q.end!)}.`
    : "";
  const dep = q.deposit > 0
    ? shop.settings.depositMode === "booking"
      ? `\nPay the ${money(q.deposit, cur)} deposit to secure your date. The balance is due at pickup.`
      : `\nIncludes a ${money(q.deposit, cur)} refundable deposit.`
    : "";
  return `Here's your booking:\n${lines}${when}\nTotal: ${money(q.total, cur)}${dep}\n\nReply YES to book it, or NO to cancel. To change the date, just send the new date.`;
}

async function createOrder(ctx: Ctx, shop: Shop, data: Data): Promise<{ code: string } | { error: string }> {
  const rental = data.ids!.some((id) => shop.byId.get(id)?.rental);
  try {
    const res = await fetch(`${ctx.site}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: shop.slug,
        items: data.ids!.map((id) => ({ productId: id, quantity: 1 })),
        name: ctx.name ?? undefined,
        phone: ctx.phone,
        optIn: true,
        // No card payments set up: send the 1st Pay / bank details straight away.
        paymentMethod: shop.transfer && !shop.card ? "transfer" : shop.transfer ? "card" : undefined,
        rental: rental ? { start: data.date, days: 1, pickupTime: data.time, agreed: !!data.agreed || !shop.agreementUrl } : undefined,
        attribution: "whatsapp chat",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.code) return { error: json.error ?? "something went wrong" };
    return { code: json.code };
  } catch {
    return { error: "something went wrong" };
  }
}

