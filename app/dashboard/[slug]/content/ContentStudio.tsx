"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { preparePhoto, readMedia, videoThumb } from "@/lib/media-prep";
import { checkPost, MAX_CAPTION, MAX_ITEMS, postShape, type MediaKind, type Platform } from "@/lib/posts";
import { deleteContent, getContentUploadUrl, registerContent, schedulePost, suggestCaption, toggleClip } from "./actions";
import CropDialog, { type CropChoice } from "./CropDialog";

export type LibraryItem = {
  id: string; kind: MediaKind; source: "zdm" | "client"; title: string; caption: string | null;
  url?: string; thumbUrl?: string; ratio: number | null; seconds: number | null; chosen: boolean; label: string;
};
export type Connection = { connected: boolean; igUsername: string | null; hasIg: boolean; pageName: string | null };

type Upload = { name: string; state: "waiting" | "uploading" | "cropping" | "done" | "failed" | "skipped"; error?: string };
type CropAsk = { file: File; kind: MediaKind; width: number; height: number; index: number; total: number; resolve: (c: CropChoice | null) => void };
type Filter = "all" | "image" | "video" | "zdm" | "client";

const CSS = `
.cs-drop { border: 2px dashed var(--teal); background: var(--teal-soft); border-radius: 16px; padding: 22px; align-items: center; text-align: center; cursor: pointer; transition: background .15s; }
.cs-drop.over { background: #d6e6ff; }
.cs-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.cs-filters button { padding: 5px 12px; border-radius: 999px; background: #fff; border: 1.5px solid var(--line); font-size: 13px; font-weight: 700; cursor: pointer; }
.cs-filters button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.cs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.cs-card { position: relative; background: #fff; border: 1.5px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.cs-card.sel { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(61,139,255,.25); }
.cs-media { position: relative; aspect-ratio: 4 / 5; background: #0b0f0e; cursor: pointer; border: 0; padding: 0; display: block; width: 100%; }
.cs-media img, .cs-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.cs-pick { position: absolute; top: 8px; left: 8px; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #fff; background: rgba(0,0,0,.35); color: #fff; font-weight: 800; font-size: 13px; display: grid; place-items: center; }
.cs-card.sel .cs-pick { background: var(--blue); border-color: var(--blue); color: var(--ink); }
.cs-tag { position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: 999px; background: rgba(0,0,0,.55); color: #fff; font-size: 11px; font-weight: 700; }
.cs-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.cs-body b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-x { background: none; border: 0; color: var(--coral); font-weight: 700; cursor: pointer; padding: 0; font-size: 12px; align-self: flex-start; }
.cs-composer { position: sticky; bottom: 12px; z-index: 20; background: #fff; border: 2px solid var(--ink); border-radius: 18px; padding: 16px; box-shadow: 0 18px 50px rgba(11,15,14,.18); display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr); gap: 16px; }
.cs-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.cs-thumbs button { position: relative; width: 52px; height: 64px; border-radius: 8px; overflow: hidden; border: 0; padding: 0; background: #000; cursor: pointer; }
.cs-thumbs img, .cs-thumbs video { width: 100%; height: 100%; object-fit: cover; }
.cs-thumbs span { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.45); color: #fff; font-weight: 800; opacity: 0; }
.cs-thumbs button:hover span { opacity: 1; }
.cs-plat { display: flex; gap: 8px; flex-wrap: wrap; }
.cs-plat label { flex-direction: row; align-items: center; gap: 8px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; cursor: pointer; font-size: 14px; }
.cs-plat label:has(input:checked) { border-color: var(--blue); background: var(--teal-soft); }
.cs-plat label:has(input:disabled) { opacity: .5; cursor: not-allowed; }
.cs-count { font-size: 12px; color: var(--muted); text-align: right; }
.cs-eye { position: absolute; bottom: 8px; right: 8px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: rgba(255,255,255,.92); display: grid; place-items: center; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
.cs-light { position: fixed; inset: 0; z-index: 90; background: rgba(11,15,14,.85); display: grid; place-items: center; padding: 20px; }
.cs-light video, .cs-light img { max-width: min(92vw, 720px); max-height: 82vh; border-radius: 12px; background: #000; }
.cs-light button { position: absolute; top: 16px; right: 16px; }
.cs-ai { display: inline-flex; align-items: center; gap: 6px; border: 1.5px solid var(--blue); color: var(--teal); background: var(--teal-soft); border-radius: 999px; padding: 4px 12px; font-weight: 700; font-size: 13px; cursor: pointer; }
.cs-ai:disabled { opacity: .6; cursor: wait; }
@media (max-width: 900px) { .cs-composer { grid-template-columns: 1fr; bottom: 0; border-radius: 18px 18px 0 0; } .cs-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const pad = (n: number) => String(n).padStart(2, "0");
function defaultWhen() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Media({ item, autoPlay }: { item: LibraryItem; autoPlay?: boolean }) {
  if (!item.url) return null;
  return item.kind === "image"
    ? <img src={item.url} alt={item.title} loading="lazy" />
    : <video src={item.url} poster={item.thumbUrl} muted loop playsInline preload="metadata" autoPlay={autoPlay}
        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />;
}

/* Component ---------------------------------------------------------------------------- */
export default function ContentStudio({ slug, items, conn, canPost }: { slug: string; items: LibraryItem[]; conn: Connection; canPost: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [cropAsk, setCropAsk] = useState<CropAsk | null>(null);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [writing, setWriting] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(() => [...(conn.hasIg ? ["instagram" as const] : []), ...(conn.connected ? ["facebook" as const] : [])]);
  const [when, setWhen] = useState(defaultWhen);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const shown = items.filter((i) => filter === "all" || i.kind === filter || i.source === filter);
  const chosen = selected.map((id) => byId.get(id)).filter(Boolean) as LibraryItem[];
  const kinds = chosen.map((c) => c.kind);
  const shape = kinds.length ? postShape(kinds) : null;
  const fbMix = platforms.includes("facebook") && kinds.length > 1 && kinds.includes("video");

  /** Ask the client how to crop a wide photo or video. Resolves null if they skip the file. */
  const askCrop = (a: Omit<CropAsk, "resolve">) => new Promise<CropChoice | null>((resolve) => setCropAsk({ ...a, resolve }));

  async function sendFile(file: File) {
    const signed = await getContentUploadUrl(slug, file.name);
    if ("error" in signed) throw new Error(signed.error);
    const { error } = await createClient().storage.from("client-videos").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return signed.path;
  }

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (!list.length) return;
    const start = uploads.length;
    setUploads((prev) => [...prev, ...list.map((f) => ({ name: f.name, state: "waiting" as const }))]);
    setBusyUpload(true);
    const wide = await Promise.all(list.map((f) => readMedia(f).catch(() => null)));
    for (let i = 0; i < list.length; i++) {
      const set = (patch: Partial<Upload>) => setUploads((prev) => prev.map((u, j) => (j === start + i ? { ...u, ...patch } : u)));
      const original = list[i];
      const title = original.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      try {
        const kind: MediaKind = original.type.startsWith("image/") ? "image" : "video";
        const info = wide[i];
        if (!info) throw new Error(kind === "image" ? "Couldn't read this photo" : "Couldn't read this video");
        // Horizontal: let them pick 4:5 or 9:16 and where the frame sits.
        let choice: CropChoice | null = { ratio: "original", rect: null };
        if (info.width > info.height) {
          choice = await askCrop({ file: original, kind, width: info.width, height: info.height, index: i, total: list.length });
          setCropAsk(null);
          if (!choice) { set({ state: "skipped" }); continue; }
        }
        set({ state: "uploading" });
        if (kind === "image") {
          const photo = await preparePhoto(original, choice.rect);
          const path = await sendFile(photo.file);
          const res = await registerContent(slug, { path, title, kind, seconds: null, width: photo.width, height: photo.height, thumbPath: null });
          if ("error" in res && res.error) throw new Error(res.error);
        } else {
          const thumb = await videoThumb(original, choice.rect);
          const thumbPath = thumb ? await sendFile(thumb).catch(() => null) : null;
          let path = await sendFile(original);
          let width = info.width, height = info.height;
          if (choice.rect) {
            set({ state: "cropping" });
            const r = await fetch("/api/content/crop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, path, rect: choice.rect }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error ?? "Couldn't crop the video");
            path = j.path; width = j.width; height = j.height;
          }
          const res = await registerContent(slug, { path, title, kind, seconds: info.seconds, width, height, thumbPath });
          if ("error" in res && res.error) throw new Error(res.error);
        }
        set({ state: "done" });
      } catch (e: any) {
        set({ state: "failed", error: e?.message ?? "Upload failed" });
      }
    }
    setBusyUpload(false);
    router.refresh();
  }

  async function writeCaption(ids = selected) {
    if (!ids.length) return;
    setWriting(true);
    const res = await suggestCaption(slug, ids);
    setWriting(false);
    if ("caption" in res && res.caption) setCaption(res.caption);
    else if ("error" in res) setMsg({ error: res.error });
  }

  function toggle(id: string) {
    setMsg({});
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= MAX_ITEMS ? selected : [...selected, id];
    setSelected(next);
    // First item picked and no caption yet: start from the item's own caption, or have the AI write one.
    if (selected.length === 0 && next.length === 1 && !caption.trim()) {
      const own = byId.get(id)?.caption;
      if (own) setCaption(own);
      else void writeCaption(next);
    }
  }

  async function submit(now: boolean) {
    const at = now ? new Date() : new Date(when);
    const problem = checkPost({ kinds, ratios: chosen.map((c) => c.ratio), platforms, caption, when: at });
    if (problem) return setMsg({ error: problem });
    setSending(true);
    setMsg({});
    const res = await schedulePost(slug, { mediaIds: selected, platforms, caption, when: at.toISOString(), now });
    setSending(false);
    if ("error" in res && res.error) return setMsg({ error: res.error });
    setMsg({ ok: now ? "Posting now. It'll show as posted in a minute or two (videos can take longer)." : `Scheduled for ${at.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.` });
    setSelected([]);
    setCaption("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this from your library?")) return;
    const res = await deleteContent(slug, id);
    if ("error" in res && res.error) alert(res.error);
    setSelected((s) => s.filter((x) => x !== id));
    router.refresh();
  }

  const counts = { all: items.length, image: items.filter((i) => i.kind === "image").length, video: items.filter((i) => i.kind === "video").length, zdm: items.filter((i) => i.source === "zdm").length, client: items.filter((i) => i.source === "client").length };

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <label className={`cs-drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        <strong style={{ fontSize: 16 }}>Drop photos and videos here, or click to choose</strong>
        <span className="muted" style={{ fontWeight: 400 }}>JPEG, PNG, MP4 or MOV. Photos are resized for Instagram automatically.</span>
        <input type="file" accept="image/*,video/*" multiple disabled={busyUpload} onChange={(e) => e.target.files && upload(e.target.files)} style={{ display: "none" }} />
      </label>
      {uploads.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          {uploads.map((u, i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14 }}>{u.name}</strong>
              <span className={`badge ${u.state === "done" ? "paid" : u.state === "failed" ? "failed" : "sent"}`}>{u.state === "failed" ? u.error : u.state === "cropping" ? "cropping video…" : u.state === "uploading" ? "uploading…" : u.state}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="cs-filters" role="group" aria-label="Filter library">
          {([["all", "All"], ["image", "Photos"], ["video", "Videos"], ["zdm", "From ZDMINC"], ["client", "Your uploads"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} · {counts[k]}</button>
          ))}
        </div>
        {canPost && <span className="muted" style={{ fontSize: 13 }}>Tap photos and videos to build a post.</span>}
      </div>

      {!shown.length && <p className="muted">Nothing here yet. Upload photos and videos above. ZDMINC lets you know on WhatsApp when your shoot clips are ready.</p>}

      <div className="cs-grid">
        {shown.map((it) => {
          const n = selected.indexOf(it.id);
          return (
            <div key={it.id} className={`cs-card${n >= 0 ? " sel" : ""}`}>
              <div style={{ position: "relative" }}>
                <button type="button" className="cs-media" onClick={() => (canPost ? toggle(it.id) : setPreview(it))} aria-pressed={n >= 0} aria-label={`${n >= 0 ? "Remove" : "Add"} ${it.title} ${n >= 0 ? "from" : "to"} post`}>
                  <Media item={it} />
                  {canPost && <span className="cs-pick">{n >= 0 ? n + 1 : ""}</span>}
                  <span className="cs-tag">{it.kind === "video" ? `▶ ${it.seconds ? `${it.seconds}s` : "Video"}` : "Photo"}</span>
                </button>
                <button type="button" className="cs-eye" onClick={() => setPreview(it)} aria-label={`${it.kind === "video" ? "Play" : "View"} ${it.title}`} title={it.kind === "video" ? "Play with sound" : "View"}>
                  {it.kind === "video"
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b0f0e"><path d="M7 4v16l13-8z" /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b0f0e" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>}
                </button>
              </div>
              <div className="cs-body">
                <b title={it.title}>{it.title}</b>
                <span className="muted">{it.label}</span>
                {it.source === "zdm" ? (
                  <button type="button" className={`btn small ${it.chosen ? "blue" : "secondary"}`} onClick={async () => { await toggleClip(slug, it.id, !it.chosen); router.refresh(); }}>
                    {it.chosen ? "ZDMINC will post ✓" : "Ask ZDMINC to post"}
                  </button>
                ) : canPost ? <button type="button" className="cs-x" onClick={() => remove(it.id)}>Delete</button> : null}
              </div>
            </div>
          );
        })}
      </div>

      {msg.ok && !chosen.length && <p className="ok" role="status">{msg.ok}</p>}

      {canPost && chosen.length > 0 && (
        <section className="cs-composer" aria-label="New post">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 22 }}>New post · {chosen.length} item{chosen.length > 1 ? "s" : ""}</h2>
              <button type="button" className="cs-x" style={{ color: "var(--muted)" }} onClick={() => setSelected([])}>Clear</button>
            </div>
            <div className="cs-thumbs">
              {chosen.map((c) => (
                <button key={c.id} type="button" onClick={() => toggle(c.id)} title="Remove"><Media item={c} /><span>✕</span></button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label htmlFor="cs-caption" style={{ margin: 0 }}>Caption</label>
              <button type="button" className="cs-ai" disabled={writing} onClick={() => writeCaption()}>✨ {writing ? "Writing…" : caption.trim() ? "Rewrite with AI" : "Write with AI"}</button>
            </div>
            <textarea id="cs-caption" rows={5} value={caption} maxLength={MAX_CAPTION} disabled={writing}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={writing ? "Writing a caption from your photos…" : "Fresh coconut drops are back 🥥\nOrder on WhatsApp, link in bio.\n#barbados #bakery"} />
            <span className="cs-count">{caption.length} / {MAX_CAPTION}</span>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            {!conn.connected ? (
              <p className="error" style={{ margin: 0 }}>Connect Instagram and Facebook in <a href={`/dashboard/${slug}/settings#social`}>Settings</a> to post.</p>
            ) : (
              <div className="cs-plat">
                <label>
                  <input type="checkbox" disabled={!conn.hasIg} checked={platforms.includes("instagram")}
                    onChange={(e) => setPlatforms((p) => (e.target.checked ? [...p, "instagram"] : p.filter((x) => x !== "instagram")))} />
                  Instagram{conn.igUsername ? ` @${conn.igUsername}` : ""}
                </label>
                <label>
                  <input type="checkbox" checked={platforms.includes("facebook")}
                    onChange={(e) => setPlatforms((p) => (e.target.checked ? [...p, "facebook"] : p.filter((x) => x !== "facebook")))} />
                  Facebook{conn.pageName ? ` · ${conn.pageName}` : ""}
                </label>
              </div>
            )}
            {shape && (
              <span className="muted" style={{ fontSize: 13 }}>
                {platforms.includes("instagram") && <>Instagram: <b>{shape.instagram}</b>. </>}
                {platforms.includes("facebook") && <>Facebook: <b>{shape.facebook}</b>.</>}
              </span>
            )}
            {fbMix && <p className="error" style={{ margin: 0, fontSize: 13 }}>Facebook can't mix a video with other items. Post the video alone, or untick Facebook.</p>}
            <label>
              When
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <div className="row">
              <button type="button" className="btn" disabled={sending || !conn.connected || fbMix} onClick={() => submit(false)}>{sending ? "Saving..." : "Schedule"}</button>
              <button type="button" className="btn secondary" disabled={sending || !conn.connected || fbMix} onClick={() => submit(true)}>Post now</button>
            </div>
            {msg.error && <p className="error" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
          </div>
        </section>
      )}

      {cropAsk && <CropDialog key={cropAsk.index} {...cropAsk} onDone={(c) => cropAsk.resolve(c)} />}

      {preview?.url && (
        <div className="cs-light" role="dialog" aria-modal="true" aria-label={preview.title} onClick={() => setPreview(null)}>
          <button type="button" className="btn secondary small" onClick={() => setPreview(null)}>Close ✕</button>
          {preview.kind === "video"
            ? <video src={preview.url} poster={preview.thumbUrl} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
            : <img src={preview.url} alt={preview.title} onClick={(e) => e.stopPropagation()} />}
        </div>
      )}
    </div>
  );
}
