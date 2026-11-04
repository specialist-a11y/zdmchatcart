"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getUploadUrl, registerClip } from "./video-actions";

type Item = { name: string; size: number; state: "waiting" | "uploading" | "done" | "failed"; error?: string };

const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);

/** Reads a video's length in the browser so editors don't have to type it. */
function duration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(Number.isFinite(v.duration) ? v.duration : null); };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

export default function Uploader({ shootId }: { shootId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const router = useRouter();

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith("video/"));
    if (!list.length) return;
    const start = items.length;
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, size: f.size, state: "waiting" as const }))]);
    setBusy(true);
    const supabase = createClient();
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const set = (patch: Partial<Item>) => setItems((prev) => prev.map((it, j) => (j === start + i ? { ...it, ...patch } : it)));
      set({ state: "uploading" });
      try {
        const signed = await getUploadUrl(shootId, file.name);
        if ("error" in signed) throw new Error(signed.error);
        const { error } = await supabase.storage.from("client-videos").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (error) throw new Error(error.message);
        const secs = await duration(file);
        const res = await registerClip(shootId, signed.path, file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), secs);
        if ("error" in res && res.error) throw new Error(res.error);
        set({ state: "done" });
      } catch (e: any) {
        set({ state: "failed", error: e?.message ?? "Upload failed" });
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="stack">
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        style={{ border: `2px dashed var(--teal)`, background: over ? "#d6e6ff" : "var(--teal-soft)", borderRadius: 16, padding: 26, alignItems: "center", textAlign: "center", cursor: "pointer" }}
      >
        <strong style={{ fontSize: 16 }}>Drop finished clips here, or click to choose</strong>
        <span className="muted" style={{ fontWeight: 400 }}>MP4 or MOV. They go straight to the client's private library.</span>
        <input type="file" accept="video/*" multiple disabled={busy} onChange={(e) => e.target.files && upload(e.target.files)} style={{ display: "none" }} />
      </label>
      {items.length > 0 && (
        <div className="card stack">
          {items.map((it, i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between" }}>
              <span><strong>{it.name}</strong> <span className="muted">{mb(it.size)}</span></span>
              <span className={`badge ${it.state === "done" ? "paid" : it.state === "failed" ? "failed" : "sent"}`}>{it.state === "failed" ? it.error : it.state}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
