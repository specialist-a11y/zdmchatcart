import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalStatus, type Platform } from "./posts";

/**
 * Publishes scheduled posts to a client's Instagram professional account and Facebook Page,
 * using the Page token saved by "Connect Instagram and Facebook".
 *
 * Instagram videos take a while to process, so a post can stay "publishing" across several
 * cron runs: the container ids are kept in publish_state and checked again next time.
 */
type Db = SupabaseClient;
type State = { container?: string; children?: string[]; ig_error?: string; fb_error?: string };
type Item = { id: string; kind: "video" | "image"; url: string };
type Post = {
  id: string; business_id: string; caption: string; media_ids: string[]; platforms: Platform[];
  publish_state: State; ig_media_id: string | null; fb_post_id: string | null; attempts: number;
};

const ver = () => process.env.META_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
const MAX_ATTEMPTS = 40; // about 3 hours of 5-minute runs for a slow video
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(method: "GET" | "POST", path: string, token: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/${ver()}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e) } }) }) as unknown as Response);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendly(json?.error?.message ?? `Meta error ${res.status}`));
  return json;
}

function friendly(msg: string) {
  if (/permission|pages_manage_posts|\(#200\)|\(#10\)/i.test(msg)) return `${msg} Reconnect Instagram and Facebook in Settings to allow posting.`;
  if (/aspect ratio/i.test(msg)) return `${msg} Instagram photos must be between 4:5 tall and 1.91:1 wide.`;
  return msg;
}

/* Instagram ------------------------------------------------------------------------------ */
async function igStatus(id: string, token: string): Promise<string> {
  const j = await call("GET", `${id}?fields=status_code,status`, token);
  return j.status_code ?? "IN_PROGRESS";
}

/** Waits up to `ms` for containers to finish. Returns "ok", "pending", or throws on an error. */
async function igWait(ids: string[], token: string, ms: number) {
  const until = Date.now() + ms;
  for (;;) {
    const codes = await Promise.all(ids.map((id) => igStatus(id, token)));
    if (codes.some((c) => c === "ERROR" || c === "EXPIRED")) throw new Error("Instagram couldn't process this media. Check the video is MP4/MOV, under 15 minutes, and the photo is a normal JPEG.");
    if (codes.every((c) => c === "FINISHED" || c === "PUBLISHED")) return "ok" as const;
    if (Date.now() > until) return "pending" as const;
    await sleep(5000);
  }
}

async function igStep(post: Post, items: Item[], igId: string, token: string, state: State): Promise<"ok" | "pending"> {
  if (!state.container) {
    if (items.length === 1) {
      const it = items[0];
      const c = await call("POST", `${igId}/media`, token, it.kind === "video"
        ? { media_type: "REELS", video_url: it.url, caption: post.caption, share_to_feed: true }
        : { image_url: it.url, caption: post.caption });
      state.container = c.id;
    } else {
      if (!state.children) {
        state.children = [];
        for (const it of items) {
          const c = await call("POST", `${igId}/media`, token, it.kind === "video"
            ? { media_type: "VIDEO", video_url: it.url, is_carousel_item: true }
            : { image_url: it.url, is_carousel_item: true });
          state.children.push(c.id);
        }
      }
      if ((await igWait(state.children, token, 45_000)) === "pending") return "pending";
      const c = await call("POST", `${igId}/media`, token, { media_type: "CAROUSEL", children: state.children.join(","), caption: post.caption });
      state.container = c.id;
    }
  }
  if ((await igWait([state.container!], token, 50_000)) === "pending") return "pending";
  const pub = await call("POST", `${igId}/media_publish`, token, { creation_id: state.container! });
  post.ig_media_id = pub.id;
  return "ok";
}

/* Facebook ------------------------------------------------------------------------------- */
async function fbStep(post: Post, items: Item[], pageId: string, token: string) {
  if (items.length === 1 && items[0].kind === "video") {
    const r = await call("POST", `${pageId}/videos`, token, { file_url: items[0].url, description: post.caption });
    return String(r.id);
  }
  if (items.some((i) => i.kind === "video")) throw new Error("Facebook can't mix a video with other items in one post.");
  if (items.length === 1) {
    const r = await call("POST", `${pageId}/photos`, token, { url: items[0].url, message: post.caption });
    return String(r.post_id ?? r.id);
  }
  const ids: string[] = [];
  for (const it of items) ids.push((await call("POST", `${pageId}/photos`, token, { url: it.url, published: false })).id);
  const r = await call("POST", `${pageId}/feed`, token, { message: post.caption, attached_media: ids.map((id) => ({ media_fbid: id })) });
  return String(r.id);
}

/* One post ------------------------------------------------------------------------------- */
export async function processPost(admin: Db, post: Post) {
  const state: State = { ...(post.publish_state ?? {}) };
  const done: Partial<Record<Platform, "ok" | "failed" | "pending">> = {};
  const save = async (extra: Record<string, unknown> = {}) => {
    const status = finalStatus(post.platforms, done);
    const errors = [state.ig_error && `Instagram: ${state.ig_error}`, state.fb_error && `Facebook: ${state.fb_error}`].filter(Boolean).join(" ");
    await admin.from("social_posts").update({
      status, publish_state: state, ig_media_id: post.ig_media_id, fb_post_id: post.fb_post_id,
      error: errors || null, locked_until: null,
      ...(status === "published" || status === "partial" ? { published_at: new Date().toISOString() } : {}),
      ...extra,
    }).eq("id", post.id);
    return status;
  };
  const failAll = (msg: string) => {
    for (const p of post.platforms) { done[p] = "failed"; if (p === "instagram") state.ig_error = msg; else state.fb_error = msg; }
    return save();
  };

  const [{ data: conn }, { data: sec }, { data: rows }] = await Promise.all([
    admin.from("integrations").select("status, config").eq("business_id", post.business_id).eq("provider", "instagram").maybeSingle(),
    admin.from("integration_secrets").select("secret").eq("business_id", post.business_id).eq("provider", "instagram").maybeSingle(),
    admin.from("video_clips").select("id, kind, storage_path").eq("business_id", post.business_id).in("id", post.media_ids),
  ]);
  const token = sec?.secret;
  const cfg: any = conn?.config ?? {};
  if (!token || conn?.status !== "connected") return failAll("Instagram and Facebook aren't connected. Connect them in Settings.");
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const ordered = post.media_ids.map((id) => byId.get(id)).filter(Boolean) as { id: string; kind: "video" | "image"; storage_path: string }[];
  if (ordered.length !== post.media_ids.length) return failAll("A photo or video in this post was deleted from the library.");

  // Meta downloads the files itself, so give it private links that last long enough for video processing.
  const { data: signed } = await admin.storage.from("client-videos").createSignedUrls(ordered.map((o) => o.storage_path), 6 * 3600);
  const items: Item[] = ordered.map((o) => ({ id: o.id, kind: o.kind, url: signed?.find((s) => s.path === o.storage_path)?.signedUrl ?? "" }));
  if (items.some((i) => !i.url)) return failAll("Couldn't open a file in the library.");

  if (post.platforms.includes("facebook")) {
    if (post.fb_post_id) done.facebook = "ok";
    else if (state.fb_error) done.facebook = "failed";
    else if (!cfg.page_id) { state.fb_error = "No Facebook Page connected."; done.facebook = "failed"; }
    else {
      try { post.fb_post_id = await fbStep(post, items, cfg.page_id, token); done.facebook = "ok"; }
      catch (e) { state.fb_error = (e as Error).message; done.facebook = "failed"; }
    }
  }

  if (post.platforms.includes("instagram")) {
    if (post.ig_media_id) done.instagram = "ok";
    else if (state.ig_error) done.instagram = "failed";
    else if (!cfg.ig_id) { state.ig_error = "No Instagram professional account is linked to the connected Page."; done.instagram = "failed"; }
    else {
      try {
        done.instagram = await igStep(post, items, cfg.ig_id, token, state);
        if (done.instagram === "pending" && post.attempts >= MAX_ATTEMPTS) {
          state.ig_error = "Instagram took too long to process the video."; done.instagram = "failed";
        }
      } catch (e) { state.ig_error = (e as Error).message; done.instagram = "failed"; }
    }
  }

  let permalink: string | undefined;
  if (done.instagram === "ok" && post.ig_media_id) {
    permalink = await call("GET", `${post.ig_media_id}?fields=permalink`, token).then((j) => j.permalink).catch(() => undefined);
  }
  return save(permalink ? { ig_permalink: permalink } : {});
}

/** Claim and publish everything that's due. Called by the cron and right after "Post now". */
export async function runDuePosts(admin: Db, limit = 10) {
  const { data, error } = await admin.rpc("claim_due_posts", { p_limit: limit });
  if (error) return { error: error.message, processed: 0 };
  const results: Record<string, number> = {};
  for (const post of (data ?? []) as Post[]) {
    const status = await processPost(admin, post).catch(async (e) => {
      await admin.from("social_posts").update({ status: "failed", error: String((e as Error).message), locked_until: null }).eq("id", post.id);
      return "failed";
    });
    results[status] = (results[status] ?? 0) + 1;
  }
  return { processed: (data ?? []).length, ...results };
}
