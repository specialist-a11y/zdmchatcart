"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupportUploadUrl } from "./actions";

type File1 = { path: string; name: string; type: string; size: number };
const MAX = 50 * 1024 * 1024;

/** Attach up to 5 screenshots or short videos. Uploads straight to private storage; the form sends the list. */
export default function AttachField({ slug }: { slug: string }) {
  const [files, setFiles] = useState<File1[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    setBusy(true);
    const next = [...files];
    for (const f of Array.from(list).slice(0, 5 - files.length)) {
      if (!/^(image|video)\//.test(f.type)) { setError("Screenshots, photos and short videos only"); continue; }
      if (f.size > MAX) { setError(`${f.name} is over 50 MB. Try a shorter clip.`); continue; }
      const signed = await getSupportUploadUrl(slug, f.name);
      if ("error" in signed) { setError(signed.error ?? "Upload failed"); break; }
      const { error } = await createClient().storage.from("support-files").uploadToSignedUrl(signed.path, signed.token, f, { contentType: f.type });
      if (error) { setError(error.message); continue; }
      next.push({ path: signed.path, name: f.name, type: f.type, size: f.size });
    }
    setFiles(next);
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <input type="hidden" name="attachments" value={JSON.stringify(files)} />
      <div className="row" style={{ gap: 8 }}>
        {files.length < 5 && (
          <label className="btn secondary small" style={{ cursor: "pointer" }}>
            {busy ? "Uploading…" : "📎 Add screenshot or video"}
            <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        {files.map((f) => (
          <span key={f.path} className="badge" style={{ textTransform: "none", display: "inline-flex", gap: 6, alignItems: "center" }}>
            {f.type.startsWith("video") ? "🎬" : "🖼"} {f.name.slice(0, 28)}
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x.path !== f.path))}
              style={{ border: 0, background: "none", cursor: "pointer", fontWeight: 800, minWidth: 24, minHeight: 24 }}>✕</button>
          </span>
        ))}
      </div>
      {error && <span className="error" role="alert" style={{ fontSize: 14 }}>{error}</span>}
      <span className="muted" style={{ fontSize: 12 }}>A screenshot of the problem helps us fix it faster. Up to 5 files, 50 MB each.</span>
    </div>
  );
}
