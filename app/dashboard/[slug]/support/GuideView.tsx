import Link from "next/link";
import { GUIDES, type Guide } from "@/lib/help-guides";

/** One how-to guide: numbered steps, tips, a button to the right page, and related guides. */
export default function GuideView({ guide, slug, base }: { guide: Guide; slug: string; base: string }) {
  const related = GUIDES.filter((g) => g.section === guide.section && g.id !== guide.id).slice(0, 4);
  const ask = `${base}?t=new&subject=${encodeURIComponent(`Help with: ${guide.title}`.slice(0, 120))}`;
  return (
    <div className="cols" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)", alignItems: "start" }}>
      <article className="card stack" style={{ gap: 16 }}>
        <Link href={`${base}?tab=guides`} style={{ fontSize: 14, fontWeight: 700 }}>← All guides</Link>
        <div className="stack" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{guide.section} · {guide.minutes} min</span>
          <h2 style={{ fontSize: 30, lineHeight: 1.05 }}>{guide.title}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>{guide.summary}</p>
        </div>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, counterReset: "step" }}>
          {guide.steps.map((s, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: 12, alignItems: "start", lineHeight: 1.5 }}>
              <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--teal-soft)", color: "var(--teal)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>{i + 1}</span>
              <span style={{ paddingTop: 3 }}>{s}</span>
            </li>
          ))}
        </ol>
        {guide.tips?.length ? (
          <div style={{ background: "#fff8ec", border: "1px solid #f2d9b8", borderRadius: 12, padding: "12px 14px" }}>
            <b style={{ fontSize: 14 }}>Good to know</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 14.5 }}>
              {guide.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        ) : null}
        <div className="row">
          {guide.link && <Link className="btn" href={`/dashboard/${slug}/${guide.link.path}`}>{guide.link.label} →</Link>}
          <Link className="btn secondary" href={ask}>Still stuck? Ask ZDMINC</Link>
        </div>
      </article>
      {related.length > 0 && (
        <aside className="card stack" style={{ gap: 8 }}>
          <b>More in {guide.section}</b>
          {related.map((g) => <Link key={g.id} href={`${base}?guide=${g.id}`} style={{ fontSize: 14.5 }}>{g.title}</Link>)}
        </aside>
      )}
    </div>
  );
}
