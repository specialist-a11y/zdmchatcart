/**
 * Professional website requests: the client answers a few questions, ChatCart draws a concept image,
 * and both go to ZDMINC in Support so the team can send a quote. Pure helpers (tested).
 */

export const DESIGN_STYLES = {
  modern: { label: "Modern and clean", bg: "#ffffff", text: "#111827", muted: "#6b7280", card: "#f3f4f6", radius: 14, upper: false },
  bold: { label: "Bold and vibrant", bg: "#111111", text: "#ffffff", muted: "#b5b5b5", card: "#1f1f1f", radius: 22, upper: true },
  elegant: { label: "Elegant and luxury", bg: "#f7f3ee", text: "#2b2622", muted: "#7a6f66", card: "#ede6dc", radius: 2, upper: true },
  warm: { label: "Warm and friendly", bg: "#fff8f0", text: "#3a2a1e", muted: "#8a6f5a", card: "#ffeedd", radius: 26, upper: false },
  cinematic: { label: "Dark and cinematic", bg: "#0a0e17", text: "#f1f2f6", muted: "#a4b0be", card: "#111827", radius: 12, upper: false },
} as const;
export type DesignStyle = keyof typeof DESIGN_STYLES;

export const DESIGN_PAGES = ["Home", "About", "Services", "Products or menu", "Gallery", "Booking", "Reviews", "FAQ", "Contact", "Blog"] as const;
export const DESIGN_FEATURES = ["Online booking", "Online shop", "WhatsApp chat button", "Photo gallery", "Video", "Customer reviews", "Contact form", "Newsletter sign-up", "Events calendar"] as const;
export const DESIGN_TIMING = ["As soon as possible", "Within a month", "In 1 to 3 months", "No rush"] as const;
export const DESIGN_BUDGET = ["Not sure yet", "Under BBD 1,000", "BBD 1,000 to 2,500", "BBD 2,500 to 5,000", "Over BBD 5,000"] as const;

export type DesignBrief = {
  business: string; about: string; customers: string; style: DesignStyle; primary: string; accent: string;
  pages: string[]; features: string[]; examples: string; domain: string; timing: string; budget: string; notes: string;
};

const HEX = /^#[0-9a-f]{6}$/i;
const pickAll = (vals: string[], from: readonly string[]) => vals.filter((v) => from.includes(v)).slice(0, 12);
const pickOne = (v: string, from: readonly string[], fallback: string) => (from.includes(v) ? v : fallback);

/** Read and tidy the form answers. */
export function readBrief(f: { get(k: string): unknown; getAll(k: string): unknown[] }, fallbackName: string): DesignBrief | { error: string } {
  const s = (k: string, max = 600) => String(f.get(k) ?? "").trim().slice(0, max);
  const about = s("about");
  if (about.length < 10) return { error: "Tell us a little about your business (a sentence or two)" };
  const style = (Object.keys(DESIGN_STYLES).includes(s("style")) ? s("style") : "modern") as DesignStyle;
  const pages = pickAll(f.getAll("pages").map(String), DESIGN_PAGES);
  return {
    business: s("business", 80) || fallbackName, about, customers: s("customers"), style,
    primary: HEX.test(s("primary")) ? s("primary") : "#3D8BFF", accent: HEX.test(s("accent")) ? s("accent") : "#FECA57",
    pages: pages.length ? pages : ["Home", "About", "Contact"], features: pickAll(f.getAll("features").map(String), DESIGN_FEATURES),
    examples: s("examples", 500), domain: pickOne(s("domain"), ["I have one", "I need one", "Not sure"], "Not sure"),
    timing: pickOne(s("timing"), DESIGN_TIMING, "No rush"), budget: pickOne(s("budget"), DESIGN_BUDGET, "Not sure yet"), notes: s("notes", 1500),
  };
}

/** The request as it appears in Support. */
export function briefText(b: DesignBrief) {
  return [
    "I'd like a professionally designed website. Please send me a quote.",
    "",
    `Business: ${b.business}`,
    `What we do: ${b.about}`,
    b.customers && `Our customers: ${b.customers}`,
    `Style: ${DESIGN_STYLES[b.style].label}`,
    `Colours: ${b.primary} and ${b.accent}`,
    `Pages: ${b.pages.join(", ")}`,
    b.features.length > 0 && `Must have: ${b.features.join(", ")}`,
    b.examples && `Websites we like: ${b.examples}`,
    `Domain: ${b.domain}`,
    `When: ${b.timing}`,
    `Budget: ${b.budget}`,
    b.notes && `Anything else: ${b.notes}`,
    "",
    "The attached image is a first concept made from these answers.",
  ].filter((l): l is string => typeof l === "string").join("\n");
}

/** Short headline for the concept: the tagline if short, otherwise the first sentence, trimmed. */
export function conceptHeadline(about: string, business: string) {
  const first = about.split(/(?<=[.!?])\s/)[0].replace(/[.!]+$/, "");
  return first.length >= 15 && first.length <= 60 ? first : business;
}
