import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Find or create a customer by phone without overwriting their CRM stage or history. */
export async function upsertCustomer(
  admin: SupabaseClient,
  businessId: string,
  phone: string,
  opts: { name?: string | null; optIn?: boolean; marketing?: boolean } = {},
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("customers")
    .select("id, name, whatsapp_opt_in, marketing_opt_in")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    // Someone who sent STOP stays opted out until they send START.
    const { data: out } = await admin.from("customers").select("opted_out_at").eq("id", existing.id).maybeSingle();
    const stopped = !!out?.opted_out_at;
    await admin
      .from("customers")
      .update({
        last_seen_at: now,
        name: existing.name ?? opts.name ?? null,
        whatsapp_opt_in: stopped ? false : existing.whatsapp_opt_in || !!opts.optIn,
        marketing_opt_in: stopped ? false : existing.marketing_opt_in || !!opts.marketing,
      })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data: created } = await admin
    .from("customers")
    .insert({ business_id: businessId, phone, name: opts.name ?? null, whatsapp_opt_in: !!opts.optIn, marketing_opt_in: !!opts.marketing, last_seen_at: now })
    .select("id")
    .single();
  return created?.id ?? null;
}

/** STOP / START from the customer. Returns true if their setting actually changed (so we confirm only once). */
export async function setConsent(admin: SupabaseClient, customerId: string, cmd: "stop" | "start"): Promise<boolean> {
  const { data: c, error } = await admin.from("customers").select("opted_out_at").eq("id", customerId).maybeSingle();
  if (error || !c) return false;
  if (cmd === "stop") {
    if (c.opted_out_at) return false;
    await admin.from("customers").update({ opted_out_at: new Date().toISOString(), whatsapp_opt_in: false, marketing_opt_in: false }).eq("id", customerId);
    return true;
  }
  if (!c.opted_out_at) return false;
  await admin.from("customers").update({ opted_out_at: null, whatsapp_opt_in: true, marketing_opt_in: true }).eq("id", customerId);
  return true;
}
