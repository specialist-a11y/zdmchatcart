"use client";

import Link from "next/link";
import { useState } from "react";
import { GUIDES, SECTIONS, searchGuides } from "@/lib/help-guides";

const CSS = `
.hl-search { position: relative; }
.hl-search input { width: 100%; height: 52px; padding-left: 44px; border-radius: 14px; font-size: 16px; }
.hl-search svg { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--muted); }
.hl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.hl-chips button { padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--line); background: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
.hl-chips button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.hl-sec { display: flex; flex-direction: column; gap: 10px; }
.hl-sec h2 { font-size: 22px; }
.hl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.hl-card { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border: 1.5px solid var(--line); border-radius: 14px; background: #fff; text-decoration: none; color: inherit; transition: border-color .15s, transform .15s; }
.hl-card:hover { border-color: var(--blue); transform: translateY(-1px); color: inherit; }
.hl-card b { font-size: 15px; line-height: 1.3; }
.hl-card span { color: var(--muted); font-size: 13.5px; line-height: 1.4; }
.hl-card small { color: var(--teal); font-weight: 700; font-size: 12px; margin-top: auto; }
`;

export default function HelpLibrary({ base }: { base: string }) {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const found = searchGuides(q).filter((g) => !section || g.section === section);
  const sections = q ? [null] : SECTIONS.filter((s) => !section || s === section);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hl-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guides, like payment link, sizes, Instagram, domain" aria-label="Search the how-to guides" />
      </div>
      <div className="hl-chips" role="group" aria-label="Topics">
        <button type="button" aria-pressed={!section} onClick={() => setSection(null)}>All topics</button>
        {SECTIONS.map((s) => <button key={s} type="button" aria-pressed={section === s} onClick={() => setSection(section === s ? null : s)}>{s}</button>)}
      </div>

      {sections.map((s) => {
        const list = s ? found.filter((g) => g.section === s) : found;
        if (!list.length) return null;
        return (
          <section key={s ?? "results"} className="hl-sec">
            <h2>{s ?? `${list.length} guide${list.length === 1 ? "" : "s"} for "${q}"`}</h2>
            <div className="hl-grid">
              {list.map((g) => (
                <Link key={g.id} href={`${base}?guide=${g.id}`} className="hl-card">
                  <b>{g.title}</b>
                  <span>{g.summary}</span>
                  <small>{g.minutes} min{q ? ` · ${g.section}` : ""}</small>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {!found.length && (
        <div className="soon">
          <b>No guides match "{q}".</b>
          <p className="muted" style={{ margin: "6px 0 0" }}>Try a simpler word, or <Link href={`${base}?t=new&subject=${encodeURIComponent(q)}`}>ask the ZDMINC team</Link>.</p>
        </div>
      )}
      {GUIDES.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{GUIDES.length} guides. Can't find what you need? <Link href={`${base}?t=new`}>Send ZDMINC a request</Link>.</span>}
    </div>
  );
}
