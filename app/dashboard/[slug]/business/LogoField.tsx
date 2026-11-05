"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProductPhotoUrl } from "../products/actions";

/** Logo picker: upload from the phone or computer (PNG keeps a see-through background), or paste a link. Saved with the form. */
export default function LogoField({ slug, initial, disabled }: { slug: string; initial: string | null; disabled?: boolean }) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use a PNG, JPG or WebP image");
    if (file.size > 5 * 1024 * 1024) return setError("That image is over 5 MB. Try a smaller one.");
    setBusy(true);
    try {
      const signed = await getProductPhotoUrl(slug, `logo-${file.name}`);
      if ("error" in signed) throw new Error(signed.error);
      const { error } = await createClient().storage.from("product-images").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      setUrl(signed.publicUrl);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <span style={{ fontWeight: 700 }}>Logo</span>
      <input type="hidden" name="logo_url" value={url} />
      <div className="row">
        <div style={{ width: 72, height: 72, borderRadius: 14, border: "1.5px solid var(--line)", background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", flex: "none" }}>
          {url ? <img src={url} alt="Your logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="muted" style={{ fontSize: 12 }}>No logo</span>}
        </div>
        {!disabled && (
          <div className="row" style={{ gap: 8 }}>
            <label className="btn secondary small" style={{ cursor: "pointer" }}>
              {busy ? "Uploading…" : url ? "Change logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {url && <button type="button" className="btn secondary small" onClick={() => setUrl("")}>Remove</button>}
            <button type="button" className="btn secondary small" onClick={() => setPaste((p) => !p)}>{paste ? "Hide link" : "Paste a link"}</button>
          </div>
        )}
      </div>
      {paste && <input type="url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://…" aria-label="Logo link" />}
      <span className="muted" style={{ fontSize: 13 }}>A square PNG with a see-through background looks best. Click Save to keep it.</span>
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}
