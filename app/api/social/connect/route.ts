import { NextResponse, type NextRequest } from "next/server";
import { requireMembership } from "@/lib/business";
import { loginUrl, makeState, socialConfigured } from "@/lib/social";

/** Starts "Connect Instagram and Facebook" for a business. Owners and admins only. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const { user, role } = await requireMembership(slug);
  const back = new URL(`/dashboard/${slug}/settings`, req.url);
  if (role !== "owner" && role !== "admin") { back.searchParams.set("msg", "Only owners and admins can connect social accounts"); return NextResponse.redirect(back); }
  if (!socialConfigured()) {
    const missing = ["META_APP_ID", "META_APP_SECRET", "NEXT_PUBLIC_SITE_URL"].filter((k) => !process.env[k]?.trim());
    back.searchParams.set("msg", `Social login isn't set up yet. ZDMINC needs to add ${missing.join(" and ") || "the Meta app settings"} in Vercel (Production), then redeploy.`);
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(loginUrl(makeState(slug, user.id)));
}
