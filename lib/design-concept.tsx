import "server-only";
import { ImageResponse } from "next/og";
import { DESIGN_STYLES, conceptHeadline, type DesignBrief } from "./design-brief";
import { googleFont, logoDataUri, pngDataUri } from "./image-data";

const W = 1200, H = 900;

/**
 * A first look at the homepage, drawn from the client's answers: their colours, style, logo, photos, pages and
 * features, in a browser frame. It's a starting point for the ZDMINC designer, not the finished design.
 */
export async function renderConcept(b: DesignBrief, media: { logo?: string | null; hero?: string | null; photos?: string[]; domain?: string | null }) {
  const s = DESIGN_STYLES[b.style];
  const [logoRes, hero, ...photos] = await Promise.all([
    logoDataUri(media.logo, 240, 110),
    pngDataUri(media.hero, 620, 440),
    ...(media.photos ?? []).slice(0, 3).map((u) => pngDataUri(u, 360, 220)),
  ]);
  const logo = logoRes as { src: string; light: boolean } | null;
  const lightPage = parseInt(s.bg.slice(1, 3), 16) > 128;
  const [regular, bold] = await Promise.all([googleFont("Inter", 400), googleFont("Inter", 800)]);
  const heading = conceptHeadline(b.about, b.business);
  // The line under the headline: what's left of the description, so it doesn't repeat the headline.
  const rest = b.about.startsWith(heading) ? b.about.slice(heading.length).replace(/^[.!?\s]+/, "") : b.about;
  const subText = rest.length >= 20 ? rest : b.customers ? `For ${b.customers.charAt(0).toLowerCase()}${b.customers.slice(1)}.` : rest || b.about;
  const sub = subText.length > 150 ? `${subText.slice(0, 147)}...` : subText;
  const nav = b.pages.filter((p) => p !== "Home").slice(0, 5);
  const cta = b.features.includes("Online booking") ? "Book now" : b.features.includes("Online shop") ? "Shop now" : "Get in touch";
  const cards = (b.features.length ? b.features : b.pages.filter((p) => p !== "Home")).slice(0, 3);
  const up = (t: string) => (s.upper ? t.toUpperCase() : t);
  const r = s.radius;
  const url = media.domain || `${b.business.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#d9dde3", padding: 28, fontFamily: regular ? "Inter" : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.25)", background: s.bg }}>
          {/* Browser bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 18px", background: "#eceef1", borderBottom: "1px solid #d5d8dd" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
            <div style={{ display: "flex", marginLeft: 18, padding: "6px 16px", borderRadius: 8, background: "#fff", color: "#555", fontSize: 15, width: 520 }}>{`https://${url}`}</div>
          </div>
          {/* Nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 44px", borderBottom: `1px solid ${s.card}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {logo
                ? <div style={{ display: "flex", padding: logo.light && lightPage ? "6px 12px" : 0, borderRadius: 10, background: logo.light && lightPage ? "#111" : "transparent" }}><img src={logo.src} style={{ height: 52, objectFit: "contain" }} /></div>
                : <div style={{ display: "flex", width: 40, height: 40, borderRadius: 20, background: b.primary }} />}
              {!logo && <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: s.text }}>{up(b.business)}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 17, color: s.text }}>
              {nav.map((p) => <div key={p} style={{ display: "flex" }}>{up(p)}</div>)}
              <div style={{ display: "flex", padding: "10px 20px", borderRadius: r, background: b.primary, color: "#fff", fontWeight: 800 }}>{up(cta)}</div>
            </div>
          </div>
          {/* Hero */}
          <div style={{ display: "flex", gap: 40, padding: "44px 44px 30px", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
              <div style={{ display: "flex", alignSelf: "flex-start", padding: "6px 14px", borderRadius: 999, background: b.accent, color: "#111", fontSize: 14, fontWeight: 800 }}>{up(b.business)}</div>
              <div style={{ display: "flex", fontSize: (s.upper ? 0.82 : 1) * (heading.length > 34 ? 46 : 56), lineHeight: 1.05, fontWeight: 800, color: s.text, letterSpacing: s.upper ? 1 : -1 }}>{up(heading)}</div>
              <div style={{ display: "flex", fontSize: 19, lineHeight: 1.45, color: s.muted }}>{sub}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                <div style={{ display: "flex", padding: "14px 26px", borderRadius: r, background: b.primary, color: "#fff", fontSize: 18, fontWeight: 800 }}>{up(cta)}</div>
                <div style={{ display: "flex", padding: "14px 26px", borderRadius: r, border: `2px solid ${s.text}`, color: s.text, fontSize: 18, fontWeight: 800 }}>{up(b.pages.includes("Gallery") ? "See our work" : "Learn more")}</div>
              </div>
            </div>
            {hero
              ? <img src={hero} style={{ width: 500, height: 360, objectFit: "cover", borderRadius: r }} />
              : <div style={{ display: "flex", width: 500, height: 360, borderRadius: r, background: `linear-gradient(135deg, ${b.primary}, ${b.accent})` }} />}
          </div>
          {/* Cards */}
          <div style={{ display: "flex", gap: 22, padding: "8px 44px 0" }}>
            {cards.map((c, i) => (
              <div key={c} style={{ display: "flex", flexDirection: "column", flex: 1, background: s.card, borderRadius: r, overflow: "hidden" }}>
                {photos[i]
                  ? <img src={photos[i]!} style={{ width: "100%", height: 130, objectFit: "cover" }} />
                  : <div style={{ display: "flex", height: 130, background: i % 2 ? b.accent : b.primary, opacity: 0.85 }} />}
                <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", gap: 6 }}>
                  <div style={{ display: "flex", fontSize: 20, fontWeight: 800, color: s.text }}>{up(c)}</div>
                  <div style={{ display: "flex", width: "70%", height: 8, borderRadius: 4, background: s.muted, opacity: 0.35 }} />
                  <div style={{ display: "flex", width: "50%", height: 8, borderRadius: 4, background: s.muted, opacity: 0.35 }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 44px", background: b.primary, color: "#fff", fontSize: 15 }}>
            <div style={{ display: "flex" }}>{`Concept for ${b.business} · ${DESIGN_STYLES[b.style].label}`}</div>
            <div style={{ display: "flex" }}>Designed by ZDMINC</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W, height: H,
      fonts: [
        ...(regular ? [{ name: "Inter", data: regular, weight: 400 as const }] : []),
        ...(bold ? [{ name: "Inter", data: bold, weight: 800 as const }] : []),
      ],
    },
  );
}
