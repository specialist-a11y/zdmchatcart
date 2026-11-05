import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoiceForPdf = {
  number: string; description: string; amount: number; currency: string; status: string;
  created_at: string; due_date: string; paid_at?: string | null; payment_url?: string | null;
  billTo: { name: string; email?: string | null; address?: string | null };
};

/** The standard PDF fonts only cover Latin-1, so swap anything else for a plain stand-in. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Barbados" });
const money = (n: number, c: string) => `${c === "BBD" ? "BBD $" : `${c} `}${n.toFixed(2)}`;

/** A one-page A4 invoice from ZDMINC. */
export async function invoicePdf(inv: InvoiceForPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.number}`);
  doc.setAuthor("ZDMINC");
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.043, 0.059, 0.055), muted = rgb(0.4, 0.45, 0.44), blue = rgb(0.114, 0.373, 0.82);
  const text = (t: string, x: number, y: number, o: { size?: number; f?: typeof font; color?: typeof ink } = {}) =>
    page.drawText(safe(t), { x, y, size: o.size ?? 11, font: o.f ?? font, color: o.color ?? ink });
  const right = (t: string, xr: number, y: number, o: { size?: number; f?: typeof font; color?: typeof ink } = {}) =>
    text(t, xr - (o.f ?? font).widthOfTextAtSize(safe(t), o.size ?? 11), y, o);

  page.drawRectangle({ x: 0, y: 781, width: 595.28, height: 61, color: ink });
  text("ZDMINC", 48, 803, { size: 22, f: bold, color: rgb(1, 1, 1) });
  right("ZDM ChatCart", 547, 806, { size: 11, color: rgb(0.24, 0.55, 1) });

  text("INVOICE", 48, 730, { size: 26, f: bold });
  text(inv.number, 48, 710, { size: 12, color: muted });
  const paid = inv.status === "paid";
  right(paid ? "PAID" : inv.status === "overdue" ? "OVERDUE" : inv.status === "void" ? "CANCELLED" : "DUE", 547, 730, { size: 18, f: bold, color: paid ? rgb(0.08, 0.45, 0.26) : inv.status === "overdue" ? rgb(0.55, 0.18, 0.11) : blue });

  text("Bill to", 48, 670, { size: 10, f: bold, color: muted });
  let y = 654;
  for (const line of [inv.billTo.name, ...(inv.billTo.address ?? "").split("\n"), inv.billTo.email ?? ""].filter((l) => l.trim()).slice(0, 6)) { text(line.slice(0, 70), 48, y); y -= 15; }

  const meta: [string, string][] = [["Issued", day(inv.created_at)], ["Due", day(inv.due_date)], ...(inv.paid_at ? [["Paid", day(inv.paid_at)] as [string, string]] : [])];
  let my = 670;
  for (const [k, v] of meta) { right(k, 440, my, { size: 10, f: bold, color: muted }); right(v, 547, my); my -= 16; }

  const top = 540;
  page.drawRectangle({ x: 48, y: top, width: 499, height: 24, color: rgb(0.93, 0.95, 0.94) });
  text("Description", 58, top + 8, { size: 10, f: bold });
  right("Amount", 537, top + 8, { size: 10, f: bold });
  const words = safe(inv.description).split(/\s+/);
  const lines: string[] = [];
  for (const w of words) { const l = lines[lines.length - 1]; if (l && font.widthOfTextAtSize(`${l} ${w}`, 11) < 360) lines[lines.length - 1] = `${l} ${w}`; else lines.push(w); }
  let ly = top - 20;
  lines.slice(0, 6).forEach((l, i) => { text(l, 58, ly - i * 15); });
  right(money(inv.amount, inv.currency), 537, ly);
  ly -= Math.max(1, Math.min(lines.length, 6)) * 15 + 14;
  page.drawLine({ start: { x: 48, y: ly }, end: { x: 547, y: ly }, thickness: 1, color: rgb(0.85, 0.88, 0.87) });
  right("Total", 440, ly - 22, { size: 12, f: bold });
  right(money(inv.amount, inv.currency), 537, ly - 22, { size: 14, f: bold });

  if (!paid && inv.status !== "void" && inv.payment_url) {
    text("Pay online with Fygaro:", 48, ly - 70, { size: 11, f: bold });
    const url = inv.payment_url.length > 95 ? `${inv.payment_url.slice(0, 92)}...` : inv.payment_url;
    text(url, 48, ly - 86, { size: 9, color: blue });
  }
  text("Thank you for working with ZDMINC. Questions about this invoice? Open a request in Help and support.", 48, 60, { size: 9, color: muted });
  return doc.save();
}
