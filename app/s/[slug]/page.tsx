import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import ShopClient from "./ShopClient";
import { loadShop, onOwnDomain } from "./load";
import { cleanHours, openState } from "@/lib/hours";
import { ldJson, shopDescription, shopLd, shopTitle } from "@/lib/seo";
import { todayIn } from "@/lib/billing";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string; template?: string; theme?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const data = await loadShop((await params).slug);
  if (!data) return {};
  const sp = await searchParams;
  const b = data.business;
  const image = b.hero_image_url || data.products.find((p: any) => p.image_url)?.image_url || b.logo_url || undefined;
  const title = shopTitle(b), description = shopDescription(b);
  return {
    title: { absolute: title }, description,
    alternates: { canonical: data.urls.home },
    // Look previews from the Website page aren't real pages.
    robots: sp.template || sp.theme ? { index: false, follow: true } : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { title, description, url: data.urls.home, siteName: b.name, type: "website", locale: "en_US", images: image ? [{ url: image, alt: b.name }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
    verification: b.google_verification ? { google: b.google_verification } : undefined,
    other: b.brand_color ? { "theme-color": b.brand_color } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ref, template, theme } = await searchParams;
  const data = await loadShop(slug);
  if (!data) notFound();
  const b: any = data.business;
  const hours = cleanHours(b.hours);
  const open = openState(hours, { closedUntil: b.closed_until, closedNote: b.closed_note });
  const own = onOwnDomain((await headers()).get("host"), data.domain);
  const ld = shopLd(b, { url: data.urls.home, hours, products: data.products, productUrl: data.urls.product });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <ShopClient business={b} products={data.products as any} attribution={ref ?? null} previewTemplate={template ?? null} previewTheme={theme ?? null}
        openNow={open.label ? open : null} best={data.best} basePath={own ? "" : `/s/${slug}`} today={todayIn()} />
    </>
  );
}
