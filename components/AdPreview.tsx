"use client";

import { useState } from "react";

type Place = "feed" | "reels" | "facebook";

const CSS = `
.adp { width: min(300px, 100%); flex: none; display: flex; flex-direction: column; gap: 8px; }
.adp-tabs { display: flex; gap: 4px; }
.adp-tabs button { flex: 1; min-height: 36px; border-radius: 999px; border: 1.5px solid var(--line); background: #fff; font-weight: 700; font-size: 12px; cursor: pointer; }
.adp-tabs button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.adp-phone { border: 8px solid #0b0f0e; border-radius: 30px; overflow: hidden; background: #fff; font-family: -apple-system, system-ui, sans-serif; color: #111; }
.adp-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.adp-head img, .adp-head i { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; background: var(--blue); flex: none; }
.adp-head b { font-size: 13px; display: block; line-height: 1.1; }
.adp-head small { font-size: 11px; color: #666; }
.adp-media { position: relative; background: #000; }
.adp-media video, .adp-media img { width: 100%; display: block; object-fit: cover; }
.adp-cta { display: flex; justify-content: space-between; align-items: center; padding: 9px 10px; background: #efefef; font-size: 13px; font-weight: 700; }
.adp-cap { padding: 8px 10px 12px; font-size: 13px; line-height: 1.35; }
.adp-reel { position: relative; background: #000; aspect-ratio: 9 / 16; }
.adp-reel video, .adp-reel img { width: 100%; height: 100%; object-fit: cover; }
.adp-reel .ov { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,.75)); font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
.adp-reel .ov .btn2 { background: rgba(255,255,255,.95); color: #111; border-radius: 8px; text-align: center; padding: 8px; font-weight: 800; }
`;

/** What the ad will look like on Instagram feed, Reels and Facebook, before the owner approves it. */
export default function AdPreview({ mediaUrl, isImage, caption, name, username, logo, cta = "Order now", link, placements }: {
  mediaUrl?: string; isImage?: boolean; caption: string; name: string; username?: string | null; logo?: string | null;
  cta?: string; link: string; placements?: string[] | null;
}) {
  const options: Place[] = [
    ...(!placements || placements.includes("instagram") ? (["feed", "reels"] as Place[]) : []),
    ...(!placements || placements.includes("facebook") ? (["facebook"] as Place[]) : []),
  ];
  const [place, setPlace] = useState<Place>(options[0] ?? "feed");
  const handle = username || name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const media = (style?: React.CSSProperties) => !mediaUrl ? <div style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", color: "#aaa", ...style }}>Video coming</div>
    : isImage ? <img src={mediaUrl} alt="" style={style} /> : <video src={mediaUrl} muted loop autoPlay playsInline controls={false} style={style} />;
  const [more, setMore] = useState(false);
  const text = more || caption.length <= 110 ? caption : `${caption.slice(0, 110)}…`;
  const host = link.replace(/^https?:\/\//, "").split("/")[0].toUpperCase();
  const avatar = logo ? <img src={logo} alt="" /> : <i />;

  return (
    <div className="adp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {options.length > 1 && (
        <div className="adp-tabs" role="group" aria-label="Where the ad shows">
          {options.map((p) => <button key={p} type="button" aria-pressed={place === p} onClick={() => setPlace(p)}>{p === "feed" ? "IG feed" : p === "reels" ? "IG Reels" : "Facebook"}</button>)}
        </div>
      )}
      <div className="adp-phone" aria-label="Ad preview">
        {place === "reels" ? (
          <div className="adp-reel">
            {media()}
            <div className="ov">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{logo ? <img src={logo} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} /> : null}<b>{handle}</b> · Sponsored</span>
              <span>{caption.slice(0, 90)}{caption.length > 90 ? "…" : ""}</span>
              <span className="btn2">{cta} ›</span>
            </div>
          </div>
        ) : (
          <>
            <div className="adp-head">{avatar}<span><b>{place === "facebook" ? name : handle}</b><small>Sponsored</small></span></div>
            {place === "facebook" && <div className="adp-cap" style={{ paddingTop: 0 }}>{text}{caption.length > 110 && !more && <button type="button" onClick={() => setMore(true)} style={{ border: 0, background: "none", color: "#666", cursor: "pointer" }}>See more</button>}</div>}
            <div className="adp-media">{media({ aspectRatio: "4 / 5" })}</div>
            <div className="adp-cta">{place === "facebook" ? <span><small style={{ display: "block", color: "#666", fontWeight: 400 }}>{host}</small>{name}</span> : <span>{cta}</span>}<span style={place === "facebook" ? { background: "#e4e6eb", padding: "6px 10px", borderRadius: 6 } : undefined}>{place === "facebook" ? cta : "›"}</span></div>
            {place === "feed" && <div className="adp-cap"><b>{handle}</b> {text}{caption.length > 110 && !more && <button type="button" onClick={() => setMore(true)} style={{ border: 0, background: "none", color: "#666", cursor: "pointer" }}>more</button>}</div>}
          </>
        )}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>A close match to what people will see. Meta can trim text and crop slightly per phone.</span>
    </div>
  );
}
