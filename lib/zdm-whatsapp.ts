import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insideServiceWindow, sendWhatsAppTemplate, sendWhatsAppText, type InboundText } from "./whatsapp";
import type { Actor } from "./zdm-billing";

/**
 * ZDMINC's own WhatsApp number, used by the team to talk to client owners.
 * Env: ZDM_WA_PHONE_NUMBER_ID, ZDM_WA_TOKEN, and optionally ZDM_WA_TEMPLATE
 * (an approved utility template with one body variable, e.g. "Hi {{1}}, the ZDMINC team has a message for you. Reply here to chat.").
 */
type Admin = SupabaseClient;
export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function zdmWhatsApp() {
  const phoneNumberId = process.env.ZDM_WA_PHONE_NUMBER_ID;
  const accessToken = process.env.ZDM_WA_TOKEN;
  return phoneNumberId && accessToken ? { phoneNumberId, accessToken, template: process.env.ZDM_WA_TEMPLATE || null } : null;
}

export async function findClientByPhone(admin: Admin, phone: string) {
  const { data } = await admin.from("businesses").select("id, name").eq("contact_phone", digits(phone)).limit(1).maybeSingle();
  return data;
}

export async function recordZdmInbound(admin: Admin, msg: InboundText) {
  const phone = digits(msg.from);
  const client = await findClientByPhone(admin, phone);
  await admin.from("zdm_wa_messages").insert({
    phone, business_id: client?.id ?? null, contact_name: msg.name ?? null,
    direction: "in", body: msg.text, status: "received", external_id: msg.messageId,
  });
  // They replied, so the 24-hour window is open: deliver anything that was waiting behind a template.
  const wa = zdmWhatsApp();
  if (!wa) return;
  const { data: queued } = await admin.from("zdm_wa_messages").select("id, body").eq("phone", phone).eq("pending", true).order("created_at");
  for (const q of queued ?? []) {
    const res = await sendWhatsAppText({ phoneNumberId: wa.phoneNumberId, accessToken: wa.accessToken, to: phone, body: q.body });
    await admin.from("zdm_wa_messages").update({ pending: false, status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, external_id: res.id ?? null, kind: "text" }).eq("id", q.id);
  }
}

export async function lastInbound(admin: Admin, phone: string) {
  const { data } = await admin.from("zdm_wa_messages").select("created_at").eq("phone", digits(phone)).eq("direction", "in")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.created_at as string | undefined;
}

/**
 * Send from ZDMINC's number and log it. Inside Meta's 24-hour window it sends the text as written.
 * Outside it, it sends the approved template (if set) so the client gets a nudge to reply, and keeps
 * the full text in the thread for when they do.
 */
export async function sendZdm(admin: Admin, opts: {
  phone: string; body: string; actor: Actor; businessId?: string | null; contactName?: string | null; ticketId?: string | null;
}) {
  const wa = zdmWhatsApp();
  const phone = digits(opts.phone);
  if (!/^\d{7,15}$/.test(phone)) return { ok: false, error: "That phone number doesn't look right", kind: "text" as const };
  const businessId = opts.businessId ?? (await findClientByPhone(admin, phone))?.id ?? null;
  const base = { phone, business_id: businessId, direction: "out", body: opts.body, ticket_id: opts.ticketId ?? null, author_id: opts.actor.id, author_name: opts.actor.name };
  if (!wa) {
    await admin.from("zdm_wa_messages").insert({ ...base, status: "failed", error: "ZDMINC WhatsApp is not set up (ZDM_WA_PHONE_NUMBER_ID, ZDM_WA_TOKEN)" });
    return { ok: false, error: "ZDMINC WhatsApp is not set up yet", kind: "text" as const };
  }
  const open = insideServiceWindow(await lastInbound(admin, phone));
  let res: { ok: boolean; id?: string; error?: string };
  let kind: "text" | "template" = "text";
  if (open) {
    res = await sendWhatsAppText({ phoneNumberId: wa.phoneNumberId, accessToken: wa.accessToken, to: phone, body: opts.body });
  } else if (wa.template) {
    kind = "template";
    res = await sendWhatsAppTemplate({ phoneNumberId: wa.phoneNumberId, accessToken: wa.accessToken, to: phone, template: wa.template, params: [opts.contactName?.split(" ")[0] || "there"] });
  } else {
    res = { ok: false, error: "More than 24 hours since they last wrote. Set ZDM_WA_TEMPLATE to an approved template to reach them." };
  }
  // A template carries only the greeting; the real text waits (pending) until they reply.
  await admin.from("zdm_wa_messages").insert({ ...base, kind, pending: kind === "template" && res.ok, status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, external_id: kind === "template" ? null : res.id ?? null });
  return { ...res, kind };
}
