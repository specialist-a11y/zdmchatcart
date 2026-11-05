"use client";

import { useState } from "react";
import { DAYS, DAY_NAME, hoursSummary, type Day, type Hours } from "@/lib/hours";

/** Opening hours per day (with a split shift if needed). Sent with the Business info form as JSON. */
export default function HoursEditor({ initial, disabled }: { initial: Hours; disabled?: boolean }) {
  const [h, setH] = useState<Hours>(initial);
  const set = (d: Day, list: [string, string][]) => setH({ ...h, [d]: list });
  const copyDown = (d: Day) => {
    const src = h[d] ?? [];
    const next: Hours = { ...h };
    for (const x of DAYS.slice(DAYS.indexOf(d) + 1)) if (x !== "sun") next[x] = src.map((r) => [...r] as [string, string]);
    setH(next);
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="hours" value={JSON.stringify(h)} />
      {DAYS.map((d) => {
        const list = h[d] ?? [];
        const open = list.length > 0;
        return (
          <div key={d} className="row" style={{ gap: 8, borderTop: "1px solid #eef2f1", paddingTop: 6 }}>
            <label className="row" style={{ gap: 6, width: 92, fontWeight: 700, flexDirection: "row" }}>
              <input type="checkbox" checked={open} disabled={disabled} style={{ width: 20, height: 20 }}
                onChange={(e) => set(d, e.target.checked ? [["08:00", "17:00"]] : [])} />{DAY_NAME[d]}
            </label>
            {!open && <span className="muted">Closed</span>}
            {list.map((r, i) => (
              <span key={i} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <input type="time" value={r[0]} disabled={disabled} aria-label={`${DAY_NAME[d]} opens`} style={{ width: 118 }}
                  onChange={(e) => set(d, list.map((x, k) => (k === i ? [e.target.value, x[1]] : x)))} />
                <span>to</span>
                <input type="time" value={r[1]} disabled={disabled} aria-label={`${DAY_NAME[d]} closes`} style={{ width: 118 }}
                  onChange={(e) => set(d, list.map((x, k) => (k === i ? [x[0], e.target.value] : x)))} />
                {i > 0 && <button type="button" className="btn secondary small" disabled={disabled} onClick={() => set(d, list.filter((_, k) => k !== i))} aria-label="Remove this time">✕</button>}
              </span>
            ))}
            {open && !disabled && list.length < 2 && <button type="button" className="btn secondary small" onClick={() => set(d, [...list, ["13:00", "17:00"]])}>+ Split</button>}
            {open && !disabled && d !== "sat" && d !== "sun" && <button type="button" className="btn secondary small" onClick={() => copyDown(d)} title="Copy these hours to the following days, up to Saturday">Copy down</button>}
          </div>
        );
      })}
      <span className="muted" style={{ fontSize: 13 }}>{hoursSummary(h) || "No hours set. Tick the days you open."} Your website shows Open now or Closed, and the WhatsApp bot can send an away message when you're closed.</span>
    </div>
  );
}
