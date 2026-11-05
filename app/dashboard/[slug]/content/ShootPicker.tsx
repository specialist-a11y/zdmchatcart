"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadUrl, type Platform } from "@/lib/posts";
import { captionClip, decideClip, sendChosenToCalendar, type ClipComment } from "./actions";
import ClipComments from "./ClipComments";
import type { Connection } from "./ContentStudio";

export type Shoot = { id: string; month: string; shoot_date: string | null };
/** Items ZDMINC added straight to the library (no shoot) are grouped under this id. */
export const EXTRAS = "extras";
export type Clip = {
  id: string; shoot_id: string | null; kind: "video" | "image"; title: string; caption: string | null; seconds: number | null;
  url?: string; thumbUrl?: string; chosen: boolean; skipped: boolean; scheduled: boolean; comments?: ClipComment[];
};

const CSS = `
.sp-tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sp-tabs button { padding: 6px 14px; border-radius: 999px; border: 1.5px solid var(--line); background: #fff; font-size: 13px; font-weight: 700; cursor: pointer; color: var(--ink); }
.sp-tabs button.month[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.sp-tabs button.month[aria-pressed="false"] { background: var(--teal-soft); border-color: var(--teal-soft); color: var(--teal); }
.sp-tabs button.len[aria-pressed="true"] { border-color: var(--ink); background: var(--sand); }
.sp-tabs i { width: 1.5px; height: 22px; background: var(--line); margin: 0 4px; }
.sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.sp-card { background: #fff; border: 1.5px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.sp-card.use { border: 2px solid var(--teal); box-shadow: 0 0 0 3px rgba(61,139,255,.15); }
.sp-card.skip { opacity: .72; }
.sp-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.sp-media video, .sp-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sp-media video[data-playing] { object-fit: contain; background: #000; }
.sp-write { align-self: flex-start; border: 1.5px solid var(--blue); color: var(--teal); background: var(--teal-soft); border-radius: 999px; padding: 3px 10px; font-weight: 700; font-size: 12px; cursor: pointer; margin-bottom: 8px; }
.sp-write:disabled { opacity: .6; cursor: wait; }
.sp-chip { position: absolute; top: 8px; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }
.sp-chip.len { left: 8px; background: rgba(11,15,14,.85); color: #fff; }
.sp-chip.state { right: 8px; background: #fff; color: var(--ink); }
.sp-chip.state.sched { background: var(--blue); color: var(--ink); }
.sp-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.92); display: grid; place-items: center; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); transition: transform .15s; }
.sp-play:hover { transform: translate(-50%, -50%) scale(1.08); }
.sp-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sp-body b { font-size: 15px; }
.sp-body p { margin: 0 0 8px; color: var(--ink-soft); font-size: 13px; line-height: 1.4; flex: 1; }
.sp-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sp-btns button { min-height: 40px; border-radius: 10px; font-weight: 700; cursor: pointer; border: 1.5px solid var(--teal); background: #fff; color: var(--teal); }
.sp-btns button.on.u { background: var(--teal); color: #fff; }
.sp-btns button.s { border-color: #b8c2bf; color: var(--ink-soft); }
.sp-btns button.on.s { background: #9fb0ac; border-color: #9fb0ac; color: #fff; }
.sp-btns button:disabled { cursor: default; }
.sp-cal { border: 2px solid var(--coral); border-radius: 16px; background: #fff; padding: 16px; display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.sp-cal label { min-width: 160px; }
.sp-cal .plat { flex-direction: row; align-items: center; gap: 8px; min-width: 0; font-weight: 600; }
@media (max-width: 900px) { .sp-grid { grid-template-columns: 1fr; } }
`;

const FALLBACK = ["#4a2c22", "#c4914f", "#1b6e6a", "#e2b86a", "#b5682a", "#7e2a1e", "#2f4440", "#d4906c"];
const bucket = (s: number | null): number | null => (s == null ? null : s <= 10 ? 6 : s <= 20 ? 15 : s <= 45 ? 30 : 60);
const monthName = (m: string) => (m === EXTRAS ? "Extras" : new Date(`${m}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" }));
const pad = (n: number) => String(n).padStart(2, "0");
function tomorrowTen() {
  const d = new Date(Date.now() + 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export default function ShootPicker({ slug, shoots: realShoots, clips: initial, conn, canPost }: { slug: string; shoots: Shoot[]; clips: Clip[]; conn: Connection; canPost: boolean }) {
  const router = useRouter();
  const [clips, setClips] = useState(initial);
  // Photos and videos ZDMINC added outside a shoot show under "Extras".
  const shoots = useMemo(() => [...realShoots, ...(initial.some((c) => !c.shoot_id) ? [{ id: EXTRAS, month: EXTRAS, shoot_date: null }] : [])], [realShoots, initial]);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const [writing, setWriting] = useState<string | null>(null);
  const [shootId, setShootId] = useState(shoots[0]?.id ?? null);
  const [len, setLen] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [start, setStart] = useState(tomorrowTen);
  const [every, setEvery] = useState(2);
  const [platforms, setPlatforms] = useState<Platform[]>(() => [...(conn.hasIg ? ["instagram" as const] : []), ...(conn.connected ? ["facebook" as const] : [])]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const shoot = shoots.find((s) => s.id === shootId) ?? null;
  const inShoot = clips.filter((c) => (c.shoot_id ?? EXTRAS) === shootId);
  const lengths = useMemo(() => [...new Set(inShoot.map((c) => bucket(c.seconds)).filter((b): b is number => b != null))].sort((a, b) => a - b), [inShoot]);
  const shown = inShoot.filter((c) => len == null || bucket(c.seconds) === len);
  const chosen = inShoot.filter((c) => c.chosen);
  const toSend = chosen.filter((c) => !c.scheduled);

  async function decide(c: Clip, d: "use" | "skip") {
    const next = (d === "use" && c.chosen) || (d === "skip" && c.skipped) ? "new" : d;
    setClips((all) => all.map((x) => (x.id === c.id ? { ...x, chosen: next === "use", skipped: next === "skip" } : x)));
    await decideClip(slug, c.id, next);
  }

  /** Play with sound: start playback inside the click itself, which browsers require for audio. */
  function play(c: Clip) {
    const v = videoRefs.current.get(c.id);
    videoRefs.current.forEach((other, id) => { if (id !== c.id) other.pause(); });
    setPlaying(c.id);
    if (v) { v.muted = false; v.controls = true; v.currentTime = 0; v.play().catch(() => {}); }
  }

  async function writeFor(c: Clip) {
    setWriting(c.id);
    const res = await captionClip(slug, c.id);
    setWriting(null);
    if ("caption" in res && res.caption) setClips((all) => all.map((x) => (x.id === c.id ? { ...x, caption: res.caption! } : x)));
    else if ("error" in res) setMsg({ error: res.error });
  }

  async function send() {
    setBusy(true);
    setMsg({});
    const res = await sendChosenToCalendar(slug, { clipIds: toSend.map((c) => c.id), start: new Date(start).toISOString(), everyDays: every, platforms });
    setBusy(false);
    if ("error" in res && res.error) return setMsg({ error: res.error });
    const ids = new Set(toSend.map((c) => c.id));
    setClips((all) => all.map((x) => (ids.has(x.id) ? { ...x, scheduled: true } : x)));
    setCalOpen(false);
    const last = "last" in res && res.last ? new Date(res.last).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
    setMsg({ ok: `Added ${"count" in res ? res.count : ""} posts to the calendar${last ? `, through ${last}` : ""}.` });
    router.refresh();
  }

  if (!shoots.length) return <p className="muted">No ZDMINC videos yet. ZDMINC lets you know on WhatsApp when this month's clips are ready.</p>;

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ fontSize: 30 }}>{shoot ? (shoot.id === EXTRAS ? "Extras from ZDMINC" : `${monthName(shoot.month)} ${inShoot.some((c) => c.kind === "image") ? "content" : "videos"}`) : "Videos"}</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {shoot?.shoot_date ? `Filmed ${new Date(`${shoot.shoot_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} by ZDMINC · ` : "By ZDMINC · "}
            {inShoot.length} {inShoot.every((c) => c.kind === "video") ? `video${inShoot.length === 1 ? "" : "s"}` : `item${inShoot.length === 1 ? "" : "s"}`} ready · choose the ones you want posted
          </p>
        </div>
        <div className="row">
          <b style={{ fontSize: 14 }}>{chosen.length} of {inShoot.length} chosen</b>
          {canPost && (
            <button type="button" className="btn coral" disabled={!toSend.length} onClick={() => { setMsg({}); setCalOpen((o) => !o); }}>
              {toSend.length || !chosen.length ? "Send chosen to calendar" : "All chosen are scheduled ✓"}
            </button>
          )}
        </div>
      </div>

      {calOpen && (
        <div className="sp-cal">
          <div style={{ flexBasis: "100%" }}><b>Add {toSend.length} video{toSend.length > 1 ? "s" : ""} to the calendar.</b> <span className="muted" style={{ fontSize: 13 }}>Each one becomes its own post with its caption (any without one get an AI caption). You can cancel any post later.</span></div>
          <label>First post<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>Then one every
            <select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
              {[1, 2, 3, 4, 7].map((d) => <option key={d} value={d}>{d === 1 ? "day" : d === 7 ? "week" : `${d} days`}</option>)}
            </select>
          </label>
          {conn.connected ? (
            <div className="row" style={{ gap: 14, paddingBottom: 10 }}>
              <label className="plat"><input type="checkbox" disabled={!conn.hasIg} checked={platforms.includes("instagram")} onChange={(e) => setPlatforms((p) => (e.target.checked ? [...p, "instagram"] : p.filter((x) => x !== "instagram")))} /> Instagram</label>
              <label className="plat"><input type="checkbox" checked={platforms.includes("facebook")} onChange={(e) => setPlatforms((p) => (e.target.checked ? [...p, "facebook"] : p.filter((x) => x !== "facebook")))} /> Facebook</label>
            </div>
          ) : <p className="error" style={{ margin: 0 }}>Connect Instagram and Facebook in <a href={`/dashboard/${slug}/settings#social`}>Settings</a> first.</p>}
          <button type="button" className="btn coral" disabled={busy || !conn.connected || !platforms.length} onClick={send}>{busy ? "Adding..." : `Add ${toSend.length} post${toSend.length > 1 ? "s" : ""}`}</button>
        </div>
      )}
      {msg.error && <p className="error" role="alert">{msg.error}</p>}
      {msg.ok && <p className="ok" role="status">{msg.ok}</p>}

      <div className="sp-tabs">
        {shoots.map((s) => (
          <button key={s.id} type="button" className="month" aria-pressed={s.id === shootId} onClick={() => { setShootId(s.id); setLen(null); setPlaying(null); }}>{monthName(s.month)}</button>
        ))}
        {lengths.length > 1 && <>
          <i />
          <button type="button" className="len" aria-pressed={len == null} onClick={() => setLen(null)}>All lengths</button>
          {lengths.map((l) => <button key={l} type="button" className="len" aria-pressed={len === l} onClick={() => setLen(l)}>{l}s</button>)}
        </>}
      </div>

      <div className="sp-grid">
        {shown.map((c, i) => {
          const state = c.scheduled ? "Scheduled" : c.chosen ? "Chosen" : c.skipped ? "Skipped" : "New";
          return (
            <article key={c.id} className={`sp-card${c.chosen ? " use" : c.skipped ? " skip" : ""}`}>
              <div className="sp-media" style={{ background: FALLBACK[i % FALLBACK.length] }}>
                {c.url && c.kind === "image" && <img src={c.url} alt={c.title} loading="lazy" />}
                {c.url && c.kind === "video" && (
                  <video ref={(el) => { if (el) videoRefs.current.set(c.id, el); else videoRefs.current.delete(c.id); }}
                    src={c.thumbUrl ? c.url : `${c.url}#t=0.1`} poster={c.thumbUrl} preload="metadata" playsInline
                    data-playing={playing === c.id ? "" : undefined}
                    onPause={(e) => { if (e.currentTarget.ended) setPlaying(null); }} onEnded={() => setPlaying(null)} />
                )}
                {c.seconds && playing !== c.id && <span className="sp-chip len">{c.seconds}s</span>}
                {c.kind === "image" && <span className="sp-chip len">Photo</span>}
                {playing !== c.id && <span className={`sp-chip state${c.scheduled ? " sched" : ""}`}>{state}</span>}
                {c.url && c.kind === "video" && playing !== c.id && (
                  <button type="button" className="sp-play" aria-label={`Play ${c.title} with sound`} onClick={() => play(c)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b0f0e"><path d="M7 4v16l13-8z" /></svg>
                  </button>
                )}
              </div>
              <div className="sp-body">
                <b>{c.title}</b>
                <p>{c.caption || <span className="muted">No caption yet</span>}</p>
                {c.url && (
                  <span className="row" style={{ gap: 12, fontSize: 13, fontWeight: 700 }}>
                    <a href={c.url} target="_blank" rel="noreferrer">Open full size ↗</a>
                    <a href={downloadUrl(c.url, c.title, c.kind)}>Download</a>
                  </span>
                )}
                {canPost && !c.scheduled && (
                  <button type="button" className="sp-write" disabled={writing === c.id} onClick={() => writeFor(c)}>
                    ✨ {writing === c.id ? "Writing…" : c.caption ? "Rewrite caption" : "Write caption"}
                  </button>
                )}
                <ClipComments slug={slug} clipId={c.id} initial={c.comments ?? []} />
                <div className="sp-btns">
                  <button type="button" className={`u${c.chosen ? " on" : ""}`} disabled={c.scheduled} aria-pressed={c.chosen} onClick={() => decide(c, "use")}>{c.scheduled ? "Scheduled" : "Use"}</button>
                  <button type="button" className={`s${c.skipped ? " on" : ""}`} disabled={c.scheduled} aria-pressed={c.skipped} onClick={() => decide(c, "skip")}>Skip</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && <p className="muted">No clips of that length this month.</p>}
    </div>
  );
}
