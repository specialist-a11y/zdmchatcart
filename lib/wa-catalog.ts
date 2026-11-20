import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegration, sendFromBusiness } from "./payments";
import { sendWhatsAppImage } from "./whatsapp";
import { catalogCaption, whatsappImage } from "./wa-intents";

const MAX_PHOTOS = 12;

/**
 * Send the shop's catalog on WhatsApp: one photo per item with its name, price and description,
 * then a closing message with the shop link. Items without a JPEG/PNG photo are listed in that message.
 */
export async function sendCatalog(admin: SupabaseClient, businessId: string, to: string, customerId: string | null, shopLink: string) {
  const wa = await getIntegration(admin, businessId, "whatsapp");
  if (!wa?.config.phone_number_id) return { ok: false, sent: 0 };
  const { data: b } = await admin.from("businesses").select("currency").eq("id", businessId).maybeSingle();
  const cur = b?.currency ?? "BBD";
  let { data: products, error } = await admin.from("products")
    .select("id, name, price, description, image_url, rental, rental_unit").eq("business_id", businessId).eq("active", true)
    .order("featured", { ascending: false }).order("sort_order").order("created_at").limit(40) as { data: any[] | null; error: any };
  if (error) ({ data: products } = await admin.from("products").select("id, name, price, description, image_url").eq("business_id", businessId).eq("active", true).order("sort_order").limit(40) as any);

  let sent = 0;
  const rest: string[] = [];
  for (const p of products ?? []) {
    const caption = catalogCaption(p, cur);
    if (sent < MAX_PHOTOS && whatsappImage(p.image_url)) {
      const res = await sendWhatsAppImage({ phoneNumberId: wa.config.phone_number_id, accessToken: wa.secret, to, link: p.image_url, caption });
      if (res.ok) {
        sent++;
        await admin.from("messages").insert({ business_id: businessId, customer_id: customerId, channel: "whatsapp", direction: "out", body: `[Photo] ${caption}`, external_id: res.id ?? null });
        continue;
      }
    }
    rest.push(caption.replace(/\n/g, " · "));
  }
  const close = `${rest.length ? `${sent ? "Also available" : "Here's what we have"}:\n${rest.map((r) => `• ${r}`).join("\n")}\n\n` : ""}See everything and book here: ${shopLink}`;
  await sendFromBusiness(admin, businessId, to, close, { customerId });
  return { ok: true, sent };
}
