"use client";

import { useRef } from "react";

export type QuickReply = { id: string; title: string; body: string };

/** Reply textarea with one-tap saved replies. {name} and {shop_link} are filled in for this customer. */
export default function ReplyBox({ replies, placeholder, vars }: { replies: QuickReply[]; placeholder: string; vars: { name: string; shop_link: string } }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fill = (body: string) => body.replace(/\{name\}/g, vars.name).replace(/\{shop_link\}/g, vars.shop_link);
  function use(body: string) {
    const el = ref.current;
    if (!el) return;
    const text = fill(body);
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n${text}` : text;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
  return (
    <>
      {replies.length > 0 && (
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Saved replies">
          {replies.map((r) => (
            <button key={r.id} type="button" className="btn secondary small" title={fill(r.body)} onClick={() => use(r.body)}>{r.title}</button>
          ))}
        </div>
      )}
      <textarea ref={ref} name="body" rows={3} placeholder={placeholder} required />
    </>
  );
}
