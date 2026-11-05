"use server";

import { revalidatePath } from "next/cache";
import { back, migrationHint, requireEditor, str } from "@/lib/crm-actions";
import { TEMPLATE_PARAMS, placeholderCount } from "@/lib/journeys";
import { getIntegration } from "@/lib/payments";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const PURPOSES = ["cart_reminder", "win_back", "order_ready", "broadcast", "other"];
const STATUSES = ["draft", "pending", "approved", "rejected", "paused"];
const page = (slug: string) => `/dashboard/${slug}/whatsapp#templates`;

export async function saveTemplate(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  const name = str(f, "name").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const body = str(f, "body");
  const purpose = PURPOSES.includes(str(f, "purpose")) ? str(f, "purpose") : "other";
  const language = str(f, "language") || "en";
  if (!name || !body) back(page(slug), "Add the template name and its wording");
  const n = placeholderCount(body);
  const params = Array.from({ length: n }, (_, i) => str(f, `p${i + 1}`)).map((p) => (TEMPLATE_PARAMS.includes(p as any) ? p : "name"));
  const { error } = await db.from("message_templates").upsert(
    { business_id: business.id, name, language, body: body.slice(0, 1024), purpose, params, updated_at: new Date().toISOString() },
    { onConflict: "business_id,name,language" },
  );
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(page(slug), error ? migrationHint(error.message) : "Template saved. ZDMINC submits it to Meta for approval.");
}

export async function deleteTemplate(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  await db.from("message_templates").delete().eq("business_id", business.id).eq("id", str(f, "id"));
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(page(slug), "Template removed");
}

/** ZDMINC records what Meta decided. */
export async function setTemplateStatus(f: FormData) {
  const slug = str(f, "slug");
  const { db, business, viewingAsStaff } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  if (!viewingAsStaff) back(page(slug), "ZDMINC updates the approval status");
  const status = STATUSES.includes(str(f, "status")) ? str(f, "status") : "pending";
  await db.from("message_templates").update({ status, rejected_reason: status === "rejected" ? str(f, "reason") || null : null, updated_at: new Date().toISOString() })
    .eq("business_id", business.id).eq("id", str(f, "id"));
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(page(slug), "Status updated");
}

/** Pull approval status from Meta when the WhatsApp connection has the business account id (waba_id). */
export async function syncTemplates(f: FormData) {
  const slug = str(f, "slug");
  const { business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  if (!hasServiceRoleKey()) back(page(slug), "Checking with Meta needs the server key set up");
  const admin = createAdminClient();
  const wa = await getIntegration(admin, business.id, "whatsapp");
  if (!wa?.config.waba_id) back(page(slug), "Ask ZDMINC to add your WhatsApp business account ID so statuses update on their own");
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${wa!.config.waba_id}/message_templates?fields=name,language,status,rejected_reason&limit=200`, {
    headers: { Authorization: `Bearer ${wa!.secret}` }, cache: "no-store",
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) back(page(slug), json?.error?.message ?? "Meta didn't answer");
  const map: Record<string, string> = { APPROVED: "approved", PENDING: "pending", IN_APPEAL: "pending", REJECTED: "rejected", PAUSED: "paused", DISABLED: "paused" };
  let n = 0;
  for (const t of json.data ?? []) {
    const { data } = await admin.from("message_templates").update({
      status: map[t.status] ?? "pending", rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null, updated_at: new Date().toISOString(),
    }).eq("business_id", business.id).eq("name", t.name).eq("language", t.language).select("id");
    n += data?.length ?? 0;
  }
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(page(slug), `Checked with Meta. ${n} template${n === 1 ? "" : "s"} updated.`);
}

const auto = (slug: string) => `/dashboard/${slug}/whatsapp#automations`;
const needs0015 = (msg?: string) => (msg ? "This needs a database update: run supabase/migrations/0015_priority_features.sql." : null);

export async function saveAway(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  const { error } = await db.from("businesses").update({ away_enabled: f.get("away_enabled") === "on", away_message: str(f, "away_message").slice(0, 600) || null }).eq("id", business.id);
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(auto(slug), needs0015(error?.message) ?? (f.get("away_enabled") === "on" ? "Away message is on" : "Away message is off"));
}

export async function addFaq(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  const { splitKeywords } = await import("@/lib/hours");
  const keywords = splitKeywords(str(f, "keywords"));
  const answer = str(f, "answer").slice(0, 1000);
  if (!keywords.length || !answer) back(auto(slug), "Add at least one keyword and the answer");
  const { error } = await db.from("whatsapp_faqs").insert({ business_id: business.id, keywords, answer });
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(auto(slug), needs0015(error?.message) ?? `The bot now answers "${keywords[0]}"`);
}

export async function toggleFaq(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  await db.from("whatsapp_faqs").update({ active: f.get("active") === "true" }).eq("business_id", business.id).eq("id", str(f, "id"));
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(auto(slug));
}

export async function deleteFaq(f: FormData) {
  const slug = str(f, "slug");
  const { db, business } = await requireEditor(slug, `/dashboard/${slug}/whatsapp`);
  await db.from("whatsapp_faqs").delete().eq("business_id", business.id).eq("id", str(f, "id"));
  revalidatePath(`/dashboard/${slug}/whatsapp`);
  back(auto(slug), "Answer removed");
}
