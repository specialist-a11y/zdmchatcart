import { igCrop } from "./posts";

/** Browser-side file prep for uploads (client components only). */
export type Rect = { x: number; y: number; w: number; h: number };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read this photo. Save it as JPEG or PNG and try again."));
    img.src = URL.createObjectURL(file);
  });
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("Couldn't read this video. Use MP4 or MOV."));
    v.src = URL.createObjectURL(file);
  });
}

/** Width, height and (for videos) length in seconds. */
export async function readMedia(file: File) {
  if (file.type.startsWith("image/")) {
    const img = await loadImage(file);
    URL.revokeObjectURL(img.src);
    return { width: img.naturalWidth, height: img.naturalHeight, seconds: null as number | null };
  }
  const v = await loadVideo(file);
  URL.revokeObjectURL(v.src);
  return { width: v.videoWidth, height: v.videoHeight, seconds: Number.isFinite(v.duration) ? v.duration : null };
}

function toJpeg(canvas: HTMLCanvasElement, name: string, quality = 0.9): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })) : reject(new Error("Couldn't convert this photo"))), "image/jpeg", quality));
}

function draw(src: CanvasImageSource, rect: Rect, maxW: number) {
  const scale = Math.min(1, maxW / rect.w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.w * scale);
  canvas.height = Math.round(rect.h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Crop a photo to `rect` (or Instagram's 4:5 to 1.91:1 range when no rect) and save as JPEG, 1440px wide at most. */
export async function preparePhoto(file: File, rect?: Rect | null) {
  const img = await loadImage(file);
  try {
    const r = rect ?? igCrop(img.naturalWidth, img.naturalHeight);
    const canvas = draw(img, r, 1440);
    return { file: await toJpeg(canvas, file.name), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** A still from about 1 second into the video (cropped to `rect` if given), as a small JPEG cover. */
export async function videoThumb(file: File, rect?: Rect | null): Promise<File | null> {
  try {
    const v = await loadVideo(file);
    await new Promise<void>((resolve) => {
      v.onseeked = () => resolve();
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
    });
    const canvas = draw(v, rect ?? { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }, 720);
    URL.revokeObjectURL(v.src);
    return await toJpeg(canvas, file.name.replace(/\.[^.]+$/, "") + "-thumb", 0.82);
  } catch {
    return null;
  }
}
