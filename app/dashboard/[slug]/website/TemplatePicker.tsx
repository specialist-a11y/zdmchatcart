"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto } from "@/lib/media-prep";
import { TEMPLATES, type TemplateId } from "@/lib/catalog";
import { getProductPhotoUrl } from "../products/actions";
import { saveLook } from "./template-actions";

const CSS = `
.tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.tp-card { text-align: left; border: 2px solid var(--line); border-radius: 14px; background: #fff; padding: 0; overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color .15s, transform .15s; }
.tp-card:hover { transform: translateY(-2px); }
.tp-card[aria-pressed="true"] { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(61,139,255,.2); }
.tp-mock { height: 92px; position: relative; padding: 10px; display: flex; flex-direction: column; gap: 5px; }
.tp-mock i { display: block; border-radius: 3px; }
.tp-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 2px; }
.tp-body b { font-size: 14px; }
.tp-body small { color: var(--muted); font-size: 12px; line-height: 1.35; }
.tp-live { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--teal); }
.tp-frame { border: 1.5px solid var(--line); border-radius: 16px; overflow: hidden; background: #fff; }
.tp-frame iframe { width: 100%; height: 640px; border: 0; display: block; }
.tp-hero { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.tp-hero img { width: 120px; height: 68px; object-fit: cover; border-radius: 10px; }
`;

/** Tiny drawing of each template's layout, in its colours. */
function Mock({ id, swatch }: { id: TemplateId; swatch: [string, string, string] }) {
  const [bg, fg, accent] = swatch;
  const bar = (w: string, h = 6, c = fg, o = 1) => <i style={{ width: w, height: h, background: c, opacity: o }} />;
  return (
    <div className="tp-mock" style={{ background: bg }} aria-hidden="true">
      {id === "classic" && <>
        <div style={{ background: accent, margin: -10, marginBottom: 2, padding: "10px 10px 8px" }}>{bar("55%", 7, "#fff")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, flex: 1 }}>{[0, 1, 2].map((k) => <i key={k} style={{ background: "#e9ecea", borderRadius: 4 }} />)}</div>
      </>}
      {id === "caterer" && <>
        <div style={{ background: `linear-gradient(${accent}, ${fg})`, margin: -10, marginBottom: 2, height: 30, opacity: .85 }} />
        {bar("40%", 5, fg)}
        {[0, 1].map((k) => <div key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}><i style={{ width: 14, height: 14, borderRadius: "50%", background: accent }} />{bar("45%", 4, fg, .7)}<i style={{ flex: 1, borderBottom: `2px dotted ${fg}`, opacity: .3 }} />{bar("12%", 4, fg)}</div>)}
      </>}
      {id === "artist" && <div style={{ columns: 3, columnGap: 4, height: "100%" }}>{[34, 22, 28, 40, 18, 30].map((h, k) => <i key={k} style={{ height: h, background: k % 2 ? "#3a3a3a" : "#555", marginBottom: 4, borderRadius: 2 }} />)}</div>}
      {id === "beauty" && <>
        <div style={{ alignSelf: "center", width: "50%" }}>{bar("100%", 7, fg)}</div>
        <div style={{ background: "#fff", borderRadius: 10, padding: 7, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
          {[0, 1].map((k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{bar("40%", 4, fg, .7)}<i style={{ width: 22, height: 9, borderRadius: 999, background: accent }} /></div>)}
        </div>
      </>}
      {id === "trades" && <>
        <div style={{ background: fg, margin: -10, marginBottom: 2, padding: "9px 10px", display: "flex", gap: 5 }}>{bar("45%", 8, "#fff")}<i style={{ width: 26, height: 8, background: accent }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>{[0, 1].map((k) => <i key={k} style={{ border: `2px solid ${fg}`, boxShadow: `3px 3px 0 ${fg}`, background: "#fff", borderRadius: 2 }} />)}</div>
      </>}
    </div>
  );
}

export type HeroCopy = { headline: string; subheadline: string; text: string };

export default function TemplatePicker({ slug, current, heroUrl, copy: savedCopy, businessName, tagline, canEdit }: {
  slug: string; current: string; heroUrl: string | null; copy: HeroCopy; businessName: string; tagline: string | null; canEdit: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string>(current || "classic");
  const [hero, setHero] = useState(heroUrl ?? "");
  const [copy, setCopy] = useState<HeroCopy>(savedCopy);
  const [previewKey, setPreviewKey] = useState(0);
  const copyDirty = copy.headline !== savedCopy.headline || copy.subheadline !== savedCopy.subheadline || copy.text !== savedCopy.text;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const dirty = chosen !== (current || "classic") || hero !== (heroUrl ?? "") || copyDirty;

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setMsg({});
    try {
      const photo = await preparePhoto(file, null);
      const signed = await getProductPhotoUrl(slug, `cover-${photo.file.name}`);
      if ("error" in signed) throw new Error(signed.error);
      const { error } = await createClient().storage.from("product-images").uploadToSignedUrl(signed.path, signed.token, photo.file, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      setHero(signed.publicUrl);
    } catch (e: any) {
      setMsg({ error: e?.message ?? "Upload failed" });
    }
    setUploading(false);
  }

  async function save() {
    setBusy(true);
    setMsg({});
    const res = await saveLook(slug, { template: chosen, heroUrl: hero, ...copy });
    setBusy(false);
    if ("error" in res && res.error) return setMsg({ error: res.error });
    setMsg({ ok: "Saved. Your website is updated." });
    setPreviewKey((k) => k + 1);
    router.refresh();
  }

  return (
    <section id="look" className="card stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>Website look</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>Pick a template made for your kind of business. Your logo, colour, products and info carry over.</p>
        </div>
        {canEdit && <button className="btn" disabled={!dirty || busy || uploading} onClick={save}>{busy ? "Saving…" : dirty ? "Use this look" : "Saved"}</button>}
      </div>

      <div className="tp-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="tp-card" aria-pressed={chosen === t.id} onClick={() => { setChosen(t.id); setMsg({}); }}>
            <Mock id={t.id} swatch={t.swatch} />
            <span className="tp-body">
              {current === t.id && <span className="tp-live">Live now</span>}
              <b>{t.name}</b>
              <small>{t.for}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}><b style={{ color: "var(--ink)" }}>{TEMPLATES.find((t) => t.id === chosen)?.name}:</b> {TEMPLATES.find((t) => t.id === chosen)?.blurb}</p>

      <div className="card stack" style={{ background: "#fafbfa", gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 20 }}>Hero section</h3>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>The first thing visitors see at the top of your website. Leave blank to show your business name and tagline.</p>
        </div>
        <label>Headline <span className="muted" style={{ fontWeight: 400 }}>· {copy.headline.length}/120</span>
          <input value={copy.headline} maxLength={120} disabled={!canEdit} onChange={(e) => setCopy({ ...copy, headline: e.target.value })}
            placeholder={businessName} />
        </label>
        <label>Sub-headline <span className="muted" style={{ fontWeight: 400 }}>· {copy.subheadline.length}/200</span>
          <input value={copy.subheadline} maxLength={200} disabled={!canEdit} onChange={(e) => setCopy({ ...copy, subheadline: e.target.value })}
            placeholder={tagline || "Fresh Bajan baking, made to order"} />
        </label>
        <label>Paragraph <span className="muted" style={{ fontWeight: 400 }}>· {copy.text.length}/600</span>
          <textarea rows={3} value={copy.text} maxLength={600} disabled={!canEdit} onChange={(e) => setCopy({ ...copy, text: e.target.value })}
            placeholder="A few lines about what you do, who it's for, and how to order. Line breaks are kept." />
        </label>
        {chosen === "classic" && (copy.headline || copy.subheadline || copy.text) && <span className="muted" style={{ fontSize: 13 }}>With hero text, Classic shows a full hero section instead of the slim name bar.</span>}
      </div>

      {(chosen !== "classic" || copy.headline || copy.subheadline || copy.text) && (
        <div className="tp-hero">
          {hero ? <img src={hero} alt="Cover" /> : null}
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ fontSize: 14 }}>Cover photo</b>
            <span className="muted" style={{ fontSize: 13 }}>{hero ? "Shown behind the hero section." : chosen === "classic" ? "None yet, so the hero uses your brand colour." : "None yet, so your first product photo is used."}</span>
          </div>
          {canEdit && (
            <div className="row">
              <label className="btn secondary small" style={{ cursor: "pointer" }}>
                {uploading ? "Uploading…" : hero ? "Change" : "Upload cover photo"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              {hero && <button className="btn secondary small" onClick={() => setHero("")}>Remove</button>}
            </div>
          )}
        </div>
      )}

      {msg.error && <p className="error" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
      {msg.ok && <p className="ok" role="status" style={{ margin: 0 }}>{msg.ok}</p>}

      <div className="tp-frame">
        <div className="row" style={{ justifyContent: "space-between", padding: "8px 14px", borderBottom: "1.5px solid var(--line)", background: "#fafbfa" }}>
          <span className="muted" style={{ fontSize: 13 }}>Preview{chosen !== current ? " (template not saved yet)" : ""}{hero !== (heroUrl ?? "") || copyDirty ? ". Save to see your hero changes here." : ""}</span>
          <a href={`/s/${slug}?template=${chosen}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>Open full size ↗</a>
        </div>
        <iframe key={`${chosen}-${previewKey}`} src={`/s/${slug}?template=${chosen}`} title="Website preview" />
      </div>
    </section>
  );
}
