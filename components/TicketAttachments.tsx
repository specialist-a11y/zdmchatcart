import type { SupabaseClient } from "@supabase/supabase-js";

type Att = { path: string; name: string; type: string };

/** Signed links (1 hour) for every attachment in a support thread. */
export async function signAttachments(client: SupabaseClient, thread: any[]) {
  const paths = thread.flatMap((m) => ((m.attachments ?? []) as Att[]).map((a) => a.path));
  if (!paths.length) return new Map<string, string>();
  const { data } = await client.storage.from("support-files").createSignedUrls(paths, 3600);
  return new Map((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
}

/** Thumbnails for a message's screenshots and videos. */
export function TicketAttachments({ items, urls }: { items?: Att[] | null; urls: Map<string, string> }) {
  if (!items?.length) return null;
  return (
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      {items.map((a) => {
        const url = urls.get(a.path);
        if (!url) return <span key={a.path} className="muted" style={{ fontSize: 13 }}>{a.name}</span>;
        return a.type.startsWith("video") ? (
          <video key={a.path} src={url} controls playsInline preload="metadata" style={{ width: 200, maxWidth: "100%", borderRadius: 10, background: "#000" }} />
        ) : (
          <a key={a.path} href={url} target="_blank" rel="noreferrer" title={a.name}>
            <img src={url} alt={a.name} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
          </a>
        );
      })}
    </div>
  );
}
