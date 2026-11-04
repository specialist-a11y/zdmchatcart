import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Connect a client's Instagram professional account and Facebook Page with Facebook Login for Business.
 * Included on every plan, Starter up. Stores the Page token (service role only) so later features
 * (Instagram DMs, posting, ad audiences) can act for the client.
 */
export const SOCIAL_SCOPES = [
  "pages_show_list", "pages_read_engagement", "business_management",
  "instagram_basic", "instagram_manage_comments", "instagram_manage_messages", "instagram_content_publish", "pages_manage_metadata", "pages_messaging",
];

const ver = () => process.env.META_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
export const redirectUri = () => `${site()}/api/social/callback`;
export const socialConfigured = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.NEXT_PUBLIC_SITE_URL);

function sign(body: string) {
  return createHmac("sha256", process.env.META_APP_SECRET ?? "").update(body).digest("base64url");
}

/** Signed state: which business, who started it, and when (valid 15 minutes). */
export function makeState(slug: string, userId: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ s: slug, u: userId, t: now })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readState(state: string, now = Date.now()): { slug: string; userId: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { s, u, t } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof s !== "string" || typeof u !== "string" || now - t > 15 * 60_000 || t > now + 60_000) return null;
    return { slug: s, userId: u };
  } catch { return null; }
}

export function loginUrl(state: string) {
  const q = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "", redirect_uri: redirectUri(), state,
    response_type: "code", scope: SOCIAL_SCOPES.join(","),
  });
  return `https://www.facebook.com/${ver()}/dialog/oauth?${q}`;
}

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${ver()}/${path}?${new URLSearchParams(params)}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Meta error ${res.status}`);
  return json as T;
}

export type SocialPage = {
  id: string; name: string; access_token: string;
  instagram_business_account?: { id: string; username?: string; followers_count?: number; profile_picture_url?: string };
};

/** Code -> long-lived user token -> the Pages they manage, with any linked Instagram account. */
export async function pagesFromCode(code: string): Promise<SocialPage[]> {
  const app = { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "" };
  const short = await graph<{ access_token: string }>("oauth/access_token", { ...app, redirect_uri: redirectUri(), code });
  const long = await graph<{ access_token: string }>("oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
  const pages = await graph<{ data: SocialPage[] }>("me/accounts", {
    access_token: long.access_token,
    fields: "id,name,access_token,instagram_business_account{id,username,followers_count,profile_picture_url}",
    limit: "50",
  });
  return pages.data ?? [];
}

/** Prefer a Page that has Instagram linked; the client can switch if they manage several. */
export function pickPage(pages: SocialPage[], wanted?: string | null) {
  return pages.find((p) => p.id === wanted) ?? pages.find((p) => p.instagram_business_account) ?? pages[0] ?? null;
}
