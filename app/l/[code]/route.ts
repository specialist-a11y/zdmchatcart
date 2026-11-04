import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { linkTarget } from "@/lib/links";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Short link: counts the click and sends the visitor to the shop with its tracking code. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/i.test(code)) return NextResponse.redirect(new URL("/", site));
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await supabase.rpc("follow_short_link", { p_code: code.toLowerCase() });
  const hit = Array.isArray(data) ? data[0] : null;
  const shop = new URL(req.url).searchParams.get("shop");
  if (!hit || (shop && hit.slug !== shop)) return NextResponse.redirect(new URL("/", site));
  return NextResponse.redirect(linkTarget(site, hit.slug, hit.ref, hit.domain), { status: 302, headers: { "Cache-Control": "no-store" } });
}
