/**
 * What each plan unlocks. Pure so it can be tested and used on both server and client.
 * Plans store their feature keys in plans.features (editable in ZDMINC admin > Plans and billing).
 * Anything not listed here is core and comes with every plan.
 */

export const FEATURES = [
  { key: "ig_autoreplies", label: "Instagram comment auto-replies (comment a keyword, get the link by DM)", from: "Growth" },
  { key: "cart_recovery", label: "Abandoned cart recovery and reminders", from: "Growth" },
  { key: "daily_summary", label: "Daily summary on WhatsApp", from: "Growth" },
  { key: "reporting", label: "Reporting and sales tips (what to push, what to drop, when to post)", from: "Pro" },
  { key: "ai_assistant", label: "AI product assistant", from: "Pro" },
  { key: "broadcasts", label: "WhatsApp broadcasts", from: "Pro" },
  { key: "marketing_autopilot", label: "Marketing Autopilot (AI posts, scheduling, captions)", from: "All-in-One" },
  { key: "ads", label: "Retargeting ads on Instagram and Facebook", from: "All-in-One" },
  { key: "videos", label: "Monthly video shoot and short videos", from: "Video plans" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];
export const featureLabel = (k: string) => FEATURES.find((f) => f.key === k)?.label ?? k;

/** Every plan gets these. Listed so the plan pages can show them. */
export const CORE = [
  "Shop page with carts sent to WhatsApp with an order code",
  "Card payment links and bank transfer (1st Pay or any bank), orders marked paid",
  "WhatsApp receipts",
  "Inbox for your WhatsApp chats",
  "Orders, customers and products",
  "Instagram and Facebook connected",
  "Image posts made for you each month",
  "Short links, QR codes and which post made each sale",
];

/** CRM menu key -> the feature it needs. Sections not listed are core. */
export const SECTION_FEATURE: Record<string, FeatureKey> = {
  autoreplies: "ig_autoreplies",
  ads: "ads",
  videos: "videos",
};

/** Subscription states that keep the paid features on. past_due keeps working (reminders handle it). */
export const LIVE_STATUSES = ["active", "trial", "past_due"] as const;

export type Entitlements = {
  planId: string | null;
  planName: string | null;
  status: string | null;
  features: string[];
  live: boolean;
};

export function entitlementsFrom(plan: { id: string; name: string; features?: string[] | null; video_clips?: number | null } | null, status: string | null): Entitlements {
  const features = new Set((plan?.features ?? []).filter((k) => (FEATURE_KEYS as string[]).includes(k)));
  // A plan with video clips always includes the Videos section, even if the box wasn't ticked.
  if ((plan?.video_clips ?? 0) > 0) features.add("videos");
  const live = !!plan && (LIVE_STATUSES as readonly string[]).includes(status ?? "");
  return { planId: plan?.id ?? null, planName: plan?.name ?? null, status, features: [...features], live };
}

export function has(e: Entitlements, key: FeatureKey) {
  return e.live && e.features.includes(key);
}

/** Can this menu item be used? Core sections need only an account; while waiting for the first payment, only set-up sections open. */
export const SETUP_SECTIONS = ["", "products", "business", "billing", "support", "settings", "website"];
export function sectionOpen(e: Entitlements, navKey: string) {
  if (!e.live) return SETUP_SECTIONS.includes(navKey);
  const need = SECTION_FEATURE[navKey];
  return need ? e.features.includes(need) : true;
}

/** Cheapest plans (by rank) that include a feature, for the "upgrade to get this" card. */
export function plansWith<P extends { id: string; name: string; rank: number; features?: string[] | null; video_clips?: number | null; active?: boolean }>(plans: P[], key: FeatureKey) {
  return plans
    .filter((p) => p.active !== false && entitlementsFrom(p, "active").features.includes(key))
    .sort((a, b) => a.rank - b.rank);
}

/** Setup fee plus the first month, the invoice sent when someone signs up. */
export function firstInvoice(plan: { name: string; monthly_price: number; setup_fee: number }) {
  const amount = Math.round((Number(plan.setup_fee) + Number(plan.monthly_price)) * 100) / 100;
  const description = Number(plan.setup_fee) > 0
    ? `${plan.name}: one-time setup (BBD $${Number(plan.setup_fee).toFixed(2)}, payments set up for you) and first month (BBD $${Number(plan.monthly_price).toFixed(2)})`
    : `${plan.name}: first month`;
  return { amount, description };
}
