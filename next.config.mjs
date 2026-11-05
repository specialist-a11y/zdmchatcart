import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The video crop route runs ffmpeg; ship the binary with that function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/content/crop": ["./node_modules/ffmpeg-static/ffmpeg"] },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;

