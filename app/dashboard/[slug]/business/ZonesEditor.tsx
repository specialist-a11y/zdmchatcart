"use client";

import { useState } from "react";
import type { Zone } from "@/lib/shop-front";

/** Delivery areas with their fee. Sent with the Business info form as JSON. */
export default function ZonesEditor({ initial, currency, disabled }: { initial: Zone[]; currency: string; disabled?: boolean }) {
  const [zones, setZones] = useState<Zone[]>(initial);
  const set = (i: number, patch: Partial<Zone>) => setZones(zones.map((z, k) => (k === i ? { ...z, ...patch } : z)));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="delivery_zones" value={JSON.stringify(zones.filter((z) => z.name.trim()))} />
      {zones.map((z, i) => (
        <div key={z.id} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <input value={z.name} disabled={disabled} maxLength={60} placeholder="Zone A (within 5 km)" aria-label="Area name" style={{ flex: 1, minWidth: 0 }} onChange={(e) => set(i, { name: e.target.value })} />
          <input value={String(z.fee)} disabled={disabled} type="number" min={0} step="0.5" inputMode="decimal" aria-label={`Fee in ${currency}`} style={{ width: 100 }} onChange={(e) => set(i, { fee: Number(e.target.value) || 0 })} />
          {!disabled && <button type="button" className="btn secondary small" aria-label="Remove area" onClick={() => setZones(zones.filter((_, k) => k !== i))}>✕</button>}
        </div>
      ))}
      {!disabled && zones.length < 10 && (
        <button type="button" className="btn secondary small" style={{ alignSelf: "flex-start" }}
          onClick={() => setZones([...zones, { id: `z${Date.now().toString(36).slice(-6)}`, name: "", fee: 10 }])}>+ Add a delivery area</button>
      )}
      <span className="muted" style={{ fontSize: 13 }}>Fees in {currency}. Use 0 for free delivery. No areas means pickup only. The fee is added to the customer's total at checkout.</span>
    </div>
  );
}
