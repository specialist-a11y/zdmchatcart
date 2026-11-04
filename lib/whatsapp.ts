import { createHmac, timingSafeEqual } from "node:crypto";

/** WhatsApp Cloud API helpers. */

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export type InboundText = {
  phoneNumberId: string;
  from: string; // customer phone, digits
  name?: string;
  messageId: string;
  text: string;
};

/** Pull text messages out of a webhook payload (ignores statuses, media, etc.). */
export function parseInbound(payload: any): InboundText[] {
  const out: InboundText[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      const phoneNumberId = v?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const names = new Map<string, string>(
        (v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]),
      );
      for (const m of v.messages ?? []) {
        const text = m.type === "text" ? m.text?.body : m.type === "button" ? m.button?.text : undefined;
        if (!text) continue;
        out.push({ phoneNumberId, from: m.from, name: names.get(m.from), messageId: m.id, text });
      }
    }
  }
  return out;
}

export async function sendWhatsAppText(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "text",
      text: { preview_url: true, body: opts.body },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: json?.messages?.[0]?.id };
}

/** Send an image by public URL (WhatsApp downloads it). Used for receipts. */
export async function sendWhatsAppImage(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  link: string;
  caption?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "image",
      image: { link: opts.link, ...(opts.caption ? { caption: opts.caption } : {}) },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: json?.messages?.[0]?.id };
}

/**
 * Send an approved template. Needed to start a conversation, or to message someone
 * more than 24 hours after they last wrote. Body parameters fill {{1}}, {{2}}... in order.
 */
export async function sendWhatsAppTemplate(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  template: string;
  language?: string;
  params?: string[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const components = opts.params?.length
    ? [{ type: "body", parameters: opts.params.map((text) => ({ type: "text", text })) }]
    : undefined;
  const res = await fetch(`https://graph.facebook.com/${version}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: { name: opts.template, language: { code: opts.language ?? "en" }, ...(components ? { components } : {}) },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: json?.messages?.[0]?.id };
}

/** Meta lets you send free text only within 24 hours of the person's last message. */
export function insideServiceWindow(lastInboundIso: string | null | undefined, now = Date.now()) {
  return !!lastInboundIso && now - Date.parse(lastInboundIso) < 24 * 3600 * 1000;
}
