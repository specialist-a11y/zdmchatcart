import "server-only";

/** Instagram Graph calls for a connected client (Page token from "Connect Instagram and Facebook"). */
const ver = () => process.env.META_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v22.0";

async function post(path: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/${ver()}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, id: json?.id ?? json?.message_id } : { ok: false as const, error: json?.error?.message ?? `HTTP ${res.status}` };
}

/** Public reply under the comment. */
export const replyToComment = (token: string, commentId: string, message: string) =>
  post(`${commentId}/replies`, token, { message });

/** Private reply: one DM to the person who commented (allowed once per comment, within 7 days). */
export const privateReply = (token: string, pageId: string, commentId: string, text: string) =>
  post(`${pageId}/messages`, token, { recipient: { comment_id: commentId }, message: { text } });

/** Turn on webhooks for this client's Page so their Instagram comments reach us. */
export async function subscribePage(token: string, pageId: string) {
  const res = await fetch(`https://graph.facebook.com/${ver()}/${pageId}/subscribed_apps?subscribed_fields=feed,messages&access_token=${encodeURIComponent(token)}`, { method: "POST" });
  return res.ok;
}

export type IgMedia = { id: string; caption?: string; media_type?: string; thumbnail_url?: string; media_url?: string; permalink?: string; timestamp?: string };

/** Latest posts, for picking which post a keyword belongs to. */
export async function recentMedia(token: string, igId: string, limit = 12): Promise<IgMedia[]> {
  const q = new URLSearchParams({ fields: "id,caption,media_type,thumbnail_url,media_url,permalink,timestamp", limit: String(limit), access_token: token });
  const res = await fetch(`https://graph.facebook.com/${ver()}/${igId}/media?${q}`, { next: { revalidate: 300 } });
  if (!res.ok) return [];
  const json: any = await res.json().catch(() => ({}));
  return json?.data ?? [];
}
