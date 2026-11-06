import type { MetadataRoute } from "next";
import { shopForThisHost } from "@/lib/seo-hosts";

const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/** Shops and the homepage are open to search engines; the CRM, admin, sign-in and APIs are not. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const own = await shopForThisHost();
  const base = own ? `https://${own.host}` : site();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/admin-login", "/admin-setup", "/login", "/auth", "/api/", "/preview", "/l/"] }],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
    host: base || undefined,
  };
}
