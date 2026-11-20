"use server";

import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { briefText, readBrief } from "@/lib/design-brief";
import { renderConcept } from "@/lib/design-concept";

/**
 * A professional website request: draw a concept from the answers, then open a Support request with the
 * brief and the image, so ZDMINC can reply with a quote.
 */
export async function requestDesign(f: FormData) {
  const slug = String(f.get("slug") ?? "");
  const path = `/dashboard/${slug}/website/design`;
  const { supabase, user, business, viewingAsStaff } = await requireMembership(slug);
  if (viewingAsStaff) redirect(`${path}?msg=${encodeURIComponent("Clients send this request themselves")}`);
  const brief = readBrief(f, business.name);
  if ("error" in brief) redirect(`${path}?msg=${encodeURIComponent(brief.error)}`);
  const b = brief as Exclude<typeof brief, { error: string }>;

  const admin = createAdminClient();
  const [{ data: biz }, { data: products }, { data: dom }] = await Promise.all([
    admin.from("businesses").select("logo_url, hero_image_url").eq("id", business.id).maybeSingle<any>(),
    admin.from("products").select("image_url").eq("business_id", business.id).eq("active", true).not("image_url", "is", null).order("featured", { ascending: false }).order("sort_order").limit(3),
    admin.from("business_domains").select("domain").eq("business_id", business.id).limit(1).maybeSingle<any>().then((r) => r, () => ({ data: null })),
  ]);
  const photos = (products ?? []).map((p: any) => p.image_url as string);

  // The concept image, stored with the request (support-files is private to the business and ZDMINC).
  let attachment: { path: string; name: string; type: string; size: number } | null = null;
  try {
    const img = await renderConcept(b, { logo: biz?.logo_url, hero: biz?.hero_image_url ?? photos[0], photos: photos.slice(biz?.hero_image_url ? 0 : 1), domain: dom?.domain });
    const bytes = Buffer.from(await img.arrayBuffer());
    const file = `${business.id}/${Date.now()}-website-concept.png`;
    const up = await admin.storage.from("support-files").upload(file, bytes, { contentType: "image/png", upsert: false });
    if (!up.error) attachment = { path: file, name: "website-concept.png", type: "image/png", size: bytes.length };
  } catch {
    // Still send the brief; the team can draw the concept by hand.
  }

  const who = user.user_metadata?.full_name || user.user_metadata?.name || (user.email ?? "Client").split("@")[0];
  const { data: t, error } = await supabase.from("support_tickets")
    .insert({ business_id: business.id, subject: "Professional website design: please send a quote", category: "website", created_by: user.id })
    .select("id, number").single();
  if (error || !t) redirect(`${path}?msg=${encodeURIComponent(error?.message ?? "Could not send. Please try again.")}`);
  const row = { ticket_id: t!.id, business_id: business.id, author_id: user.id, author_name: who, body: briefText(b).slice(0, 5000) };
  const res = attachment ? await supabase.from("ticket_messages").insert({ ...row, attachments: [attachment] }) : { error: null };
  if (!attachment || res.error) await supabase.from("ticket_messages").insert(row);
  redirect(`/dashboard/${slug}/support?t=${t!.number}&msg=${encodeURIComponent("Sent to ZDMINC with your concept. We'll reply here with a quote, usually within 1 business day.")}`);
}
