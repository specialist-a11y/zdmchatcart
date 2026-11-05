"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent, notifyClient } from "@/lib/zdm-billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const safeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "clip.mp4";

export async function createShoot(f: FormData) {
  const { staff } = await requireStaff();
  const businessId = str(f, "business_id");
  const month = str(f, "month"); // YYYY-MM
  if (!businessId || !/^\d{4}-\d{2}$/.test(month)) redirect(`/admin/videos?msg=${encodeURIComponent("Pick a client and month")}`);
  const admin = createAdminClient();
  const { data: shoot } = await admin.from("video_shoots").insert({
    business_id: businessId, month: `${month}-01`, shoot_date: str(f, "shoot_date") || null, location: str(f, "location") || null, notes: str(f, "notes") || null,
  }).select("id").single();
  await logEvent(admin, businessId, { id: staff.user_id, name: staff.name }, "video", `Shoot added for ${month}${str(f, "shoot_date") ? `, filming ${str(f, "shoot_date")}` : ""}`);
  redirect(`/admin/videos?client=${businessId}&shoot=${shoot!.id}`);
}

/** Step 1 of an upload: a one-time signed URL so the browser sends the file straight to storage. */
export async function getUploadUrl(shootId: string, fileName: string) {
  await requireStaff();
  const admin = createAdminClient();
  const { data: shoot } = await admin.from("video_shoots").select("id, business_id").eq("id", shootId).single();
  if (!shoot) return { error: "Shoot not found" };
  const path = `${shoot.business_id}/${shoot.id}/${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await admin.storage.from("client-videos").createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "Could not start upload" };
  return { path, token: data.token };
}

/** Step 2: record the clip once the file is in storage. */
export async function registerClip(shootId: string, path: string, title: string, seconds: number | null, kind: "video" | "image" = "video") {
  await requireStaff();
  const admin = createAdminClient();
  const { data: shoot } = await admin.from("video_shoots").select("id, business_id, published_at").eq("id", shootId).single();
  if (!shoot || !path.startsWith(`${shoot.business_id}/${shoot.id}/`)) return { error: "Bad upload path" };
  const { error } = await admin.from("video_clips").insert({
    business_id: shoot.business_id, shoot_id: shoot.id, storage_path: path, title: title.slice(0, 120) || "Clip",
    seconds: kind === "video" && seconds && seconds > 0 ? Math.min(600, Math.round(seconds)) : null,
    kind: kind === "image" ? "image" : "video", source: "zdm",
    status: shoot.published_at ? "published" : "ready",
  });
  return error ? { error: error.message } : { ok: true };
}

export async function updateClip(f: FormData) {
  await requireStaff();
  const admin = createAdminClient();
  const id = str(f, "id");
  const status = str(f, "status");
  const patch: Record<string, unknown> = { title: str(f, "title") || "Clip", caption: str(f, "caption") || null };
  if (["ready", "published", "hidden"].includes(status)) patch.status = status;
  const { data } = await admin.from("video_clips").update(patch).eq("id", id).select("business_id, shoot_id").single();
  redirect(`/admin/videos?client=${data?.business_id}&shoot=${data?.shoot_id}&msg=Saved`);
}

export async function deleteClip(f: FormData) {
  await requireStaff();
  const admin = createAdminClient();
  const { data: clip } = await admin.from("video_clips").select("id, business_id, shoot_id, storage_path").eq("id", str(f, "id")).single();
  if (clip) {
    await admin.storage.from("client-videos").remove([clip.storage_path]);
    await admin.from("video_clips").delete().eq("id", clip.id);
  }
  redirect(`/admin/videos?client=${clip?.business_id}&shoot=${clip?.shoot_id}&msg=Deleted`);
}

export async function publishShoot(f: FormData) {
  const { staff } = await requireStaff();
  const admin = createAdminClient();
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
