import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import ShopClient from "../../ShopClient";
import { loadShop, onOwnDomain } from "../../load";
import { cleanHours, openState } from "@/lib/hours";
import { breadcrumbLd, ldJson, productDescription, productLd, productTitle } from "@/lib/seo";

type Props = { params: Promise<{ slug: string; item: string }>; searchParams: Promise<{ ref?: string }> };

/** A product's own page: the shop with that product open, so it can be found on Google and shared. */
async function find(slug: string, item: string) {
  const data = await loadShop(slug);
  if (!data) return null;
  const product = data.products.find((p: any) => p.slug === item) ?? data.products.find((p: any) => p.id === item);
  return product ? { data, product } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, item } = await params;
  const hit = await find(slug, item);
  if (!hit) return {};
  const { data, product: p } = hit;
  const b = data.business;
  const title = productTitle(p, b), description = productDescription(p, b);
  const url = data.urls.product(p);
  const image = p.image_url || b.hero_image_url || b.logo_url || undefined;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { title, description, url, siteName: b.name, type: "website", images: image ? [{ url: image, alt: p.name }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
    verification: b.google_verification ? { google: b.google_verification } : undefined,
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug, item } = await params;
  const { ref } = await searchParams;
  const hit = await find(slug, item);
  if (!hit) notFound();
  const { data, product: p } = hit;
  const own = onOwnDomain((await headers()).get("host"), data.domain);
  const base = own ? "" : `/s/${slug}`;
  // Old links by id move to the readable address.
  if (p.slug && item !== p.slug) permanentRedirect(`${base}/p/${p.slug}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
  const b: any = data.business;
  const hours = cleanHours(b.hours);
  const open = openState(hours, { closedUntil: b.closed_until, closedNote: b.closed_note });
  const url = data.urls.product(p);
  const ld = [
    { "@context": "https://schema.org", ...productLd(p, b, url) },
    breadcrumbLd([{ name: b.name, url: data.urls.home }, { name: p.name, url }]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <ShopClient business={b} products={data.products as any} attribution={ref ?? null} openNow={open.label ? open : null} best={data.best}
        basePath={base} initialFocus={p.id} />
    </>
  );
}
