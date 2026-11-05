import { igCrop } from "./posts";

/** Browser-side file prep for uploads (client components only). */
export function duration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(Number.isFinite(v.duration) ? v.duration : null); };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

/** Instagram only accepts JPEG photos between 4:5 and 1.91:1, up to 1440px wide. Fix that here, once, on upload. */
export function toInstagramJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const c = igCrop(img.naturalWidth, img.naturalHeight);
      const scale = Math.min(1, 1440 / c.w);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(c.w * scale);
      canvas.height = Math.round(c.h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(new File([b], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })) : reject(new Error("Couldn't convert this photo"))), "image/jpeg", 0.9);
    };
    img.onerror = () => reject(new Error("Couldn't read this photo. Save it as JPEG or PNG and try again."));
    img.src = URL.createObjectURL(file);
  });
}

