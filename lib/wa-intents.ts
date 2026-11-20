/**
 * Built-in WhatsApp replies on every plan (like the order-code reply): the catalog with photos,
 * the pickup location pin, and a welcome back for returning customers. Pure, so it can be tested.
 */

/** "Can I see your catalog?", "what do you have", "price list", "show me your items". */
export function asksCatalog(text: string) {
  return /\b(catalog(ue)?|price ?list|full list|what (do|can) (you|u) (have|rent|offer|sell)|what (have|do) you got|what'?s available|show me (what|your|the) ?(items|equipment|packages|options|stuff)?|(see|send|show)( me)? (your |the )?(items|equipment|packages|options|products|pictures|photos))\b/i.test(text);
}

/** "Where are you?", "location", "send the pin", "address", "directions". */
export function asksLocation(text: string) {
  return /\b(location|located|locate|where (are|r) (you|u|y'?all)|where (is|do|can) (it|i|we) (collect|pick ?up|get|find)|address|directions|(send|share|drop)( me)? (the |your )?pin|google maps|where to (collect|pick ?up))\b/i.test(text);
}

/** A new visit: they've chatted before, but not in the last `gapHours`. */
export function isReturning(lastInboundAt: string | null | undefined, now = Date.now(), gapHours = 24) {
  return !!lastInboundAt && now - Date.parse(lastInboundAt) > gapHours * 3_600_000;
}

export function welcomeBack(name: string | null | undefined, business: string) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return `Great to see you again${first ? `, ${first}` : ""}! Welcome back to ${business}.`;
}

/** One catalog card as a WhatsApp photo caption. */
export function catalogCaption(p: { name: string; price: number | string; description?: string | null; rental?: boolean | null; rental_unit?: string | null }, currency: string) {
  const price = Number(p.price);
  const amount = `${currency} $${Number.isInteger(price) ? price : price.toFixed(2)}`;
  const per = p.rental ? ` per ${p.rental_unit === "night" ? "night" : "day"}` : "";
  const desc = (p.description ?? "").trim();
  return `*${p.name}*\n${price > 0 ? `${amount}${per}` : "Price on request"}${desc ? `\n${desc.length > 220 ? desc.slice(0, 217) + "..." : desc}` : ""}`;
}

/** WhatsApp image messages take JPEG or PNG links only. */
export const whatsappImage = (url: string | null | undefined) => !!url && /^https:\/\/\S+\.(jpe?g|png)(\?\S*)?$/i.test(url);
