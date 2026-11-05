"use client";

import { useState } from "react";
import { addClipComment, type ClipComment } from "./actions";

/** Comments and change requests on one clip, like "shorten the intro" or "use this one, change the caption". */
export default function ClipComments({ slug, clipId, initial }: { slug: string; clipId: string; initial: ClipComment[] }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"comment" | "change">("change");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openChanges = list.filter((c) => c.kind === "change" && !c.resolved_at).length;

  async function send() {
    setBusy(true);
    setError("");
    const res = await addClipComment(slug, clipId, kind, text);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setList([...list, res.comment]);
    setText("");
  }

  return (
    <div style={{ fontSize: 13 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ background: "none", border: 0, padding: "6px 0", minHeight: 32, cursor: "pointer", fontWeight: 700, color: openChanges ? "#8a4b00" : "var(--teal)" }}>
        💬 {list.length ? `${list.length} comment${list.length === 1 ? "" : "s"}` : "Comment or ask for a change"}{openChanges ? ` · ${openChanges} change${openChanges === 1 ? "" : "s"} asked` : ""}
      </button>
      {open && (
        <div className="stack" style={{ gap: 6 }}>
          {list.map((c) => (
            <div key={c.id} style={{ background: c.from_staff ? "var(--teal-soft)" : "#f6f7f6", borderRadius: 8, padding: "6px 8px" }}>
              <b>{c.from_staff ? "ZDMINC" : c.author_name}</b>{c.kind === "change" && <span className="badge high" style={{ marginLeft: 6, fontSize: 10, textTransform: "none" }}>{c.resolved_at ? "Change done" : "Change asked"}</span>}
              <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
          <div className="row" style={{ gap: 6 }} role="group" aria-label="Type">
            {(["change", "comment"] as const).map((k) => (
              <button key={k} type="button" className={`btn small ${kind === k ? "" : "secondary"}`} aria-pressed={kind === k} onClick={() => setKind(k)} style={{ minHeight: 32, padding: "4px 10px" }}>
                {k === "change" ? "Ask for a change" : "Just a comment"}
              </button>
            ))}
          </div>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Your comment"
            placeholder={kind === "change" ? "Shorten the intro, change the caption to…" : "Love this one!"} />
          {error && <span className="error">{error}</span>}
          <button type="button" className="btn small" disabled={busy || !text.trim()} onClick={send} style={{ alignSelf: "flex-start" }}>{busy ? "Sending…" : "Send to ZDMINC"}</button>
        </div>
      )}
    </div>
  );
}
