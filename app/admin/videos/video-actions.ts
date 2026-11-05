"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { logEvent, notifyClient } from "@/lib/zdm-billing";
import { after } from "next/server";
import { autoCaption, captionsEnabled } from "@/lib/captions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "clip.mp4";
const db = (supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"]) =>
  hasServiceRoleKey() ? createAdminClient() : supabase;

export async function createShoot(f: FormData) {
  const { supabase, staff } = await requireStaff();
  const businessId = str(f, "business_id");
  const month = str(f, "month"); // YYYY-MM
  if (!businessId || !/^\d{4}-\d{2}$/.test(month)) redirect(`/admin/videos?msg=${encodeURIComponent("Pick a client and month")}`);
  const admin = db(supabase);
  const { data: shoot } = await admin.from("video_shoots").insert({
    business_id: businessId, month: `${month}-01`, shoot_date: str(f, "shoot_date") || null, location: str(f, "location") || null, notes: str(f, "notes") || null,
  }).select("id").single();
  await logEvent(admin, businessId, { id: staff.user_id, name: staff.name }, "video", `Shoot added for ${month}${str(f, "shoot_date") ? `, filming ${str(f, "shoot_date")}` : ""}`);
  redirect(`/admin/videos?client=${businessId}&shoot=${shoot!.id}`);
}

/** Where an upload goes: into a shoot, or straight into a client's library (photos, extra clips). */
export type Target = { shootId: string } | { businessId: string };

async function resolveTarget(admin: ReturnType<typeof db>, t: Target) {
  if ("shootId" in t) {
    const { data: shoot } = await admin.from("video_shoots").select("id, business_id, published_at").eq("id", t.shootId).maybeSingle();
    return shoot ? { businessId: shoot.business_id as string, shootId: shoot.id as string, folder: `${shoot.business_id}/${shoot.id}/`, published: Boolean(shoot.published_at) } : null;
  }
  const { data: b } = await admin.from("businesses").select("id").eq("id", t.businessId).maybeSingle();
  return b ? { businessId: b.id as string, shootId: null, folder: `${b.id}/zdm/`, published: true } : null;
}

/** Step 1 of an upload: a one-time signed URL so the browser sends the file straight to storage. */
export async function getUploadUrl(target: Target, fileName: string) {
  const { supabase } = await requireStaff();
  const admin = db(supabase);
  const t = await resolveTarget(admin, target);
  if (!t) return { error: "Client or shoot not found" };
  const path = `${t.folder}${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await admin.storage.from("client-videos").createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "Could not start upload" };
  return { path, token: data.token };
}

/** Step 2: record the item once the file is in storage. Captions are written by AI in the background. */
export async function registerClip(target: Target, input: {
  path: string; title: string; kind: "video" | "image"; seconds: number | null; width: number | null; height: number | null; thumbPath: string | null;
}) {
  const { supabase } = await requireStaff();
  const admin = db(supabase);
  const t = await resolveTarget(admin, target);
  if (!t || !input.path.startsWith(t.folder) || (input.thumbPath && !input.thumbPath.startsWith(t.folder))) return { error: "Bad upload path" };
  const n = (v: number | null) => (v && v > 0 ? Math.round(v) : null);
  const { data, error } = await admin.from("video_clips").insert({
    business_id: t.businessId, shoot_id: t.shootId, storage_path: input.path, title: input.title.slice(0, 120) || "Clip",
    seconds: input.kind === "video" && input.seconds && input.seconds > 0 ? Math.min(600, Math.round(input.seconds)) : null,
    kind: input.kind === "image" ? "image" : "video", source: "zdm",
    width: n(input.width), height: n(input.height), thumb_path: input.thumbPath,
    status: t.published ? "published" : "ready",
  }).select("id").single();
  if (error) return { error: error.message };
  if (captionsEnabled()) after(() => autoCaption(admin, [data.id]));
  return { ok: true };
}

export async function updateClip(f: FormData) {
  const { supabase } = await requireStaff();
  const admin = db(supabase);
  const id = str(f, "id");
  const status = str(f, "status");
  const patch: Record<string, unknown> = { title: str(f, "title") || "Clip", caption: str(f, "caption") || null };
  if (["ready", "published", "hidden"].includes(status)) patch.status = status;
  const { data } = await admin.from("video_clips").update(patch).eq("id", id).select("business_id, shoot_id").single();
  redirect(`/admin/videos?client=${data?.business_id}&shoot=${data?.shoot_id ?? "extras"}&msg=Saved`);
}

export async function deleteClip(f: FormData) {
  const { supabase } = await requireStaff();
  const admin = db(supabase);
  const { data: clip } = await admin.from("video_clips").select("id, business_id, shoot_id, storage_path, thumb_path").eq("id", str(f, "id")).single();
  if (clip) {
    await admin.storage.from("client-videos").remove([clip.storage_path, ...(clip.thumb_path ? [clip.thumb_path] : [])]);
    await admin.from("video_clips").delete().eq("id", clip.id);
  }
  redirect(`/admin/videos?client=${clip?.business_id}&shoot=${clip?.shoot_id ?? "extras"}&msg=Deleted`);
}

export async function publishShoot(f: FormData) {
  const { supabase, staff } = await requireStaff();
  const admin = db(supabase);
  const shootId = str(f, "shoot_id");
  const { data: shoot } = await admin.from("video_shoots").update({ published_at: new Date().toISOString() }).eq("id", shootId).select("id, business_id, month").single();
  if (!shoot) redirect("/admin/videos?msg=Shoot not found");
  const { data: clips } = await admin.from("video_clips").update({ status: "published" }).eq("shoot_id", shootId).eq("status", "ready").select("id");
  const n = clips?.length ?? 0;
  const month = new Date(`${shoot!.month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" });
  await logEvent(admin, shoot!.business_id, { id: staff.user_id, name: staff.name }, "video_publish", `Published ${n} ${month} clips to the client's library`);
  let note = `Published ${n} clips`;
  if (f.get("notify") === "on") {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const { data: b } = await admin.from("businesses").select("slug").eq("id", shoot!.business_id).single();
    const res = await notifyClient(admin, shoot!.business_id, `Your ${month} videos are ready: ${n} new clips. Pick or schedule them here: ${site}/dashboard/${b?.slug}/content`, { id: staff.user_id, name: staff.name });
    note += res.ok ? " and told the client on WhatsApp" : `. WhatsApp not sent: ${res.error}`;
  }
  redirect(`/admin/videos?client=${shoot!.business_id}&shoot=${shootId}&msg=${encodeURIComponent(note)}`);
}

/** ZDMINC answers a clip comment, and can mark a change request done. */
export async function answerClipComment(f: FormData) {
  const { staff } = await requireStaff();
  const admin = createAdminClient();
  const id = String(f.get("id") ?? "");
  const { data: c } = await admin.from("clip_comments").select("id, clip_id, business_id").eq("id", id).maybeSingle();
  if (!c) redirect(`/admin/videos?msg=${encodeURIComponent("Comment not found")}`);
  const body = String(f.get("body") ?? "").trim().slice(0, 2000);
  if (body) await admin.from("clip_comments").insert({ clip_id: c!.clip_id, business_id: c!.business_id, author_name: staff.name, from_staff: true, kind: "comment", body });
  if (f.get("done") === "on") await admin.from("clip_comments").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/videos");
  redirect(`/admin/videos?client=${c!.business_id}&msg=${encodeURIComponent(f.get("done") === "on" ? "Marked done" : "Reply sent")}`);
}
