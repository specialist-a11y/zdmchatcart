import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

export type Rect = { x: number; y: number; w: number; h: number };

/** Even numbers only: H.264 needs them. */
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * Crops a video to the chosen frame (4:5 or 9:16) and re-encodes it the way Instagram likes:
 * H.264 + AAC MP4, 1080px wide at most, fast-start. Returns the new file and its size.
 */
export async function cropVideo(input: Uint8Array, rect: Rect): Promise<{ data: Buffer; width: number; height: number }> {
  if (!ffmpegPath) throw new Error("Video tools aren't installed on the server.");
  const dir = await mkdtemp(join(tmpdir(), "crop-"));
  const src = join(dir, "in"), out = join(dir, "out.mp4");
  try {
    await writeFile(src, input);
    const w = even(rect.w), h = even(rect.h), x = Math.max(0, Math.round(rect.x)), y = Math.max(0, Math.round(rect.y));
    const outW = Math.min(1080, w), outH = even((h * outW) / w);
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-i", src,
      "-vf", `crop=${w}:${h}:${x}:${y},scale=${outW}:${outH},setsar=1`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out,
    ];
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath as string, args);
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Couldn't crop the video: ${err.slice(-300) || `ffmpeg exit ${code}`}`))));
    });
    return { data: await readFile(out), width: outW, height: outH };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
