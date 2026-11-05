import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Shop visit or cart start, sent by the shop page with sendBeacon. Writes through track_shop_event only. */
export async function POST(req: Request) {
  const b: any = await req.json().catch(() => null);
  if (!b || typeof b.slug !== "string" || !["visit", "cart"].includes(b.kind)) return new NextResponse(null, { status: 204 });
  const supabase = await createClient();
  await supabase.rpc("track_shop_event", {
    p_slug: b.slug.slice(0, 41), p_kind: b.kind, p_source: String(b.source ?? "direct").slice(0, 20), p_ref: b.ref ? String(b.ref).slice(0, 60) : null,
  });
  return new NextResponse(null, { status: 204 });
}
