"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { checkPost, type MediaKind, type Platform } from "@/lib/posts";
import { runDuePosts } from "@/lib/publish";

const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
const page = (slug: string) => `/dashboard/${slug}/content`;
const canPost = (role: string) => role === "owner" || role === "admin";
const db = (supabase: Awaited<ReturnType<typeof requireMembership>>["supabase"]) =>
  hasServiceRoleKey() ? createAdminClient() : supabase;

/** Step 1 of an upload: a one-time signed URL so the browser sends the file straight to private storage. */
export async function getContentUploadUrl(slug: string, fileName: string) {
  const { supabase, business } = await requireMembership(slug);
  const path = `${business.id}/uploads/${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await db(supabase).storage.from("client-videos").createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "Could not start upload" };
  return { path, token: data.token };
}

/** Step 2: add the file to the library once it's in storage. */
export async function registerContent(slug: string, path: string, title: string, kind: MediaKind, seconds: number | null) {
  const { supabase, business, user } = await requireMembership(slug);
  if (!path.startsWith(`${business.id}/uploads/`) || !["video", "image"].includes(kind)) return { error: "Bad upload" };
  const { error } = await db(supabase).from("video_clips").insert({
    business_id: business.id, shoot_id: null, storage_path: path, title: title.slice(0, 120) || (kind === "image" ? "Photo" : "Video"),
    kind, source: "client", uploaded_by: user.id, status: "published",
    seconds: kind === "video" && seconds && seconds > 0 ? Math.min(600, Math.round(seconds)) : null,
  });
  if (error) return { error: error.message };
  revalidatePath(page(slug));
  return { ok: true };
}

/** Clients can delete their own uploads, unless a scheduled post still needs them. */
export async function deleteContent(slug: string, id: string) {
  const { supabase, business, role } = await requireMembership(slug);
  if (!canPost(role)) return { error: "Only owners and admins can delete." };
  const admin = db(supabase);
  const { data: item } = await admin.from("video_clips").select("id, storage_path, source").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!item) return { error: "Not found" };
  if (item.source !== "client") return { error: "ZDMINC clips can't be deleted here. Ask the team to hide it." };
  const { count } = await admin.from("social_posts").select("id", { count: "exact", head: true })
    .eq("business_id", business.id).in("status", ["scheduled", "publishing"]).contains("media_ids", [id]);
  if (count) return { error: "This is in a scheduled post. Cancel that post first." };
  await admin.storage.from("client-videos").remove([item.storage_path]);
  await admin.from("video_clips").delete().eq("id", id);
  revalidatePath(page(slug));
  return { ok: true };
}

/** Pick a ZDMINC clip for the team to post (the original "Choose for posting"). */
export async function toggleClip(slug: string, id: string, chosen: boolean) {
  const { supabase } = await requireMembership(slug);
  await supabase.rpc("choose_clip", { p_clip: id, p_chosen: chosen });
  revalidatePath(page(slug));
}

export async function schedulePost(slug: string, input: { mediaIds: string[]; platforms: Platform[]; caption: string; when: string; now: boolean }) {
  const { supabase, business, user, role, viewingAsStaff } = await requireMembership(slug);
  if (!canPost(role)) return { error: "Only owners and admins can schedule posts." };
  const admin = db(supabase);
  const ids = [...new Set(input.mediaIds)];
  const { data: rows } = await admin.from("video_clips").select("id, kind, status").eq("business_id", business.id).in("id", ids);
  const byId = new Map((rows ?? []).filter((r) => r.status === "published").map((r) => [r.id, r.kind as MediaKind]));
  if (byId.size !== ids.length) return { error: "Some of those items aren't in your library any more." };
  const when = input.now ? new Date() : new Date(input.when);
  const caption = input.caption.trim();
  const platforms = [...new Set(input.platforms)];
  const problem = checkPost({ kinds: ids.map((id) => byId.get(id)!), platforms, caption, when });
  if (problem) return { error: problem };

  const { data: conn } = await admin.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "instagram").maybeSingle();
  const cfg: any = conn?.config ?? {};
  if (conn?.status !== "connected") return { error: "Connect Instagram and Facebook in Settings first." };
  if (platforms.includes("instagram") && !cfg.ig_id) return { error: "No Instagram professional account is linked to your Facebook Page." };

  const { error } = await admin.from("social_posts").insert({
    business_id: business.id, caption, media_ids: ids, platforms, scheduled_at: when.toISOString(),
    created_by: user.id, created_by_name: viewingAsStaff ? `ZDMINC (${user.email})` : user.email,
  });
  if (error) return { error: error.message };
  if (input.now) after(() => runDuePosts(admin, 3).then(() => undefined));
  revalidatePath(page(slug));
  revalidatePath(`/dashboard/${slug}/marketing`);
  return { ok: true };
}

export async function cancelPost(f: FormData) {
  const slug = String(f.get("slug"));
  const { supabase, business, role } = await requireMembership(slug);
  if (!canPost(role)) return;
  await db(supabase).from("social_posts").update({ status: "cancelled" })
    .eq("id", String(f.get("id"))).eq("business_id", business.id).eq("status", "scheduled");
  revalidatePath(page(slug));
}

/** Try a failed post again from where it stopped (platforms that already worked aren't posted twice). */
export async function retryPost(f: FormData) {
  const slug = String(f.get("slug"));
  const { supabase, business, role } = await requireMembership(slug);
  if (!canPost(role)) return;
  const admin = db(supabase);
  const { data: p } = await admin.from("social_posts").select("id, publish_state").eq("id", String(f.get("id"))).eq("business_id", business.id).in("status", ["failed", "partial"]).maybeSingle();
  if (!p) return;
  // Clear the errors. A failed Instagram container can't be reused, so Instagram starts fresh.
  const s = (p.publish_state ?? {}) as { container?: string; children?: string[]; ig_error?: string };
  const state = s.ig_error ? {} : { container: s.container, children: s.children };
  await admin.from("social_posts").update({ status: "scheduled", scheduled_at: new Date().toISOString(), publish_state: state, error: null, attempts: 0 }).eq("id", p.id);
  after(() => runDuePosts(admin, 3).then(() => undefined));
  revalidatePath(page(slug));
}

/** Use / Skip / undo on a ZDMINC clip. Any team member can decide. */
export async function decideClip(slug: string, id: string, decision: "use" | "skip" | "new") {
  const { supabase } = await requireMembership(slug);
  await supabase.rpc("decide_clip", { p_clip: id, p_decision: decision });
  revalidatePath(page(slug));
}

/**
 * "Send chosen to calendar": one post per chosen clip (a Reel on Instagram, a video on Facebook),
 * using the clip's caption, spaced `everyDays` apart from `start`.
 */
export async function sendChosenToCalendar(slug: string, input: { clipIds: string[]; start: string; everyDays: number; platforms: Platform[] }) {
  const { supabase, business, user, role, viewingAsStaff } = await requireMembership(slug);
  if (!canPost(role)) return { error: "Only owners and admins can add posts to the calendar." };
  const ids = [...new Set(input.clipIds)].slice(0, 60);
  if (!ids.length) return { error: "Choose some videos first." };
  const every = Math.min(14, Math.max(1, Math.round(input.everyDays || 1)));
  const start = new Date(input.start);
  const platforms = [...new Set(input.platforms)];
  const admin = db(supabase);

  const [{ data: clips }, { data: conn }, { data: active }] = await Promise.all([
    admin.from("video_clips").select("id, kind, caption, chosen, status").eq("business_id", business.id).in("id", ids),
    admin.from("integrations").select("status, config").eq("business_id", business.id).eq("provider", "instagram").maybeSingle(),
    admin.from("social_posts").select("media_ids").eq("business_id", business.id).in("status", ["scheduled", "publishing", "published", "partial"]),
  ]);
  if (conn?.status !== "connected") return { error: "Connect Instagram and Facebook in Settings first." };
  if (platforms.includes("instagram") && !(conn.config as any)?.ig_id) return { error: "No Instagram professional account is linked to your Facebook Page." };
  const already = new Set((active ?? []).flatMap((p) => p.media_ids as string[]));
  const order = new Map(ids.map((id, i) => [id, i]));
  const todo = (clips ?? []).filter((c) => c.status === "published" && c.chosen && !already.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  if (!todo.length) return { error: "Those videos are already on the calendar." };

  const rows = [];
  for (let i = 0; i < todo.length; i++) {
    const when = new Date(start.getTime() + i * every * 864e5);
    const caption = (todo[i].caption ?? "").trim();
    const problem = checkPost({ kinds: [todo[i].kind as MediaKind], platforms, caption, when });
    if (problem) return { error: problem };
    rows.push({
      business_id: business.id, caption, media_ids: [todo[i].id], platforms, scheduled_at: when.toISOString(),
      created_by: user.id, created_by_name: viewingAsStaff ? `ZDMINC (${user.email})` : user.email,
    });
  }
  const { error } = await admin.from("social_posts").insert(rows);
  if (error) return { error: error.message };
  revalidatePath(page(slug));
  revalidatePath(`/dashboard/${slug}/marketing`);
  return { ok: true, count: rows.length, last: rows[rows.length - 1].scheduled_at };
}
