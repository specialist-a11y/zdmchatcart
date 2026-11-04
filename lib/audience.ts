/** Ad audiences: the fields ZDMINC fills in, and the plain summary the owner sees before approving. Pure, tested. */

export const PARISHES = ["Christ Church", "St Andrew", "St George", "St James", "St John", "St Joseph", "St Lucy", "St Michael", "St Peter", "St Philip", "St Thomas"];
export const WARM: Record<string, string> = {
  shop_visitors: "people who visited your shop page",
  cart_abandoners: "people who started an order but didn't pay",
  whatsapp_chatters: "people who messaged you on WhatsApp",
  instagram_engagers: "people who engaged with your Instagram",
  past_customers: "past customers who agreed to marketing",
};
export type Audience = {
  area: string; parishes: string[]; radius_km: number | null; age_min: number; age_max: number; gender: string;
  interests: string[]; warm: string[]; placements: string[];
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function audienceSummary(a: Audience, shopArea?: string | null) {
  const where = a.area === "parishes" && a.parishes.length ? list(a.parishes)
    : a.area === "radius" && a.radius_km ? `within ${a.radius_km} km of ${shopArea || "your shop"}` : "all of Barbados";
  const place = where.startsWith("within") ? where : `in ${where}`;
  const who = `${a.gender === "women" ? "women" : a.gender === "men" ? "men" : "people"} aged ${a.age_min} to ${a.age_max}${a.age_max >= 65 ? "+" : ""}`;
  const likes = a.interests.length ? `, who like ${list(a.interests.map((i) => i.toLowerCase()))}` : "";
  const warm = a.warm.length ? `. Plus ${list(a.warm.map((w) => WARM[w] ?? w))}` : "";
  const on = a.placements.length === 2 ? "Instagram and Facebook" : a.placements[0] === "facebook" ? "Facebook" : "Instagram";
  return `${who[0].toUpperCase()}${who.slice(1)} ${place}${likes}${warm}. Shown on ${on}.`;
}

/** Parse the admin form into a clean audience. */
export function parseAudience(get: (k: string) => string, getAll: (k: string) => string[]): Audience {
  const n = (k: string, d: number) => { const v = Math.round(Number(get(k))); return Number.isFinite(v) && v > 0 ? v : d; };
  let age_min = Math.min(65, Math.max(18, n("age_min", 18)));
  let age_max = Math.min(65, Math.max(18, n("age_max", 65)));
  if (age_max < age_min) [age_min, age_max] = [age_max, age_min];
  const area = ["barbados", "parishes", "radius"].includes(get("area")) ? get("area") : "barbados";
  const placements = getAll("placements").filter((p) => p === "instagram" || p === "facebook");
  return {
    area,
    parishes: area === "parishes" ? getAll("parishes").filter((p) => PARISHES.includes(p)) : [],
    radius_km: area === "radius" ? Math.min(80, Math.max(1, n("radius_km", 10))) : null,
    age_min, age_max,
    gender: ["all", "women", "men"].includes(get("gender")) ? get("gender") : "all",
    interests: get("interests").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
    warm: getAll("warm").filter((w) => w in WARM),
    placements: placements.length ? placements : ["instagram", "facebook"],
  };
}

/** Meta's matching rules: phone as digits with country code, email lowercased and trimmed, then SHA-256. */
export function normalizePhone(p: string | null | undefined) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 7 ? `1246${d}` : d; // a bare 7-digit Barbados number gets +1 246
}
export function normalizeEmail(e: string | null | undefined) {
  return (e ?? "").trim().toLowerCase();
}
