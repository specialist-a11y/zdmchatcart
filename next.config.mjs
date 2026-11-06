import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The video crop route runs ffmpeg; ship the binary with that function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/content/crop": ["./node_modules/ffmpeg-static/ffmpeg"] },
  // Transfer screenshots and product CSVs are uploaded through server actions.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // Keep private and sign-in pages out of search results (robots.txt asks too; this makes it certain).
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return ["/dashboard/:path*", "/admin/:path*", "/admin", "/login", "/admin-login", "/admin-setup", "/auth/:path*", "/preview/:path*", "/preview"]
      .map((source) => ({ source, headers: noindex }));
  },
};

export default nextConfig;

