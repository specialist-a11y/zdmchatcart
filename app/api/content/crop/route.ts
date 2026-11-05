import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/business";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { cropVideo } from "@/lib/video-crop";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Crops an uploaded horizontal video to 4:5 or 9:16. The browser uploads the original first,
 * then calls this with the frame the client chose; the original is replaced by the cropped file.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = String(body?.slug ?? "");
  const path = String(body?.path ?? "");
  const r = body?.rect;
  if (!slug || !path || !r || ![r.x, r.y, r.w, r.h].every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { supabase, business } = await requireMembership(slug);
  if (!path.startsWith(`${business.id}/uploads/`)) return NextResponse.json({ error: "Bad path" }, { status: 400 });

  const admin = hasServiceRoleKey() ? createAdminClient() : supabase;
  const bucket = admin.storage.from("client-videos");
  const { data: file, error } = await bucket.download(path);
  if (error || !file) return NextResponse.json({ error: "Couldn't read the upload" }, { status: 404 });
  if (file.size > 500 * 1024 * 1024) return NextResponse.json({ error: "That video is too big to crop here (500 MB max). Crop it on your phone first." }, { status: 413 });

  try {
    const out = await cropVideo(new Uint8Array(await file.arrayBuffer()), { x: r.x, y: r.y, w: r.w, h: r.h });
    const newPath = path.replace(/\.[^./]+$/, "") + "-cropped.mp4";
    const up = await bucket.upload(newPath, out.data, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await bucket.remove([path]);
    return NextResponse.json({ path: newPath, width: out.width, height: out.height });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
