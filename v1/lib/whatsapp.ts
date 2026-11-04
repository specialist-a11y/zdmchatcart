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
