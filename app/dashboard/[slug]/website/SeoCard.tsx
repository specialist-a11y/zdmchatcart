"use client";

import { useState } from "react";
import { seoChecks } from "@/lib/seo";

/** Google search title and description with a live result preview. Blank fields use the automatic text. */
export default function SeoCard({ slug, url, autoTitle, autoDescription, title: t0, description: d0, verification, canEdit, action }: {
  slug: string; url: string; autoTitle: string; autoDescription: string; title: string; description: string; verification: string; canEdit: boolean;
  action: (f: FormData) => void;
}) {
  const [title, setTitle] = useState(t0);
  const [description, setDescription] = useState(d0);
  const shownTitle = title.trim() || autoTitle;
  const shownDesc = description.trim() || autoDescription;
  const tips = seoChecks(shownTitle, shownDesc);
  const crumb = url.replace(/^https?:\/\//, "").replace(/\//g, " › ");
  return (
    <form id="seo" action={action} className="card stack" style={{ gap: 12 }}>
      <input type="hidden" name="slug" value={slug} />
      <div>
        <h2>Google search</h2>
        <p className="muted" style={{ margin: "4px 0 0" }}>How your shop shows up when people search. Every product also has its own page Google can find.</p>
      </div>
      <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", background: "#fff", fontFamily: "arial, sans-serif" }} aria-label="Google result preview">
        <div style={{ fontSize: 12, color: "#4d5156", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crumb}</div>
        <div style={{ fontSize: 19, color: "#1a0dab", lineHeight: 1.3, margin: "2px 0" }}>{shownTitle.length > 62 ? `${shownTitle.slice(0, 60)}…` : shownTitle}</div>
        <div style={{ fontSize: 14, color: "#4d5156", lineHeight: 1.45 }}>{shownDesc.length > 160 ? `${shownDesc.slice(0, 158)}…` : shownDesc}</div>
      </div>
      <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
        <label>Title <span className="muted" style={{ fontWeight: 400 }}>· {shownTitle.length}/60 · blank uses the automatic one</span>
          <input name="seo_title" value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} />
        </label>
        <label>Description <span className="muted" style={{ fontWeight: 400 }}>· {shownDesc.length}/160</span>
          <textarea name="seo_description" rows={2} value={description} maxLength={170} onChange={(e) => setDescription(e.target.value)} placeholder={autoDescription} />
        </label>
        {tips.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "#8a4b00" }}>{tips.map((x) => <li key={x}>{x}</li>)}</ul>}
        <span className="muted" style={{ fontSize: 13 }}>Say what you sell and where, the way a customer would search: &ldquo;Black cake and sweetbread in Holetown, Barbados&rdquo;.</span>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: 44, display: "flex", alignItems: "center" }}>Google Search Console (optional)</summary>
          <label style={{ marginTop: 6 }}>Verification code <span className="muted" style={{ fontWeight: 400 }}>(the content=&quot;…&quot; part of Google&apos;s HTML tag)</span>
            <input name="google_verification" defaultValue={verification} maxLength={100} placeholder="abc123XYZ…" />
          </label>
          <span className="muted" style={{ fontSize: 13 }}>Works best with your own domain. After verifying, add {url.replace(/\/s\/.*$/, "")}/sitemap.xml in Search Console so Google finds every product.</span>
        </details>
        <div className="row">
          {canEdit && <button className="btn">Save</button>}
          <a className="btn secondary small" href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Test with Google ↗</a>
        </div>
      </fieldset>
    </form>
  );
}
