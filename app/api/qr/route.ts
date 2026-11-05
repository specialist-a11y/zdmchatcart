import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";

/**
 * QR code for a link, as PNG (default) or SVG. Used by the website page for flyers, counter signs and packaging.
 * ?text=https://...&format=png|svg&download=name
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const text = (p.get("text") ?? "").trim();
  if (!/^https?:\/\/\S{3,500}$/.test(text)) return new NextResponse("A link starting with http is needed", { status: 400 });
  const name = (p.get("download") ?? "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  const disposition: Record<string, string> = name ? { "Content-Disposition": `attachment; filename="${name}.${p.get("format") === "svg" ? "svg" : "png"}"` } : {};
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#0B0F0E", light: "#FFFFFF" } };
  if (p.get("format") === "svg") {
    const svg = await QRCode.toString(text, { ...opts, type: "svg" });
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400, immutable", ...disposition } });
  }
  const png = await QRCode.toBuffer(text, { ...opts, type: "png", width: 1024 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable", ...disposition } });
}
