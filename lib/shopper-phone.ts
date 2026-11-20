/**
 * A shopper's WhatsApp number as typed at checkout -> digits with country code, or null if it can't be right.
 * Caribbean numbers are +1: "246 555 1234" -> 12465551234. A bare 7-digit number is taken as Barbados (+1 246).
 */
export function shopperPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 7) return `1246${d}`;
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("0")) return d;
  return null;
}
