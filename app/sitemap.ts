import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRoleKey } from "@/lib/supabase/admin";
import { shopForThisHost } from "@/lib/seo-hosts";

export const revalidate = 3600;
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

type P = { id: string; slug?: string | null; image_url: string | null; business_id: string };

/**
 * On a shop's own domain: that shop and its products.
 * On the ZDM ChatCart site: the homepage and every live shop that doesn't have its own domain (those list themselves).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const own = await shopForThisHost();
  const products = async (ids: string[]) => {
    if (!ids.length) return [] as P[];
    let { data, error } = await supabase.from("products").select("id, slug, image_url, business_id").in("business_id", ids).eq("active", true).limit(50000);
    if (error) data = (await supabase.from("products").select("id, image_url, business_id").in("business_id", ids).eq("active", true).limit(50000)).data as any;
    return (data ?? []) as P[];
  };
  const entries = (home: string, list: P[]): MetadataRoute.Sitemap => [
    { url: home, changeFrequency: "daily", priority: 1 },
    ...list.map((p) => ({ url: `${home}/p/${p.slug || p.id}`, changeFrequency: "weekly" as const, priority: 0.8, ...(p.image_url ? { images: [p.image_url] } : {}) })),
  ];

  if (own) {
    const { data: b } = await supabase.from("businesses").select("id").eq("slug", own.slug).maybeSingle();
    return b ? entries(`https://${own.host}`, await products([b.id])) : [];
  }

  const { data: shops } = await supabase.from("businesses").select("id, slug").limit(5000);
  const { data: domains } = await supabase.rpc("active_shop_domains");
  const withDomain = new Set(((domains as any[]) ?? []).map((d) => d.slug));
  // Only shops on a live plan, when we can check (subscriptions are private).
  let live: Set<string> | null = null;
  if (hasServiceRoleKey()) {
    const { data: subs } = await createAdminClient().from("subscriptions").select("business_id").in("status", ["trial", "active", "past_due"]);
    live = new Set((subs ?? []).map((s) => s.business_id));
  }
  const list = (shops ?? []).filter((s) => !withDomain.has(s.slug) && (!live || live.has(s.id)));
  const prods = await products(list.map((s) => s.id));
  const out: MetadataRoute.Sitemap = site() ? [{ url: site(), changeFrequency: "weekly", priority: 1 }] : [];
  for (const s of list) {
    const mine = prods.filter((p) => p.business_id === s.id);
    if (!mine.length) continue; // empty shops aren't worth listing
    out.push(...entries(`${site()}/s/${s.slug}`, mine));
  }
  return out;
}
