"use client";

import { useState } from "react";

/** "QR" button that shows a printable QR code for a link, with PNG and SVG downloads. */
export function QrButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const q = (extra: string) => `/api/qr?text=${encodeURIComponent(url)}${extra}`;
  const file = name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 50) || "qr";
  return (
    <>
      <button type="button" className="btn secondary small" onClick={() => setOpen(true)} aria-label={`QR code for ${url}`}>QR</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="QR code" onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(11,15,14,.8)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="card stack" onClick={(e) => e.stopPropagation()} style={{ width: "min(360px, 100%)", gap: 12, alignItems: "center", textAlign: "center" }}>
            <img src={q("")} alt={`QR code for ${url}`} width={260} height={260} style={{ width: 260, maxWidth: "100%", height: "auto" }} />
            <code style={{ wordBreak: "break-all", fontSize: 14 }}>{url.replace(/^https?:\/\//, "")}</code>
            <span className="muted" style={{ fontSize: 13 }}>For flyers, counter signs and packaging. Print it at least 2 cm wide.</span>
            <div className="row" style={{ justifyContent: "center" }}>
              <a className="btn small" href={q(`&download=${file}`)}>Download PNG</a>
              <a className="btn secondary small" href={q(`&format=svg&download=${file}`)}>SVG for printers</a>
              <button type="button" className="btn secondary small" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
