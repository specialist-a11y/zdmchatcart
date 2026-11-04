import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMetaSignature } from "@/lib/whatsapp";
import { fillDm, matchRule, parseComments, pickReply, publicReply, type Rule } from "@/lib/autoreply";
import { privateReply, replyToComment } from "@/lib/instagram";
import { shortUrl } from "@/lib/links";

export const runtime = "nodejs";

/** Meta webhook check (same verify token as WhatsApp). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** New Instagram comments: if one matches a client's keyword, reply publicly and DM the link. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.META_APP_SECRET;
  if (!secret || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const admin = createAdminClient();

  for (const c of parseComments(payload)) {
    // Which client owns this Instagram account?
    const { data: integ } = await admin.from("integrations").select("business_id, config")
      .eq("provider", "instagram").eq("status", "connected").filter("config->>ig_id", "eq", c.igUserId).maybeSingle<any>();
    if (!integ) continue;
    if (c.fromId && c.fromId === c.igUserId) continue; // the shop's own comments
    const businessId = integ.business_id as string;

    const { data: rules } = await admin.from("ig_autoreplies")
      .select("id, keyword, media_id, active, public_replies, dm_text, daily_cap, short_links(code, ref)")
      .eq("business_id", businessId).eq("active", true);
    const rule = matchRule(c.text, c.mediaId, (rules ?? []) as (Rule & { daily_cap: number; short_links: any })[]);
    if (!rule) continue;

    // Claim the comment first: Meta retries webhooks, and this unique insert stops a second reply.
    const base = { business_id: businessId, rule_id: rule.id, comment_id: c.commentId, media_id: c.mediaId, from_id: c.fromId, from_username: c.fromUsername, text: c.text.slice(0, 500) };
    const { data: claimed, error: claimErr } = await admin.from("ig_comment_events").insert({ ...base, status: "error", error: "processing" }).select("id").maybeSingle();
    if (claimErr || !claimed) continue;
    const done = (status: string, error: string | null = null) => admin.from("ig_comment_events").update({ status, error }).eq("id", claimed.id);

    // Same person, same keyword, already sent in the last 7 days: don't DM again.
    if (c.fromId) {
      const { count } = await admin.from("ig_comment_events").select("id", { count: "exact", head: true })
        .eq("rule_id", rule.id).eq("from_id", c.fromId).in("status", ["sent", "dm_only"]).gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
      if ((count ?? 0) > 0) { await done("already_sent"); continue; }
    }
    const { count: today } = await admin.from("ig_comment_events").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).in("status", ["sent", "dm_only"]).gte("created_at", new Date(Date.now() - 864e5).toISOString());
    if ((today ?? 0) >= rule.daily_cap) { await done("over_cap", `Daily limit of ${rule.daily_cap} reached`); continue; }

    const { data: sec } = await admin.from("integration_secrets").select("secret").eq("business_id", businessId).eq("provider", "instagram").maybeSingle();
    if (!sec?.secret || !integ.config?.page_id) { await done("error", "Instagram not connected"); continue; }

    const { data: dom } = await admin.from("business_domains").select("domain").eq("business_id", businessId).eq("status", "active").limit(1).maybeSingle();
    const { data: biz } = await admin.from("businesses").select("slug").eq("id", businessId).single();
    const link = rule.short_links?.code
      ? shortUrl(rule.short_links.code, dom?.domain)
      : dom?.domain ? `https://${dom.domain}/` : `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/s/${biz?.slug}`;

    const dm = await privateReply(sec.secret, integ.config.page_id, c.commentId, fillDm(rule.dm_text, { username: c.fromUsername, link }));
    const pub = await replyToComment(sec.secret, c.commentId, publicReply(c.fromUsername, pickReply(rule.public_replies, c.commentId)));
    await done(dm.ok && pub.ok ? "sent" : dm.ok ? "dm_only" : pub.ok ? "reply_only" : "error",
      [dm.ok ? null : `DM: ${dm.error}`, pub.ok ? null : `Reply: ${pub.error}`].filter(Boolean).join(" · ") || null);
  }
  return NextResponse.json({ ok: true });
}
