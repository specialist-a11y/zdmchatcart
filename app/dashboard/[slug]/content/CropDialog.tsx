"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { frameFor } from "@/lib/posts";
import type { Rect } from "@/lib/media-prep";

export type CropChoice = { ratio: "4:5" | "9:16" | "original"; rect: Rect | null };

const RATIOS = { "4:5": 4 / 5, "9:16": 9 / 16 } as const;

const CSS = `
.cd-back { position: fixed; inset: 0; z-index: 100; background: rgba(11,15,14,.72); display: grid; place-items: center; padding: 16px; }
.cd { background: #fff; border-radius: 18px; padding: 18px; width: min(680px, 100%); max-height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.cd-stage { position: relative; margin: 0 auto; touch-action: none; user-select: none; background: #000; border-radius: 10px; overflow: hidden; }
.cd-stage img, .cd-stage video { display: block; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.cd-frame { position: absolute; border: 2.5px solid #fff; box-shadow: 0 0 0 9999px rgba(0,0,0,.55); cursor: grab; border-radius: 4px; }
.cd-frame:active { cursor: grabbing; }
.cd-frame::before, .cd-frame::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: linear-gradient(90deg, transparent calc(33.3% - 1px), rgba(255,255,255,.45) 33.3%, transparent calc(33.3% + 1px), transparent calc(66.6% - 1px), rgba(255,255,255,.45) 66.6%, transparent calc(66.6% + 1px)); }
.cd-frame::after { background-image: linear-gradient(transparent calc(33.3% - 1px), rgba(255,255,255,.45) 33.3%, transparent calc(33.3% + 1px), transparent calc(66.6% - 1px), rgba(255,255,255,.45) 66.6%, transparent calc(66.6% + 1px)); }
.cd-ratios { display: flex; gap: 8px; flex-wrap: wrap; }
.cd-ratios button { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--line); background: #fff; font-weight: 700; cursor: pointer; }
.cd-ratios button[aria-pressed="true"] { border-color: var(--blue); background: var(--teal-soft); }
.cd-ratios i { display: inline-block; border: 2px solid currentColor; border-radius: 2px; }
`;

/** Pick 4:5 or 9:16 for a horizontal photo or video, and drag the frame to choose what stays in. */
export default function CropDialog({ file, kind, width, height, index, total, onDone }: {
  file: File; kind: "image" | "video"; width: number; height: number; index: number; total: number;
  onDone: (choice: CropChoice | null) => void;
}) {
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const [ratio, setRatio] = useState<CropChoice["ratio"]>("4:5");
  const [rect, setRect] = useState<Rect>(() => frameFor(width, height, RATIOS["4:5"]));
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Fit the preview inside the dialog.
  const [box] = useState(() => ({ w: Math.min(640, window.innerWidth - 68), h: Math.min(420, Math.round(window.innerHeight * 0.5)) }));
  const scale = Math.min(box.w / width, box.h / height);
  const dw = Math.round(width * scale), dh = Math.round(height * scale);

  function pick(r: CropChoice["ratio"]) {
    setRatio(r);
    if (r !== "original") setRect(frameFor(width, height, RATIOS[r]));
  }

  const clamp = (r: Rect) => ({ ...r, x: Math.max(0, Math.min(width - r.w, r.x)), y: Math.max(0, Math.min(height - r.h, r.y)) });

  return (
    <div className="cd-back" role="dialog" aria-modal="true" aria-label="Crop for Instagram and Facebook">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cd">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 24 }}>Crop {kind === "video" ? "video" : "photo"}{total > 1 ? ` · ${index + 1} of ${total}` : ""}</h2>
          <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{file.name}</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>This is wide. Pick a shape, then drag the frame to choose what stays in.</p>

        <div className="cd-ratios" role="group" aria-label="Shape">
          <button type="button" aria-pressed={ratio === "4:5"} onClick={() => pick("4:5")}><i style={{ width: 12, height: 15 }} /> 4:5 <span className="muted" style={{ fontWeight: 500 }}>Feed</span></button>
          <button type="button" aria-pressed={ratio === "9:16"} onClick={() => pick("9:16")}><i style={{ width: 9, height: 16 }} /> 9:16 <span className="muted" style={{ fontWeight: 500 }}>Reels{kind === "image" ? ", Facebook" : ""}</span></button>
          <button type="button" aria-pressed={ratio === "original"} onClick={() => pick("original")}><i style={{ width: 18, height: 10 }} /> Keep wide</button>
        </div>

        <div className="cd-stage" style={{ width: dw, height: dh }}>
          {kind === "image" ? <img src={src} alt="" /> : <video src={`${src}#t=0.5`} muted playsInline preload="auto" />}
          {ratio !== "original" && (
            <div className="cd-frame"
              style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: rect.x, y: rect.y }; }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setRect((r) => clamp({ ...r, x: d.x + (e.clientX - d.px) / scale, y: d.y + (e.clientY - d.py) / scale }));
              }}
              onPointerUp={() => { drag.current = null; }}
              onKeyDown={(e) => {
                const step = Math.round(width / 50);
                if (e.key === "ArrowLeft") setRect((r) => clamp({ ...r, x: r.x - step }));
                if (e.key === "ArrowRight") setRect((r) => clamp({ ...r, x: r.x + step }));
              }}
              tabIndex={0} aria-label="Crop frame. Drag, or use the arrow keys, to move it." />
          )}
        </div>

        {ratio === "9:16" && kind === "image" && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Instagram feed photos can't be taller than 4:5, so a 9:16 photo can only be posted to Facebook.</p>}
        {ratio === "original" && kind === "image" && width / height > 1.91 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Very wide photos are trimmed to 1.91:1, the widest Instagram allows.</p>}
        {ratio !== "original" && kind === "video" && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cropping a video takes a minute or two after it uploads.</p>}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn secondary" onClick={() => onDone(null)}>Skip this file</button>
          <button type="button" className="btn" onClick={() => onDone({ ratio, rect: ratio === "original" ? null : rect })}>Use this</button>
        </div>
      </div>
    </div>
  );
}
