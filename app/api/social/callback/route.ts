import { NextResponse, type NextRequest } from "next/server";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { pagesFromCode, pickPage, readState } from "@/lib/social";
import { subscribePage } from "@/lib/instagram";

/** Meta sends the client back here after they approve. Saves the Page and Instagram account. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = readState(sp.get("state") ?? "");
  if (!state) return NextResponse.redirect(new URL("/dashboard?msg=That social login link expired. Try again.", req.url));
  const { user, business, role } = await requireMembership(state.slug);
  const back = (msg: string) => NextResponse.redirect(new URL(`/dashboard/${state.slug}/settings?msg=${encodeURIComponent(msg)}#social`, req.url));
  if (user.id !== state.userId || (role !== "owner" && role !== "admin")) return back("Please start the connection again from Settings.");
  if (sp.get("error")) return back("Connection cancelled. Nothing was changed.");
  const code = sp.get("code");
  if (!code) return back("Meta didn't send a code. Try again.");

  try {
    const pages = await pagesFromCode(code);
    const page = pickPage(pages);
    if (!page) return back("No Facebook Page found on that login. Create a Page, link your Instagram professional account to it, then connect again.");
    const ig = page.instagram_business_account;
    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin.from("integrations").upsert({
      business_id: business.id, provider: "instagram", status: "connected",
      config: {
        page_id: page.id, page_name: page.name,
        ig_id: ig?.id ?? null, ig_username: ig?.username ?? null, ig_followers: ig?.followers_count ?? null,
        pages: pages.map((p) => ({ id: p.id, name: p.name, ig: p.instagram_business_account?.username ?? null })),
        connected_by: user.id, connected_at: now,
      },
    }, { onConflict: "business_id,provider" });
    await admin.from("integration_secrets").upsert({ business_id: business.id, provider: "instagram", secret: page.access_token, updated_at: now });
    // Turn on comment and message webhooks for this Page (used by Instagram auto-replies).
    await subscribePage(page.access_token, page.id).catch(() => false);
    // Fill the shop page's social links if they're empty.
    const patch: Record<string, string> = {};
    if (!business.instagram && ig?.username) patch.instagram = "@" + ig.username;
    if (!business.facebook) patch.facebook = page.id;
    if (Object.keys(patch).length) await admin.from("businesses").update(patch).eq("id", business.id);
    return back(ig?.username ? `Connected @${ig.username} and ${page.name}` : `Connected ${page.name}. No Instagram professional account is linked to that Page yet.`);
  } catch (e) {
    return back(`Meta said: ${(e as Error).message}`);
  }
}
