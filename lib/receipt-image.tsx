import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { barPattern, receiptModel } from "./receipt";

const W = 600;
const INK = "#1b1b1b";
const font = (f: string) => readFile(path.join(process.cwd(), "assets/fonts", f));

/** Draws the receipt PNG from a receipt model. */
export async function renderReceipt(m: ReturnType<typeof receiptModel>) {
  const row = (l: string, r: string, s: Record<string, unknown> = {}) => (
    <div style={{ display: "flex", flexShrink: 0, justifyContent: "space-between", ...s }}><span>{l}</span><span>{r}</span></div>
  );
  const rule = <div style={{ display: "flex", flexShrink: 0, borderTop: `2px dashed #555`, margin: "14px 0" }} />;
  // Measured layout: 29px per text row at 20px, 23px per small row, 30px per dashed rule.
  const rows = 3 + (m.customer ? 1 : 0) + (m.fulfilment ? 1 : 0) + m.lines.length * 2 + 2 + 1 + (m.ref ? 1 : 0);
  const small = 1 + (m.address ? 1 : 0) + (m.vat ? 1 : 0) + (m.paid ? 1 : 0) + 3 + 1;
  const height = 48 + 60 + 64 + 8 + 38 + 6 * 30 + rows * 29 + small * 23 + 46 + 64 + 60 + 29 + 30 + 12 - 50;

  return new ImageResponse(
    (
      <div style={{ width: W, height, display: "flex", background: "#EFE9DF", padding: 24 }}>
        <div style={{ display: "flex", flexShrink: 0, flexDirection: "column", flex: 1, background: "#fbfaf6", padding: "30px 30px", color: INK, fontFamily: "Mono", fontSize: 20, lineHeight: 1.45, boxShadow: "0 8px 24px rgba(0,0,0,.15)" }}>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", width: 64, height: 64, borderRadius: 32, border: `3px solid ${INK}`, alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22 }}>{m.initials}</div>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontWeight: 700, fontSize: 26, marginTop: 8, textAlign: "center" }}>{m.business}</div>
          {m.address && <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, color: "#444" }}>{m.address}</div>}
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, color: "#444" }}>Orders on WhatsApp</div>
          {rule}
          {row("Order", m.code, { fontWeight: 700 })}
          {row("Date", m.date)}
          {row("Channel", "WhatsApp")}
          {m.customer && row("Customer", m.customer)}
          {m.fulfilment && row("Fulfilment", m.fulfilment)}
          {rule}
          {m.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", flexShrink: 0, flexDirection: "column" }}>
              <span>{`${l.qty} x ${l.name}`}</span>
              {row(`  @ ${l.unit}`, l.amount, { paddingLeft: 24 })}
            </div>
          ))}
          {rule}
          {row("Items", String(m.count))}
          {row("Subtotal", m.subtotal)}
          {m.vat && row(`VAT included (${m.vat.rate})`, m.vat.amount, { fontSize: 16, color: "#444" })}
          {row(`TOTAL ${m.currency}`, m.total, { fontWeight: 700, fontSize: 28, marginTop: 6 })}
          {rule}
          {row("Payment", m.payment)}
          {m.ref && row("Ref", m.ref)}
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", border: `3px solid ${INK}`, padding: "4px 20px", fontWeight: 700, fontSize: 24, letterSpacing: 4, marginTop: 10 }}>PAID</div>
          {m.paid && <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, color: "#444" }}>{`Paid ${m.paid}`}</div>}
          {rule}
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", height: 60 }}>
            {barPattern(m.code).map((b, i) => <div key={i} style={{ display: "flex", flexShrink: 0, width: b.w * 1.7, height: 60, background: b.on ? INK : "transparent" }} />)}
          </div>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, letterSpacing: 6 }}>{m.code}</div>
          {rule}
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center" }}>{m.thanks}</div>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, color: "#444" }}>{m.pickupNote}</div>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 16, color: "#444" }}>Questions? Reply in this WhatsApp chat.</div>
          <div style={{ display: "flex", flexShrink: 0, alignSelf: "center", fontSize: 14, color: "#666", marginTop: 12 }}>Powered by ZDM ChatCart</div>
        </div>
      </div>
    ),
    {
      width: W, height,
      fonts: [
        { name: "Mono", data: await font("DejaVuSansMono.ttf"), weight: 400 },
        { name: "Mono", data: await font("DejaVuSansMono-Bold.ttf"), weight: 700 },
      ],
      headers: { "Cache-Control": "private, max-age=3600" },
    },
  );
}
