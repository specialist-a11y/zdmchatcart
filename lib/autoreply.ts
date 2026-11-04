/** Instagram comment auto-reply rules (pure, tested). */

export type Rule = { id: string; keyword: string; media_id: string | null; active: boolean; public_replies: string[]; dm_text: string };

export const normaliseKeyword = (k: string) => k.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);

/** Does the comment contain the keyword as a word? "cake!!", "CAKE 🎂", "yes cake please" match; "cupcake" doesn't. */
export function hasKeyword(comment: string, keyword: string) {
  const words = comment.toUpperCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Z0-9]+/);
  return words.includes(keyword);
}

/** The rule for this comment: a rule for this exact post wins over an "every post" rule. */
export function matchRule<R extends Rule>(comment: string, mediaId: string | null | undefined, rules: R[]): R | null {
  const live = rules.filter((r) => r.active && hasKeyword(comment, r.keyword));
  return live.find((r) => r.media_id && r.media_id === mediaId) ?? live.find((r) => !r.media_id) ?? null;
}

/** Rotate public replies so a busy post doesn't show the same line over and over. */
export function pickReply(replies: string[], seed: string) {
  const list = replies.map((r) => r.trim()).filter(Boolean);
  if (!list.length) return "Sent! Check your DMs";
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length]!;
}

export function publicReply(username: string | null | undefined, text: string) {
  return username ? `@${username} ${text}` : text;
}

/** Fill {name} and {link}. Name comes from the username: "tara.best" -> "Tara". */
export function fillDm(template: string, vars: { username?: string | null; link: string }) {
  const first = (vars.username ?? "").split(/[._\d]/).filter(Boolean)[0] ?? "";
  const name = first ? first[0]!.toUpperCase() + first.slice(1).toLowerCase() : "there";
  const out = template.replace(/\{name\}/gi, name).replace(/\{link\}/gi, vars.link);
  return /\{link\}/i.test(template) ? out : `${out}\n${vars.link}`;
}

/** Instagram webhook "comments" changes for this payload. */
export type IgComment = { igUserId: string; commentId: string; text: string; mediaId: string | null; fromId: string | null; fromUsername: string | null };
export function parseComments(payload: any): IgComment[] {
  const out: IgComment[] = [];
  if (payload?.object !== "instagram") return out;
  for (const e of payload.entry ?? []) {
    for (const ch of e.changes ?? []) {
      if (ch.field !== "comments" || !ch.value?.id || typeof ch.value.text !== "string") continue;
      out.push({
        igUserId: String(e.id), commentId: String(ch.value.id), text: ch.value.text,
        mediaId: ch.value.media?.id ? String(ch.value.media.id) : null,
        fromId: ch.value.from?.id ? String(ch.value.from.id) : null,
        fromUsername: ch.value.from?.username ?? null,
      });
    }
  }
  return out;
}
