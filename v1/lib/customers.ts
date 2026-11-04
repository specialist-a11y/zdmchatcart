import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Find or create a customer by phone without overwriting their CRM stage or history. */
export async function upsertCustomer(
  admin: SupabaseClient,
  businessId: string,
  phone: string,
  opts: { name?: string | null; optIn?: boolean } = {},
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("customers")
    .select("id, name, whatsapp_opt_in")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    await admin
      .from("customers")
      .update({
        last_seen_at: now,
        name: existing.name ?? opts.name ?? null,
        whatsapp_opt_in: existing.whatsapp_opt_in || !!opts.optIn,
      })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data: created } = await admin
    .from("customers")
    .insert({ business_id: businessId, phone, name: opts.name ?? null, whatsapp_opt_in: !!opts.optIn, last_seen_at: now })
    .select("id")
    .single();
  return created?.id ?? null;
}
