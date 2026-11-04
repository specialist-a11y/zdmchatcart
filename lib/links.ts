/** Domain and short-link rules (pure, tested). */

export function normaliseDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) || d.length > 253) return null;
  return d;
}

/** The registered name: islandcrumb.com, or islandcrumb.com.bb for two-level endings like .com.bb and .co.uk. */
export function apexOf(domain: string) {
  const parts = domain.split(".");
  const twoLevel = /^(com|co|org|net|gov|edu)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(-(twoLevel ? 3 : 2)).join(".");
}
export const isApex = (domain: string) => apexOf(domain) === domain;

/** Apex domains need an A record; subdomains (www., shop.) a CNAME. */
export function dnsRecord(domain: string) {
  const a = process.env.DOMAIN_A_RECORD || "76.76.21.21";
  const cname = process.env.DOMAIN_CNAME_TARGET || "cname.vercel-dns.com";
  if (isApex(domain)) return { type: "A" as const, host: "@", value: a };
  return { type: "CNAME" as const, host: domain.slice(0, -(apexOf(domain).length + 1)), value: cname };
}

export function slugifyCode(input: string) {
  return input.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export const validCode = (c: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(c);
export const validRef = (r: string) => /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(r);

/** The short URL people share: the shop's own domain if live (islandcrumb.com/cake), else a short domain (zdm.bb/cake), else {site}/l/cake. */
export function shortUrl(code: string, domain?: string | null) {
  if (domain) return `https://${domain}/${code}`;
  const short = (process.env.NEXT_PUBLIC_SHORT_URL ?? "").replace(/\/$/, "");
  if (short) return `${short}/${code}`;
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/l/${code}`;
}

/** Where a short link sends people: their own domain if live, else the shop page. */
export function linkTarget(site: string, slug: string, ref: string, domain?: string | null) {
  const q = `?ref=${encodeURIComponent(ref)}`;
  return domain ? `https://${domain}/${q}` : `${site.replace(/\/$/, "")}/s/${slug}${q}`;
}
