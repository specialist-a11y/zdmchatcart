import QRCode from "qrcode";

/** An SVG QR code for a link (payment link, shop link, short link). Medium error correction survives printing and small logos. */
export async function qrSvg(text: string, opts: { dark?: string; light?: string } = {}) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: opts.dark ?? "#0B0F0E", light: opts.light ?? "#FFFFFF" } });
}
