/** Rules for scheduling posts to Instagram and Facebook. Pure functions, shared by the UI, server and tests. */

export type Platform = "instagram" | "facebook";
export type MediaKind = "video" | "image";
export type PostStatus = "scheduled" | "publishing" | "published" | "partial" | "failed" | "cancelled";

export const PLATFORMS: Platform[] = ["instagram", "facebook"];
export const MAX_ITEMS = 10;
export const MAX_CAPTION = 2200;
export const MAX_HASHTAGS = 30;

/** Returns a plain-English problem with the post, or null if it can be scheduled. */
export function checkPost(p: { kinds: MediaKind[]; platforms: Platform[]; caption: string; when: Date; now?: Date; ratios?: (number | null)[] }): string | null {
  const now = p.now ?? new Date();
  if (!p.kinds.length) return "Pick at least one photo or video.";
  if (p.kinds.length > MAX_ITEMS) return `A post can have up to ${MAX_ITEMS} photos and videos.`;
  if (!p.platforms.length) return "Pick Instagram, Facebook or both.";
  if (p.platforms.some((x) => !PLATFORMS.includes(x))) return "Unknown platform.";
  if (p.caption.length > MAX_CAPTION) return `Captions can be up to ${MAX_CAPTION} characters.`;
  if ((p.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > MAX_HASHTAGS) return `Instagram allows up to ${MAX_HASHTAGS} hashtags.`;
  if (Number.isNaN(p.when.getTime())) return "Pick a date and time.";
  if (p.when.getTime() < now.getTime() - 5 * 60_000) return "That time has already passed.";
  if (p.when.getTime() > now.getTime() + 180 * 864e5) return "You can schedule up to 6 months ahead.";
  const videos = p.kinds.filter((k) => k === "video").length;
  if (p.platforms.includes("facebook") && videos > 0 && p.kinds.length > 1)
    return "Facebook can't mix a video with other items in one post. Post the video on its own, or untick Facebook.";
  if (p.platforms.includes("instagram") && p.kinds.some((k, i) => k === "image" && (p.ratios?.[i] ?? 1) < 0.79))
    return "Instagram feed photos can't be taller than 4:5, and this has a 9:16 photo. Untick Instagram, or use a 4:5 version.";
  return null;
}

/** Width ÷ height, or null when unknown. */
export const ratioOf = (w?: number | null, h?: number | null) => (w && h ? w / h : null);

/** The crop frame for a target ratio (width ÷ height), as large as fits, centred. */
export function frameFor(w: number, h: number, ratio: number) {
  const fw = w / h > ratio ? Math.round(h * ratio) : w;
  const fh = w / h > ratio ? h : Math.round(w / ratio);
  return { x: Math.round((w - fw) / 2), y: Math.round((h - fh) / 2), w: fw, h: fh };
}

/** What kind of post each platform will get. */
export function postShape(kinds: MediaKind[]) {
  if (kinds.length > 1) return { instagram: "Carousel", facebook: "Photo album" } as const;
  return kinds[0] === "video" ? ({ instagram: "Reel", facebook: "Video" } as const) : ({ instagram: "Photo", facebook: "Photo" } as const);
}

/** Overall status once each platform has either succeeded, failed or is still processing. */
export function finalStatus(wanted: Platform[], done: Partial<Record<Platform, "ok" | "failed" | "pending">>): PostStatus {
  const states = wanted.map((p) => done[p] ?? "pending");
  if (states.includes("pending")) return "publishing";
  if (states.every((s) => s === "ok")) return "published";
  if (states.some((s) => s === "ok")) return "partial";
  return "failed";
}

/** Instagram only takes feed photos between 4:5 (tall) and 1.91:1 (wide). Returns the crop box that fits, centred. */
export function igCrop(w: number, h: number) {
  const ratio = w / h;
  if (ratio < 0.8) { const nh = Math.round(w / 0.8); return { x: 0, y: Math.round((h - nh) / 2), w, h: nh }; }
  if (ratio > 1.91) { const nw = Math.round(h * 1.91); return { x: Math.round((w - nw) / 2), y: 0, w: nw, h }; }
  return { x: 0, y: 0, w, h };
}

/** Signed storage links download (instead of play) when ?download=name is added. */
export function downloadUrl(url: string, title: string, kind: string) {
  const name = `${(title || "content").replace(/[^a-z0-9 _-]+/gi, "").trim().replace(/\s+/g, "-").slice(0, 60) || "content"}.${kind === "video" ? "mp4" : "jpg"}`;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
}
