import "server-only";
import type { TokenInfo } from "./health";

/** Ask Meta whether a token still works and when it stops. Needs META_APP_ID and META_APP_SECRET. */
export async function debugToken(token: string): Promise<TokenInfo | null> {
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret || !token) return null;
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${id}|${secret}`)}`, { cache: "no-store" });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.data) return { error: json?.error?.message ?? `HTTP ${res.status}` };
    const d = json.data;
    return { is_valid: !!d.is_valid, expires_at: Number(d.expires_at ?? 0), data_access_expires_at: Number(d.data_access_expires_at ?? 0) };
  } catch (e: any) {
    return { error: e?.message ?? "network error" };
  }
}
