import "server-only";

/**
 * A remote image as a PNG data URI for generated images (next/og can't draw WebP). Null if it can't be loaded.
 * `fit: "cover"` crops to fill the box, "inside" keeps the whole image.
 */
export async function pngDataUri(url: string | null | undefined, w: number, h: number, fit: "cover" | "inside" = "cover"): Promise<string | null> {
  try {
    if (!url || !/^https:\/\//.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8_000_000) return null;
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf).resize(w, h, { fit, withoutEnlargement: fit === "inside" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** A Google font as TTF bytes for next/og, or null (the default font is used then). */
export async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
      signal: AbortSignal.timeout(4000),
    }).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
    return res.ok ? res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** A logo as PNG, plus whether it's mostly white (so it needs a dark backing on light pages). */
export async function logoDataUri(url: string | null | undefined, w: number, h: number): Promise<{ src: string; light: boolean } | null> {
  const src = await pngDataUri(url, w, h, "inside");
  if (!src) return null;
  try {
    const sharp = (await import("sharp")).default;
    const { data: px } = await sharp(Buffer.from(src.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let seen = 0, white = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      seen++;
      if (px[i] > 215 && px[i + 1] > 215 && px[i + 2] > 215) white++;
    }
    return { src, light: seen > 0 && seen < px.length / 4 && white / seen > 0.15 };
  } catch {
    return { src, light: false };
  }
}
