import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogFacts } from "./assistant-text";
import { cleanHours, hoursSummary, openState } from "./hours";
import { readZones } from "./shop-front";

/**
 * AI product assistant (Pro and up): answers a customer's WhatsApp question about products, prices,
 * options, delivery and opening times, using only the shop's own data. If the answer isn't in that
 * data it hands over to a person instead of guessing. Needs ANTHROPIC_API_KEY.
 */
export const assistantAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);
const HANDOFF = "HANDOFF";

const SYSTEM = `You answer WhatsApp messages for a small Caribbean business, as their friendly shop assistant.

Rules:
- Use ONLY the facts given about the business and its products. Never invent prices, products, stock, discounts, delivery areas, times or policies.
- If the facts don't answer the question, or the customer wants something a person must decide (custom orders, complaints, refunds, changing an order, bargaining), reply with exactly ${HANDOFF} and nothing else.
- Keep it short: 1 to 3 sentences, plain words, warm and local, at most 1 emoji. No markdown, no bullet lists.
- Prices: quote them exactly as given with the currency.
- When it helps, end by pointing them to the shop link to order. Never ask for card details.`;

export async function answerCustomer(admin: SupabaseClient, businessId: string, question: string, history: { direction: string; body: string }[] = []) {
  if (!assistantAvailable()) return null;
  const { data: b } = await admin.from("businesses")
    .select("name, slug, currency, tagline, description, address, delivery_info, opening_hours, hours, closed_until, closed_note, delivery_zones, pickup_enabled")
    .eq("id", businessId).maybeSingle<any>();
  if (!b) return null;
  const { data: products } = await admin.from("products")
    .select("name, price, description, stock, category, price_note, variants, kind, rental, rental_unit")
    .eq("business_id", businessId).eq("active", true).order("sort_order").limit(60);

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const hours = cleanHours(b.hours);
  const now = openState(hours, { closedUntil: b.closed_until, closedNote: b.closed_note });
  const zones = readZones(b.delivery_zones);
  const facts = [
    `Business: ${b.name}${b.tagline ? ` (${b.tagline})` : ""}`,
    b.description && `About: ${String(b.description).slice(0, 500)}`,
    b.address && `Address: ${String(b.address).replace(/\n/g, ", ")}`,
    Object.keys(hours).length ? `Opening hours: ${hoursSummary(hours)}. Right now: ${now.label}.` : b.opening_hours && `Opening hours: ${b.opening_hours}`,
    zones.length ? `Delivery areas and fees: ${zones.map((z) => `${z.name} ${b.currency} ${z.fee.toFixed(2)}`).join("; ")}` : null,
    b.delivery_info && `Delivery and pickup: ${b.delivery_info}`,
    b.pickup_enabled === false ? "Pickup: not offered." : null,
    `Shop link to order: ${site}/s/${b.slug}`,
    "",
    "Products (only these exist):",
    catalogFacts((products ?? []) as any[], b.currency) || "- none listed",
  ].filter((x) => x !== null && x !== false && x !== undefined).join("\n");

  const recent = history.slice(-6).map((m) => `${m.direction === "in" ? "Customer" : "Shop"}: ${String(m.body).slice(0, 300)}`).join("\n");

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1500,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `${facts}\n\n${recent ? `Recent chat:\n${recent}\n\n` : ""}Customer's new message: ${question.slice(0, 600)}\n\nWrite the reply, or ${HANDOFF}.` }],
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (!text || text.includes(HANDOFF)) return null;
    return text.slice(0, 1000);
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`Assistant API error ${e.status}: ${e.message}`);
    else console.error("Assistant failed", e);
    return null;
  }
}
