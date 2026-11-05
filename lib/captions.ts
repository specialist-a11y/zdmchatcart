import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI captions for Instagram and Facebook posts, written by Claude from the photo (or a still from the
 * video), the clip title and the business's own details. Needs ANTHROPIC_API_KEY; without it captions
 * are simply left for the client to write.
 */
export const captionsEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `You write Instagram and Facebook captions for small Caribbean businesses (mostly Barbados): bakeries, salons, boutiques, food spots.

Write one caption that sounds like the owner talking to regulars, warm and local, never corporate.
- Open with a hook about what is in the photo or video. Describe only what you can actually see or what the title says; never invent prices, dates, offers or menu items.
- 1 to 3 short sentences, then one call to action that fits the business (order on WhatsApp, link in bio, come by the shop).
- At most 2 emoji, only where natural.
- End with 3 to 6 relevant hashtags on their own line, including at least one local tag such as #barbados or #bajan when it fits.
- Under 400 characters in total.
Reply with the caption only: no quotes, no preamble, no options.`;

type Biz = { name: string; tagline?: string | null; description?: string | null; address?: string | null; whatsapp_number?: string | null; instagram?: string | null };

export async function writeCaption(input: { business: Biz; titles: string[]; imageUrls: string[]; kinds: ("video" | "image")[] }) {
  if (!captionsEnabled()) return null;
  const client = new Anthropic();
  const b = input.business;
  const about = [
    `Business: ${b.name}`,
    b.tagline && `Tagline: ${b.tagline}`,
    b.description && `About: ${b.description.slice(0, 600)}`,
    b.address && `Location: ${b.address}`,
    b.whatsapp_number && "Customers order on WhatsApp.",
    b.instagram && `Instagram: ${b.instagram}`,
  ].filter(Boolean).join("\n");
  const what = input.kinds.length > 1
    ? `A carousel of ${input.kinds.length} items (${input.kinds.filter((k) => k === "video").length} videos).`
    : input.kinds[0] === "video" ? "A short video (Reel). The image is a still from it." : "A photo post.";
  const titles = input.titles.filter(Boolean).map((t) => `- ${t}`).join("\n");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...input.imageUrls.slice(0, 4).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
    { type: "text", text: `${about}\n\n${what}${titles ? `\nFile titles (may be rough):\n${titles}` : ""}\n\nWrite the caption.` },
  ];

  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    return text ? text.slice(0, 2200) : null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("Caption rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`Caption API error ${e.status}: ${e.message}`);
    else console.error("Caption failed", e);
    return null;
  }
}

/** Write captions for library items that don't have one yet (after upload). */
export async function autoCaption(admin: SupabaseClient, clipIds: string[]) {
  if (!captionsEnabled() || !clipIds.length) return;
  const { data: clips } = await admin.from("video_clips").select("id, business_id, kind, title, caption, storage_path, thumb_path").in("id", clipIds);
  for (const c of clips ?? []) {
    if (c.caption) continue;
    const caption = await captionFor(admin, c.business_id, [c]);
    if (caption) await admin.from("video_clips").update({ caption }).eq("id", c.id).is("caption", null);
  }
}

/** One caption for a set of library items (a post), from their images/stills. */
export async function captionFor(admin: SupabaseClient, businessId: string, clips: { kind: string; title: string; storage_path: string; thumb_path: string | null }[]) {
  const { data: business } = await admin.from("businesses")
    .select("name, tagline, description, address, whatsapp_number, instagram").eq("id", businessId).maybeSingle<Biz>();
  if (!business) return null;
  const paths = clips.map((c) => (c.kind === "image" ? c.storage_path : c.thumb_path)).filter((p): p is string => Boolean(p)).slice(0, 4);
  const { data: signed } = paths.length ? await admin.storage.from("client-videos").createSignedUrls(paths, 600) : { data: [] };
  return writeCaption({
    business,
    titles: clips.map((c) => c.title),
    imageUrls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[],
    kinds: clips.map((c) => (c.kind === "image" ? "image" : "video")),
  });
}
